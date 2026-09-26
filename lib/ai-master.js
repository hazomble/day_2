import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "./firebase-admin";

const ACTIONS = Object.freeze({
  none: {},
  list_users: {},
  list_courses: {},
  set_course_status: { courseId: "string", status: "draft | published" },
  set_user_access: { uid: "string", disabled: "boolean" },
});

const ACTION_NAMES = Object.keys(ACTIONS);

function messageText(payload) {
  return payload?.choices?.[0]?.message?.content || "";
}

function safeJson(text) {
  const cleaned = String(text).trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

async function callOpenAICompatible({ url, apiKey, model, task, system }) {
  if (!apiKey) return { available: false, summary: "API key is not configured." };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: task }] }),
    });
    if (!response.ok) return { available: false, summary: `Reviewer request failed (${response.status}).` };
    return { available: true, summary: messageText(await response.json()).slice(0, 6000) || "Reviewer returned no text." };
  } catch {
    return { available: false, summary: "Reviewer connection failed." };
  }
}

export async function collectReviews(task) {
  const instruction = "You are a read-only reviewer for an educational platform. Analyze the requested administrative action, point out missing identifiers or risks, and recommend a safe next step. Never invent data, credentials, or actions.";
  const [kimi, glm] = await Promise.all([
    callOpenAICompatible({
      url: "https://api.moonshot.cn/v1/chat/completions",
      apiKey: process.env.KIMI_API_KEY,
      model: process.env.KIMI_MODEL || "kimi-latest",
      task,
      system: instruction,
    }),
    callOpenAICompatible({
      url: "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey: process.env.GLM_API_KEY,
      model: process.env.GLM_MODEL || "glm-4.6",
      task,
      system: instruction,
    }),
  ]);
  return { kimi, glm };
}

function normalizeAction(candidate) {
  const name = candidate?.name;
  if (!ACTION_NAMES.includes(name)) return { name: "none", args: {} };
  const args = candidate?.args && typeof candidate.args === "object" ? candidate.args : {};

  if (name === "set_course_status" && typeof args.courseId === "string" && ["draft", "published"].includes(args.status)) {
    return { name, args: { courseId: args.courseId, status: args.status } };
  }
  if (name === "set_user_access" && typeof args.uid === "string" && typeof args.disabled === "boolean") {
    return { name, args: { uid: args.uid, disabled: args.disabled } };
  }
  if (["list_users", "list_courses", "none"].includes(name)) return { name, args: {} };
  return { name: "none", args: {} };
}

export async function createMasterPlan(task, reviews) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const prompt = `You are the Master AI for Madarek, an educational platform. Decide a single safe action based on the user task and two optional reviewer reports. You MUST return JSON only.\n\nAllowed actions:\n- none: use when details are missing or request is not an existing platform action.\n- list_users\n- list_courses\n- set_course_status with args { courseId: string, status: "draft" | "published" }\n- set_user_access with args { uid: string, disabled: boolean }\n\nNever create users, handle passwords, change roles, or modify source code. All non-read actions require explicit human approval.\n\nUser task:\n${task}\n\nKimi review:\n${reviews.kimi.summary}\n\nGLM review:\n${reviews.glm.summary}\n\nJSON shape:\n{"summary":"Arabic concise plan","reason":"Arabic concise explanation","confidence":0.0,"action":{"name":"none","args":{}},"needsApproval":true}`;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);

  let decision;
  try {
    const payload = await response.json();
    decision = safeJson(payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "");
  } catch {
    throw new Error("Gemini returned an invalid plan.");
  }

  const action = normalizeAction(decision.action);
  return {
    summary: String(decision.summary || "No plan was produced.").slice(0, 1600),
    reason: String(decision.reason || "").slice(0, 1600),
    confidence: Math.max(0, Math.min(1, Number(decision.confidence) || 0)),
    action,
    needsApproval: action.name !== "none",
  };
}

export async function savePlan({ ownerUid, task, reviews, plan }) {
  const { db } = getFirebaseAdmin();
  const ref = db.collection("ai_master_plans").doc();
  await ref.set({
    ownerUid,
    task: task.slice(0, 4000),
    reviews,
    plan,
    status: "pending",
    expiresAtMs: Date.now() + 10 * 60 * 1000,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function executePlan({ planId, ownerUid }) {
  const { auth, db } = getFirebaseAdmin();
  const ref = db.collection("ai_master_plans").doc(planId);
  const planData = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Plan not found.");
    const value = snapshot.data();
    if (value.ownerUid !== ownerUid || value.status !== "pending" || value.expiresAtMs < Date.now()) throw new Error("Plan is expired or cannot be executed.");
    transaction.update(ref, { status: "executed", executedAt: FieldValue.serverTimestamp() });
    return value;
  });

  const { name, args } = normalizeAction(planData.plan.action);
  let result;
  if (name === "list_users") {
    const [users, profiles] = await Promise.all([auth.listUsers(100), db.collection("users").limit(100).get()]);
    const profileByUid = new Map(profiles.docs.map((item) => [item.id, item.data()]));
    result = users.users.map((user) => ({ uid: user.uid, email: user.email || null, displayName: user.displayName || null, role: profileByUid.get(user.uid)?.role || user.customClaims?.role || "student", disabled: user.disabled || profileByUid.get(user.uid)?.disabled === true }));
  } else if (name === "list_courses") {
    const courses = await db.collection("courses").limit(100).get();
    result = courses.docs.map((item) => ({ id: item.id, title: item.data().title || "Untitled course", status: item.data().status || "draft", instructorId: item.data().instructorId || null }));
  } else if (name === "set_course_status") {
    const course = db.collection("courses").doc(args.courseId);
    if (!(await course.get()).exists) throw new Error("Course not found.");
    await course.update({ status: args.status, updatedAt: FieldValue.serverTimestamp() });
    result = { courseId: args.courseId, status: args.status };
  } else if (name === "set_user_access") {
    await auth.updateUser(args.uid, { disabled: args.disabled });
    if (args.disabled) await auth.revokeRefreshTokens(args.uid);
    await db.collection("users").doc(args.uid).set({ disabled: args.disabled, updatedAt: FieldValue.serverTimestamp(), accessChangedAt: FieldValue.serverTimestamp(), accessChangedBy: "gemini-master" }, { merge: true });
    result = { uid: args.uid, disabled: args.disabled };
  } else {
    throw new Error("This plan has no executable action.");
  }

  await db.collection("audit_logs").add({ action: "ai_master.executed", actor: ownerUid, source: "gemini-master", planId, tool: name, createdAt: FieldValue.serverTimestamp() });
  return { action: name, result };
}
