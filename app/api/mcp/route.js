import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getFirebaseAdmin } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_NEW_ROLES = ["instructor", "student"];
const jsonHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function textResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function roleClaims(role) {
  return {
    role,
    admin: role === "admin",
    instructor: role === "instructor",
    student: role === "student",
  };
}

function safeUser(user, profile = {}) {
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || profile.displayName || null,
    role: profile.role || user.customClaims?.role || "student",
    disabled: user.disabled || profile.disabled === true,
  };
}

function hasValidToken(request) {
  const expected = process.env.MCP_API_TOKEN;
  const authorizationHeader = request.headers.get("authorization");
  const prefix = "Bearer ";
  // Claude Chat's custom-connector form only accepts an endpoint URL. It does
  // not provide a field for arbitrary Bearer headers, so a user can also put a
  // high-entropy MCP key in the private connector URL. Keep header support for
  // other MCP clients (Claude Desktop, inspectors, scripts).
  const received = authorizationHeader?.startsWith(prefix)
    ? authorizationHeader.slice(prefix.length)
    : new URL(request.url).searchParams.get("mcp_key");

  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function writeAuditLog(db, action, details) {
  await db.collection("audit_logs").add({
    action,
    actor: "remote-mcp",
    source: "vercel",
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function createServer() {
  const server = new McpServer({
    name: "madarek-platform-admin",
    version: "1.0.0",
  });

  server.registerTool(
    "platform_status",
    { description: "Check whether the secure Madarek platform MCP endpoint can reach Firebase." },
    async () => {
      const { db } = getFirebaseAdmin();
      await db.collection("users").limit(1).get();
      return textResult({ ok: true, service: "Madarek Firebase administration" });
    },
  );

  server.registerTool(
    "list_users",
    {
      description: "List platform users with their role and disabled status. Passwords and tokens are never returned.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
    },
    async ({ limit }) => {
      const { auth, db } = getFirebaseAdmin();
      const [authUsers, profiles] = await Promise.all([
        auth.listUsers(limit),
        db.collection("users").limit(limit).get(),
      ]);
      const profilesByUid = new Map(profiles.docs.map((item) => [item.id, item.data()]));
      return textResult({ users: authUsers.users.map((user) => safeUser(user, profilesByUid.get(user.uid))) });
    },
  );

  server.registerTool(
    "list_courses",
    {
      description: "List courses and their publication status, instructor UID, and title.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
    },
    async ({ limit }) => {
      const { db } = getFirebaseAdmin();
      const snapshot = await db.collection("courses").limit(limit).get();
      return textResult({
        courses: snapshot.docs.map((item) => ({
          id: item.id,
          title: item.data().title || "Untitled course",
          status: item.data().status || "draft",
          instructorId: item.data().instructorId || null,
        })),
      });
    },
  );

  server.registerTool(
    "create_platform_user",
    {
      description: "Create a new Firebase Email/Password user as a student or instructor, then initialise their role profile.",
      inputSchema: {
        email: z.string().email(),
        password: z.string().min(6).max(128),
        displayName: z.string().trim().min(2).max(80),
        role: z.enum(ALLOWED_NEW_ROLES),
      },
    },
    async ({ email, password, displayName, role }) => {
      const { auth, db } = getFirebaseAdmin();
      const user = await auth.createUser({ email, password, displayName, emailVerified: false });

      try {
        await auth.setCustomUserClaims(user.uid, roleClaims(role));
        await db.collection("users").doc(user.uid).set({
          uid: user.uid,
          email: user.email,
          displayName,
          role,
          disabled: false,
          createdBy: "remote-mcp",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastRoleChangedAt: FieldValue.serverTimestamp(),
          lastRoleChangedBy: "remote-mcp",
        });
        await writeAuditLog(db, "user.created", { uid: user.uid, email: user.email, role });
      } catch (error) {
        // Avoid leaving an Auth account whose profile or claims failed to be created.
        await auth.deleteUser(user.uid).catch(() => undefined);
        throw error;
      }

      return textResult({ created: true, user: safeUser(user, { role, disabled: false }) });
    },
  );

  server.registerTool(
    "set_user_access",
    {
      description: "Disable or re-enable a user. Disabling revokes refresh tokens and blocks Firestore access through the profile flag.",
      inputSchema: {
        uid: z.string().min(1).max(128),
        disabled: z.boolean(),
      },
    },
    async ({ uid, disabled }) => {
      const { auth, db } = getFirebaseAdmin();
      const user = await auth.updateUser(uid, { disabled });
      if (disabled) await auth.revokeRefreshTokens(uid);
      await db.collection("users").doc(uid).set({
        disabled,
        updatedAt: FieldValue.serverTimestamp(),
        accessChangedAt: FieldValue.serverTimestamp(),
        accessChangedBy: "remote-mcp",
      }, { merge: true });
      await writeAuditLog(db, "user.access_changed", { uid, disabled });
      return textResult({ updated: true, user: safeUser(user, { disabled }) });
    },
  );

  server.registerTool(
    "set_course_status",
    {
      description: "Publish or unpublish an existing course by its Firestore document ID.",
      inputSchema: {
        courseId: z.string().min(1).max(128),
        status: z.enum(["draft", "published"]),
      },
    },
    async ({ courseId, status }) => {
      const { db } = getFirebaseAdmin();
      const courseRef = db.collection("courses").doc(courseId);
      const course = await courseRef.get();
      if (!course.exists) throw new Error("Course not found.");
      await courseRef.update({ status, updatedAt: FieldValue.serverTimestamp() });
      await writeAuditLog(db, "course.status_changed", { courseId, status });
      return textResult({ updated: true, courseId, status });
    },
  );

  return server;
}

function withCors(response) {
  const headers = new Headers(response.headers);
  Object.entries(jsonHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleMcp(request) {
  if (!hasValidToken(request)) {
    return Response.json({ error: "Unauthorized MCP request." }, { status: 401, headers: jsonHeaders });
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } catch (error) {
    console.error("MCP request failed", error);
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }, { status: 500, headers: jsonHeaders });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export async function POST(request) {
  return handleMcp(request);
}

export async function GET(request) {
  return handleMcp(request);
}

export async function DELETE(request) {
  return handleMcp(request);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
