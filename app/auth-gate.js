"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { AuthProvider, useAuth } from "./auth-provider";
import LearningDashboard from "./learning-dashboard";

function LoginPanel() {
  const { configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demo, setDemo] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // The dashboard is rendered at the same route. A refresh guarantees the
      // persisted Firebase session is picked up even if the dev hot-reloader
      // was holding an older client bundle.
      window.location.reload();
    } catch (loginError) {
      const code = loginError?.code;
      if (code === "auth/too-many-requests") {
        setError("تم إيقاف المحاولات مؤقتًا من Firebase. انتظر بضع دقائق ثم حاول مرة أخرى.");
      } else if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      } else if (code === "auth/operation-not-allowed") {
        setError("فعّل Email/Password من Firebase Authentication → Sign-in method.");
      } else {
        setError("تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.");
      }
      setSubmitting(false);
    }
  }

  if (demo) return <LearningDashboard demo />;

  return <main className="auth-page"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">م</span><span>مدارك</span></div><span className="auth-kicker">منصة التعلّم الذكية</span><h1>مرحبًا بعودتك</h1><p>سجّل دخولك للوصول إلى مسارك التعليمي.</p>
    {configured ? <form onSubmit={submit}><label>البريد الإلكتروني<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" disabled={submitting} /></label><label>كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength="6" autoComplete="current-password" disabled={submitting} /></label>{error && <div className="form-error">{error}</div>}<button className="login-button" type="submit" disabled={submitting}>{submitting ? "جارٍ تسجيل الدخول…" : <>تسجيل الدخول <span>←</span></>}</button></form> : <div className="setup-note"><strong>Firebase غير مُعدّ بعد.</strong><p>أضف متغيرات البيئة الموجودة في <code>.env.local.example</code> إلى ملف <code>.env.local</code> ثم أعد تشغيل التطبيق.</p><button className="outline-button" onClick={() => setDemo(true)}>فتح العرض التجريبي</button></div>}</section></main>;
}

function ProtectedApp() {
  const { loading, user, role, disabled, signOut } = useAuth();

  if (loading) return <main className="auth-page"><div className="loading-card">جارٍ التحقق من حسابك…</div></main>;
  if (!user || disabled) return <LoginPanel />;
  if (!role) return <LoginPanel />;
  return <LearningDashboard user={user} role={role} onSignOut={signOut} />;
}

export default function AuthGate() {
  return <AuthProvider><ProtectedApp /></AuthProvider>;
}
