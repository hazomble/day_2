"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "../auth-provider";

function MasterConsole() {
  const router = useRouter();
  const { loading, user, role } = useAuth();
  const [task, setTask] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(path, body) {
    if (!user) throw new Error("سجّل دخول الأدمن أولًا.");
    const token = await user.getIdToken();
    const response = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذّر تنفيذ الطلب.");
    return payload;
  }

  async function makePlan(event) {
    event.preventDefault();
    setError("");
    setData(null);
    setBusy(true);
    try { setData(await call("/api/ai/plan", { task })); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function execute() {
    if (!data?.planId || !window.confirm("هل توافق على تنفيذ هذه العملية على Firebase؟")) return;
    setError("");
    setBusy(true);
    try {
      const execution = await call("/api/ai/execute", { planId: data.planId });
      setData((current) => ({ ...current, execution }));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="ai-console"><p>جارٍ التحقق من الجلسة…</p></main>;
  if (!user || role !== "admin") return <main className="ai-console"><section className="ai-shell"><h1>لوحة Gemini Master</h1><p>هذه الصفحة متاحة لحساب الأدمن فقط.</p><button onClick={() => router.push("/")}>العودة للمنصة</button></section></main>;

  const action = data?.plan?.action;
  return <main className="ai-console"><section className="ai-shell"><div className="ai-top"><div><span>Gemini Master</span><h1>مساعد إدارة منصة مدارك</h1><p>Gemini يحسم القرار بعد مراجعة اختيارية من Kimi وGLM. لا يوجد تنفيذ قبل موافقتك.</p></div><button onClick={() => router.push("/")}>لوحة الإدارة</button></div>
    <form onSubmit={makePlan} className="ai-form"><label>اكتب المهمة الإدارية<input value={task} onChange={(event) => setTask(event.target.value)} placeholder="مثال: اعرض كل الدورات المنشورة" required minLength="5" disabled={busy} /></label><button disabled={busy}>{busy ? "جارٍ التحليل…" : "حلّل المهمة"}</button></form>
    {error && <p className="ai-error">{error}</p>}
    {data && <section className="ai-result"><div className="ai-status">الخطة جاهزة للمراجعة</div><h2>{data.plan.summary}</h2><p>{data.plan.reason}</p><dl><div><dt>الأداة المقترحة</dt><dd>{action.name}</dd></div><div><dt>الثقة</dt><dd>{Math.round(data.plan.confidence * 100)}%</dd></div></dl>{action.name !== "none" && !data.execution && <button className="ai-execute" onClick={execute} disabled={busy}>تأكيد وتنفيذ العملية</button>}{data.execution && <pre>{JSON.stringify(data.execution, null, 2)}</pre>}
      <details><summary>ملخص مراجعة Kimi وGLM</summary><p><b>Kimi:</b> {data.reviews.kimi.summary}</p><p><b>GLM:</b> {data.reviews.glm.summary}</p></details>
    </section>}
  </section></main>;
}

export default function AiAdminPage() {
  return <AuthProvider><MasterConsole /></AuthProvider>;
}
