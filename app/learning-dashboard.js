"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { createTaskAuthUser, db } from "../lib/firebase";

const people = {
  admin: { name: "محمود", title: "مدير المنصة", badge: "صلاحيات كاملة" },
  instructor: { name: "د. أحمد", title: "المعلّم", badge: "إدارة المحتوى" },
  student: { name: "أحمد علي", title: "الطالب", badge: "مسار التعلّم" },
};

function listenerError(notify) {
  return (error) => {
    console.warn("Firestore listener rejected", error.code);
    notify("لا تملك صلاحية هذه البيانات بعد. انشر أحدث Firestore Rules ثم حدّث الصفحة.");
  };
}

function AppFrame({ role, onSignOut, children }) {
  const person = people[role];
  const [notice, setNotice] = useState("");
  const notify = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }, []);
  return <main className={"role-app " + role}>
    <aside className="role-sidebar">
      <div className="role-logo"><span>م</span> مدارك</div>
      <div className="role-person"><b>{person.name}</b><small>{person.title}</small></div>
      <nav>
        <button className="selected" onClick={() => notify("أنت في لوحة التحكم")}>⌂ الرئيسية</button>
        <button onClick={() => notify(role === "admin" ? "إدارة المستخدمين" : role === "instructor" ? "دوراتي التعليمية" : "دوراتي المسجّلة")}>▣ {role === "admin" ? "المستخدمون" : "الدورات"}</button>
        <button onClick={() => notify(role === "student" ? "سجل الإنجازات" : "التقارير والإحصاءات")}>◫ التقارير</button>
      </nav>
      <button className="role-signout" onClick={onSignOut}>⇥ تسجيل الخروج</button>
    </aside>
    <section className="role-content">
      <header className="role-header"><div><b>{person.name}</b><span>{person.badge}</span></div><button onClick={() => notify("لا توجد إشعارات جديدة")}>♧ الإشعارات</button></header>
      <div className="role-page">{children({ notify })}</div>
    </section>
    {notice && <div className="role-toast">✓ {notice}</div>}
  </main>;
}

