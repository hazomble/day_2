"use client";

import { useMemo, useState } from "react";

const courses = [
  { id: 1, title: "أساسيات تطوير الويب", mentor: "أحمد سامي", progress: 72, lessons: "12 من 16 درس", tone: "blue", icon: "</>" },
  { id: 2, title: "تصميم تجربة المستخدم", mentor: "سارة علي", progress: 38, lessons: "5 من 13 درس", tone: "orange", icon: "✦" },
  { id: 3, title: "مبادئ تحليل البيانات", mentor: "محمد وليد", progress: 16, lessons: "2 من 14 درس", tone: "purple", icon: "⌁" },
];

const navItems = [["⌂", "الرئيسية"], ["▣", "دوراتي"], ["◎", "استكشف"], ["▤", "التقارير"]];

export default function LearningDashboard() {
  const [activeNav, setActiveNav] = useState("الرئيسية");
  const [activeCourse, setActiveCourse] = useState(1);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const shownCourses = useMemo(() => courses.filter((course) => course.title.includes(search.trim())), [search]);

  function showToast(message) { setToast(message); window.setTimeout(() => setToast(""), 2400); }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">م</span><span>مدارك</span></div>
      <nav className="side-nav" aria-label="القائمة الرئيسية">
        {navItems.map(([icon, label]) => <button className={`nav-item ${activeNav === label ? "active" : ""}`} key={label} onClick={() => { setActiveNav(label); showToast(`تم الانتقال إلى ${label}`); }}><span>{icon}</span>{label}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => showToast("مركز المساعدة متاح دائمًا")}><span>?</span>المساعدة</button>
        <button className="nav-item" onClick={() => showToast("تم تسجيل الخروج من العرض التجريبي")}><span>⇥</span>تسجيل الخروج</button>
        <div className="mini-profile"><div className="avatar avatar-small">م</div><div><strong>محمود حسن</strong><small>متعلّم</small></div><span className="dots">•••</span></div>
      </div>
    </aside>
    <section className="content-area">
      <header className="topbar">
        <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن دورة أو موضوع..." /></label>
        <div className="top-actions"><div className="notifications-wrap"><button className="icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="الإشعارات">♧<i /></button>{notificationsOpen && <div className="notification-popover"><strong>لديك إشعاران جديدان</strong><p>أكمل درس JavaScript لتتابع تقدمك.</p><p>تم نشر واجب جديد في دورة UX.</p></div>}</div><button className="profile-button" onClick={() => showToast("حسابك الشخصي")}>محمود <span className="avatar">م</span></button></div>
      </header>
      <div className="page-content">
        <section className="welcome-row"><div><p className="eyebrow">الثلاثاء، ٢ سبتمبر</p><h1>صباح الخير، محمود <span>👋</span></h1><p className="subtle">لنُنجز خطوة جديدة نحو أهدافك اليوم.</p></div><button className="outline-button" onClick={() => showToast("سيتم فتح سجل إنجازاتك")}>عرض إنجازاتي <span>←</span></button></section>
        <section className="hero-card"><div className="hero-copy"><span className="pill">استمر في التعلّم</span><h2>أساسيات تطوير الويب</h2><p>تبقّى لك ٤ دروس فقط لإتمام هذه الدورة.</p><div className="hero-progress"><div><span>تقدّمك</span><b>٧٢٪</b></div><div className="progress-track"><i style={{ width: "72%" }} /></div></div><button className="primary-button" onClick={() => showToast("تم فتح الدرس: التعامل مع DOM")}>متابعة التعلّم <span>←</span></button></div><div className="hero-art" aria-hidden="true"><div className="code-window"><div className="window-dots"><i /><i /><i /></div><code><em>const</em> future = <br />&nbsp; build(<b>&quot;today&quot;</b>);</code></div><div className="shape shape-one" /><div className="shape shape-two" /></div></section>
        <section className="section-heading"><div><h2>دوراتي الحالية</h2><p>تابع من حيث توقفت.</p></div><button onClick={() => { setActiveNav("دوراتي"); showToast("كل الدورات قيد التحضير"); }}>عرض الكل <span>←</span></button></section>
        <section className="course-grid">{shownCourses.map((course) => <article className={`course-card ${activeCourse === course.id ? "selected" : ""}`} key={course.id}><div className={`course-art ${course.tone}`}><span>{course.icon}</span><div className="art-orb" /></div><div className="course-body"><div className="course-title-row"><h3>{course.title}</h3><button aria-label="المزيد" onClick={() => showToast(`خيارات ${course.title}`)}>•••</button></div><p>{course.mentor}</p><div className="course-progress-label"><span>{course.lessons}</span><b>{course.progress}٪</b></div><div className="progress-track thin"><i style={{ width: `${course.progress}%` }} /></div><button className="continue-link" onClick={() => { setActiveCourse(course.id); showToast(`تم اختيار ${course.title}`); }}>متابعة <span>←</span></button></div></article>)}</section>
        {!shownCourses.length && <p className="empty">لا توجد دورات مطابقة لبحثك.</p>}
        <section className="lower-grid"><article className="activity-card"><div className="section-heading compact"><div><h2>النشاط الأخير</h2><p>آخر ما أنجزته في دوراتك.</p></div><button onClick={() => showToast("كل الأنشطة")}>عرض الكل <span>←</span></button></div><div className="activity"><span className="activity-icon blue">✓</span><div><strong>أتممت درس: مقدمة في HTML</strong><p>أساسيات تطوير الويب · منذ ساعتين</p></div><b className="score">+١٠ نقاط</b></div><div className="activity"><span className="activity-icon orange">✦</span><div><strong>بدأت دورة: تصميم تجربة المستخدم</strong><p>منذ يوم واحد</p></div></div></article><article className="goal-card"><span className="goal-icon">♨</span><h3>أنت على المسار الصحيح!</h3><p>أكملت ٣ من ٥ أهداف لهذا الأسبوع.</p><div className="goal-dots"><i className="done" /><i className="done" /><i className="done" /><i /><i /></div><button onClick={() => showToast("تم فتح أهداف الأسبوع")}>عرض الأهداف <span>←</span></button></article></section>
      </div>
    </section>
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}
