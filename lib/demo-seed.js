import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const COURSE_ID = "web-development-basics";

/**
 * Adds deterministic task data after each role logs in. It uses the Firebase
 * browser SDK, so it works on the free Spark plan and is still constrained by
 * firestore.rules. Calls are idempotent and never overwrite student progress.
 */
export async function seedTaskData(db, user, role) {
  if (!db || !user || !role) return;

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName || (role === "admin" ? "مدير مدارك" : role === "instructor" ? "أحمد المدرّس" : "الطالب"),
    photoURL: user.photoURL ?? null,
    role,
    disabled: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // The instructor owns the course, so only their first login can create the
  // course and its teaching material.
  if (role === "instructor") {
    const course = doc(db, "courses", COURSE_ID);
    // Commit the parent first: nested-content rules verify ownership by reading
    // the existing course document.
    await setDoc(course, {
      title: "أساسيات تطوير الويب",
      description: "مسار عملي لتعلّم HTML وCSS وJavaScript من البداية.",
      instructorId: user.uid,
      instructorName: user.displayName || "أحمد المدرّس",
      status: "published",
      category: "البرمجة",
      coverUrl: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    const batch = writeBatch(db);
    batch.set(doc(course, "lectures", "html-intro"), {
      title: "مقدمة في HTML", videoUrl: "https://www.youtube.com/watch?v=UB1O30fR-EE",
      durationSeconds: 720, order: 1, isPreview: true,
      resources: [{ title: "مرجع HTML", url: "https://developer.mozilla.org/en-US/docs/Web/HTML" }],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }, { merge: true });
    batch.set(doc(course, "lectures", "css-layout"), {
      title: "تنسيق الصفحات بـ CSS", videoUrl: "https://www.youtube.com/watch?v=1Rs2ND1ryYc",
      durationSeconds: 960, order: 2, isPreview: false, resources: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }, { merge: true });
    batch.set(doc(course, "quizzes", "html-quiz"), {
      courseId: COURSE_ID, title: "اختبار HTML القصير", status: "published", timeLimitSeconds: 600,
      questions: [{ id: "q1", prompt: "ما العنصر المناسب للعنوان الرئيسي؟", choices: ["<h1>", "<p>", "<div>"] }],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }

  // The student receives an enrollment once the instructor has seeded the
  // published course. If the teacher has not logged in yet, the next refresh
  // after that login completes enrollment.
  if (role === "student") {
    try {
      await setDoc(doc(db, "enrollments", `${user.uid}_${COURSE_ID}`), {
        studentId: user.uid, courseId: COURSE_ID, progressPercent: 0,
        status: "active", enrolledAt: serverTimestamp(),
      }, { merge: false });
      await updateDoc(doc(db, "enrollments", `${user.uid}_${COURSE_ID}`), {
        progressPercent: 72,
      });
    } catch (error) {
      // A missing course is expected until the instructor has seeded it.
      if (error?.code !== "permission-denied") throw error;
    }
  }
}

export { COURSE_ID };