function AdminDashboard({ notify }) {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", displayName: "", role: "student" });
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!db) return undefined;
    const stopUsers = onSnapshot(collection(db, "users"), (snapshot) => setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), listenerError(notify));
    const stopCourses = onSnapshot(collection(db, "courses"), (snapshot) => setCourses(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), listenerError(notify));
    return () => { stopUsers(); stopCourses(); };
  }, [notify]);
  async function toggleUser(target) {
    try {
      await updateDoc(doc(db, "users", target.id), { disabled: !target.disabled, updatedAt: serverTimestamp() });
      notify(target.disabled ? "تم تفعيل الحساب" : "تم تعطيل الحساب فورًا");
    } catch { notify("تعذر تحديث الحساب. تحقق من قواعد Firestore."); }
  }
  async function toggleCourse(course) {
    try {
      const nextStatus = course.status === "published" ? "draft" : "published";
      await updateDoc(doc(db, "courses", course.id), { status: nextStatus, updatedAt: serverTimestamp() });
      notify(nextStatus === "published" ? "تم نشر الدورة للطلاب" : "تم إخفاء الدورة من الطلاب");
    } catch { notify("تعذر تغيير حالة الدورة."); }
  }
  async function createUser(event) {
    event.preventDefault();
    if (!newUser.email.trim() || newUser.password.length < 6) {
      notify("أدخل بريدًا صحيحًا وكلمة مرور من 6 أحرف على الأقل");
      return;
    }
    setCreating(true);
    try {
      const created = await createTaskAuthUser(newUser.email.trim(), newUser.password);
      await setDoc(doc(db, "users", created.uid), {
        uid: created.uid, email: created.email, displayName: newUser.displayName.trim() || created.email,
        role: newUser.role, disabled: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setShowCreateUser(false);
      setNewUser({ email: "", password: "", displayName: "", role: "student" });
      notify("تم إنشاء الحساب وتحديد دوره بنجاح");
    } catch (error) {
      if (error?.code === "auth/email-already-in-use") notify("هذا البريد مسجل بالفعل.");
      else if (error?.code === "auth/weak-password") notify("كلمة المرور ضعيفة؛ استخدم 6 أحرف على الأقل.");
      else notify("تعذر إنشاء الحساب. تحقق من إعدادات Firebase.");
    } finally { setCreating(false); }
  }
  return <><section className="role-hero admin-hero"><p>لوحة الإدارة</p><h1>مرحبًا محمود، كل المنصة بين يديك</h1><span>تابع المستخدمين، المحتوى، والبيانات من مكان واحد.</span><div className="hero-actions"><button onClick={() => notify("قائمة المستخدمين بالأسفل")}>إدارة المستخدمين</button><button className="light" onClick={() => notify("لا توجد مخالفات تحتاج مراجعة")}>المراجعة</button></div></section>
    <section className="stat-grid"><article><b>{users.length}</b><span>حسابات مسجلة</span></article><article><b>{courses.length}</b><span>دورات منشورة</span></article><article><b>صلاحيات</b><span>قراءة وكتابة كاملة</span></article><article><b>Live</b><span>بيانات Firebase مباشرة</span></article></section>
    <section className="panel"><div className="panel-title"><div><h2>إدارة المستخدمين</h2><p>تعطيل وتفعيل الحسابات المسجّلة مباشرة من Firestore.</p></div><button onClick={() => setShowCreateUser(true)}>+ مستخدم جديد</button></div>
      <div className="user-list">{users.length ? users.map((account) => <div key={account.id}><span className="user-avatar">{(account.displayName || account.email || "?").charAt(0)}</span><b>{account.displayName || "مستخدم"}</b><small>{account.email}</small><em>{account.role}</em><button onClick={() => toggleUser(account)}>{account.disabled ? "تفعيل" : "تعطيل"}</button></div>) : <p>سجّل دخول كل حساب مرة واحدة ليظهر هنا.</p>}</div>
    </section>
    <section className="panel"><div className="panel-title"><div><h2>إدارة المحتوى</h2><p>المدير يمكنه نشر أو إخفاء أي دورة، مهما كان صاحبها.</p></div></div>
      <div className="user-list">{courses.length ? courses.map((course) => <div key={course.id}><span className="user-avatar admin-avatar">▣</span><b>{course.title}</b><small>{course.status === "published" ? "منشورة للطلاب" : "مسودة مخفية"}</small><em>{course.status}</em><button onClick={() => toggleCourse(course)}>{course.status === "published" ? "إخفاء" : "نشر"}</button></div>) : <p>لا توجد دورات منشورة بعد.</p>}</div>
    </section>
    {showCreateUser && <div className="modal-backdrop" onMouseDown={() => !creating && setShowCreateUser(false)}><form className="create-user-modal" onSubmit={createUser} onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setShowCreateUser(false)}>×</button><span>إدارة المنصة</span><h2>إضافة مستخدم جديد</h2><p>سيتم إنشاء حساب Firebase وتحديد لوحة الدخول تلقائيًا.</p><label>الاسم الظاهر<input value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} placeholder="مثال: د. سارة" /></label><label>البريد الإلكتروني<input type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} placeholder="name@example.com" required /></label><label>كلمة المرور<input type="password" minLength="6" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} placeholder="6 أحرف على الأقل" required /></label><label>دور المستخدم<select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="student">طالب</option><option value="instructor">دكتور / معلّم</option></select></label><button className="create-user-submit" disabled={creating}>{creating ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}</button></form></div>}
    </>;
}

function InstructorDashboard({ notify, user }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [lectureTitle, setLectureTitle] = useState("");
  const [quizTitle, setQuizTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [lectures, setLectures] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  useEffect(() => {
    if (!db || !user) return undefined;
    return onSnapshot(query(collection(db, "courses"), where("instructorId", "==", user.uid)), (snapshot) => {
      const nextCourses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setCourses(nextCourses);
      setSelectedCourseId((previous) => previous || nextCourses[0]?.id || "");
    }, listenerError(notify));
  }, [notify, user]);
  useEffect(() => {
    if (!db || !selectedCourseId) return undefined;
    const stopLectures = onSnapshot(collection(db, "courses", selectedCourseId, "lectures"), (snapshot) => setLectures(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), listenerError(notify));
    const stopQuizzes = onSnapshot(collection(db, "courses", selectedCourseId, "quizzes"), (snapshot) => setQuizzes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), listenerError(notify));
    return () => { stopLectures(); stopQuizzes(); };
  }, [notify, selectedCourseId]);
  async function createCourse(event) {
    event.preventDefault();
    if (!courseTitle.trim() || !db || !user) return;
    setSaving(true);
    try {
      const courseRef = doc(collection(db, "courses"));
      await setDoc(courseRef, {
        title: courseTitle.trim(), description: "دورة تعليمية جديدة أنشأها المعلّم.",
        instructorId: user.uid, instructorName: user.displayName || user.email,
        status: "published", category: "عام", coverUrl: "",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setCourseTitle("");
      setSelectedCourseId(courseRef.id);
      notify("تم إنشاء الدورة ونشرها للطلاب");
    } catch { notify("تعذر إنشاء الدورة. تحقق من قواعد Firestore."); } finally { setSaving(false); }
  }
  async function addLecture(event) {
    event.preventDefault();
    if (!lectureTitle.trim() || !db || !selectedCourseId) return notify("أنشئ أو اختر دورة أولًا");
    setSaving(true);
    try {
      await setDoc(doc(db, "courses", selectedCourseId, "lectures", "lecture-" + Date.now()), {
        title: lectureTitle.trim(), videoUrl: "https://www.youtube.com/", durationSeconds: 600,
        order: 3, isPreview: false, resources: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setLectureTitle("");
      notify("تمت إضافة المحاضرة إلى Firestore");
    } catch { notify("تعذرت الإضافة. تأكد أن قواعد Firestore منشورة."); } finally { setSaving(false); }
  }
  async function addQuiz(event) {
    event.preventDefault();
    if (!quizTitle.trim() || !db || !selectedCourseId) return notify("أنشئ أو اختر دورة أولًا");
    setSaving(true);
    try {
      await setDoc(doc(db, "courses", selectedCourseId, "quizzes", "quiz-" + Date.now()), {
        courseId: selectedCourseId, title: quizTitle.trim(), status: "published", timeLimitSeconds: 300,
        questions: [{ id: "q1", prompt: "سؤال تجريبي", choices: ["الإجابة الأولى", "الإجابة الثانية"] }],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setQuizTitle("");
      notify("تم نشر الاختبار في Firestore");
    } catch { notify("تعذر نشر الاختبار. تأكد من الصلاحيات."); } finally { setSaving(false); }
  }
  return <><section className="role-hero teacher-hero"><p>لوحة المعلّم</p><h1>أهلًا {user?.displayName || "د. أحمد"} 👋</h1><span>أنشئ دوراتك، ثم أضف محاضرات واختبارات خاصة بكل دورة.</span><div className="hero-actions"><button onClick={() => document.getElementById("create-course")?.focus()}>+ إنشاء دورة</button><button className="light" onClick={() => document.getElementById("add-lecture")?.focus()}>+ إضافة محتوى</button></div></section>
    <section className="stat-grid teacher-stats"><article><b>{courses.length}</b><span>دوراتي المنشورة</span></article><article><b>{lectures.length}</b><span>محاضرات بالدورة المختارة</span></article><article><b>{quizzes.length}</b><span>اختبارات منشورة</span></article><article><b>Live</b><span>بيانات Firestore مباشرة</span></article></section>
    <section className="teacher-workspace"><article className="panel"><h2>إنشاء دورة جديدة</h2><p>تنشأ باسمك وتصبح متاحة للطلاب فورًا.</p><form onSubmit={createCourse}><input id="create-course" value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} placeholder="عنوان الدورة" required /><button disabled={saving}>إنشاء الدورة</button></form></article>
      <article className="panel"><h2>الدورة التي تعمل عليها</h2><p>اختر إحدى دوراتك لإضافة المحتوى لها.</p><select className="course-select" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}><option value="">اختر دورة</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></article></section>
    <section className="teacher-workspace"><article className="panel"><h2>إضافة محاضرة</h2><p>ستظهر للطلاب المسجلين في الدورة المختارة.</p><form onSubmit={addLecture}><input id="add-lecture" value={lectureTitle} onChange={(event) => setLectureTitle(event.target.value)} placeholder="عنوان المحاضرة الجديدة" required /><button disabled={saving}>نشر المحاضرة</button></form></article>
      <article className="panel"><h2>إنشاء اختبار</h2><p>أضف اختبارًا قصيرًا لهذه الدورة.</p><form onSubmit={addQuiz}><input id="add-quiz" value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} placeholder="عنوان الاختبار" required /><button disabled={saving}>نشر الاختبار</button></form></article></section>
    <section className="panel"><div className="panel-title"><div><h2>محتوى الدورة المنشور</h2><p>كل العناصر التالية يتم قراءتها مباشرة من Firestore.</p></div><button onClick={() => notify("يمكنك إضافة محاضرة أو اختبار من الأعلى")}>تحديث</button></div><div className="user-list">{lectures.map((lecture) => <div key={lecture.id}><span className="user-avatar teacher-avatar">▶</span><b>{lecture.title}</b><small>{lecture.isPreview ? "معاينة مجانية" : "للطلاب المسجلين"}</small><em>محاضرة</em></div>)}{quizzes.map((quiz) => <div key={quiz.id}><span className="user-avatar admin-avatar">?</span><b>{quiz.title}</b><small>{quiz.timeLimitSeconds / 60} دقائق</small><em>اختبار</em></div>)}</div></section></>;
}

function StudentDashboard({ notify, user }) {
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [progress, setProgress] = useState(0);
  const [opening, setOpening] = useState(false);
  const [lectures, setLectures] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  useEffect(() => {
    if (!db || !user) return undefined;
    const stopCourses = onSnapshot(query(collection(db, "courses"), where("status", "==", "published")), (snapshot) => {
      const nextCourses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setCourses(nextCourses);
    }, listenerError(notify));
    const stopEnrollments = onSnapshot(query(collection(db, "enrollments"), where("studentId", "==", user.uid)), (snapshot) => {
      const nextEnrollments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setEnrollments(nextEnrollments);
      setSelectedCourseId((previous) => previous || nextEnrollments[0]?.courseId || "");
      if (nextEnrollments[0]) setProgress(nextEnrollments[0].progressPercent || 0);
    }, listenerError(notify));
    return () => { stopCourses(); stopEnrollments(); };
  }, [notify, user]);
  useEffect(() => {
    if (!db || !selectedCourseId) return undefined;
    const stopLectures = onSnapshot(collection(db, "courses", selectedCourseId, "lectures"), (snapshot) => setLectures(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), listenerError(notify));
    const stopQuizzes = onSnapshot(collection(db, "courses", selectedCourseId, "quizzes"), (snapshot) => setQuizzes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), listenerError(notify));
    return () => { stopLectures(); stopQuizzes(); };
  }, [notify, selectedCourseId]);
  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const enrolledCourseIds = new Set(enrollments.map((item) => item.courseId));
  async function enroll(course) {
    if (!db || !user) return;
    try {
      await setDoc(doc(db, "enrollments", user.uid + "_" + course.id), {
        studentId: user.uid, courseId: course.id, progressPercent: 0,
        status: "active", enrolledAt: serverTimestamp(),
      });
      setSelectedCourseId(course.id);
      setProgress(0);
      notify("تم التسجيل في الدورة بنجاح");
    } catch { notify("تعذر التسجيل في الدورة."); }
  }
  async function continueLearning() {
    if (!selectedCourseId) return notify("سجّل في دورة أولًا");
    setOpening(true);
    try {
      const nextProgress = Math.min(progress + 15, 100);
      if (db && user) await updateDoc(doc(db, "enrollments", user.uid + "_" + selectedCourseId), { progressPercent: nextProgress });
      setProgress(nextProgress);
      notify("تم حفظ تقدمك في Firebase. الدرس التالي: CSS");
    } catch { notify("تم فتح الدرس. انشر قواعد Firestore لحفظ التقدم."); } finally { setOpening(false); }
  }
  async function submitQuiz() {
    if (!selectedAnswer || !db || !user || !selectedCourseId || !quizzes[0]) return notify("اختر إجابة أولًا");
    try {
      await setDoc(doc(db, "quiz_submissions", user.uid + "_" + quizzes[0].id), {
        studentId: user.uid, courseId: selectedCourseId, quizId: quizzes[0].id,
        answers: { q1: selectedAnswer }, status: "submitted", submittedAt: serverTimestamp(),
      });
      notify("تم تسليم إجابتك بنجاح");
    } catch { notify("تم تسليم هذا الاختبار من قبل أو لا تملك صلاحية الوصول."); }
  }
  return <><section className="role-hero student-hero"><p>مسار التعلّم</p><h1>صباح الخير، {user?.displayName || "أحمد"} 👋</h1><span>{selectedCourse ? "تتابع الآن: " + selectedCourse.title : "استكشف الدورات المنشورة وسجّل في الدورة المناسبة لك."}</span><div className="progress-box"><div><span>تقدمك في الدورة</span><b>{progress}%</b></div><i><em style={{ width: progress + "%" }} /></i></div><div className="hero-actions"><button onClick={continueLearning} disabled={opening}>{opening ? "جارٍ الحفظ…" : "متابعة التعلّم"}</button></div></section>
    <section className="panel"><div className="panel-title"><div><h2>استكشف الدورات</h2><p>الدورات المنشورة بواسطة جميع المعلّمين.</p></div></div><div className="course-browser">{courses.length ? courses.map((course) => <article key={course.id}><span>▣</span><div><b>{course.title}</b><small>المعلّم: {course.instructorName || "معلّم المنصة"}</small></div>{enrolledCourseIds.has(course.id) ? <button onClick={() => setSelectedCourseId(course.id)}>فتح الدورة</button> : <button onClick={() => enroll(course)}>سجّل الآن</button>}</article>) : <p>لا توجد دورات منشورة حتى الآن.</p>}</div></section>
    <section className="lesson-layout"><article className="panel"><h2>محاضرات الدورة</h2>{lectures.length ? lectures.map((lecture, index) => <div className="lesson-item" key={lecture.id}><span>{index + 1}</span><div><b>{lecture.title}</b><small>{Math.round(lecture.durationSeconds / 60)} دقيقة · {lecture.isPreview ? "متاح كمعاينة" : "متاح للطلاب المسجلين"}</small></div><button onClick={lecture.isPreview ? () => notify("تم فتح المعاينة") : continueLearning}>{lecture.isPreview ? "معاينة" : "ابدأ الدرس"}</button></div>) : <p>لم ينشر المعلم محاضرات بعد.</p>}</article>
      <article className="panel quiz-card"><span>✦ اختبار قصير</span><h2>{quizzes[0]?.title || "لا يوجد اختبار بعد"}</h2><p>{quizzes[0] ? "اختر إجابة ثم سلّم الاختبار." : "سيظهر اختبار هنا عندما ينشره المعلّم."}</p>{quizzes[0] && <><select value={selectedAnswer} onChange={(event) => setSelectedAnswer(event.target.value)}><option value="">اختر إجابة</option>{(quizzes[0].questions?.[0]?.choices || []).map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select><button onClick={submitQuiz}>تسليم الإجابة</button></>}</article></section>
    <section className="panel achievement"><span>🏆</span><div><h2>إنجاز رائع!</h2><p>أكملت أكثر من ثلثي الدورة. استمر بهذا الأداء.</p></div><b>{progress}%</b></section></>;
}

export default function LearningDashboard({ user, role = "student", onSignOut }) {
  return <AppFrame role={role} onSignOut={onSignOut}>{({ notify }) => {
    if (role === "admin") return <AdminDashboard notify={notify} />;
    if (role === "instructor") return <InstructorDashboard notify={notify} user={user} />;
    return <StudentDashboard notify={notify} user={user} />;
  }}</AppFrame>;
}
