# مدارك — منصة تعليمية آمنة بـ Firebase

واجهة Next.js التعليمية موجودة في `app/`، مع Firebase Authentication وFirestore وCloud Functions. لا تمنح الواجهة أي صلاحيات؛ المصدر الوحيد للصلاحية هو Firebase ID token وقواعد Firestore.

## المخطط المعماري

```text
Next.js client ── Firebase Auth ── ID token (Custom Claims)
      │                         │
      ├── Firestore SDK ────────┴── Firestore Rules ── Firestore
      └── Callable Functions ────── Admin SDK ──────── Auth + Firestore
```

- `app/auth-provider.js`: يقرأ `getIdTokenResult()` عبر `onIdTokenChanged` ويستخرج الدور من claims.
- `app/auth-gate.js`: حاجز المسارات للواجهة.
- `functions/index.js`: عمليات مميّزة بالـ Admin SDK: إنشاء مستخدم، إسناد دور، وتعطيل حساب. لا تقبل القواعد كتابة claims أو ملف المستخدم من العميل.
- `firestore.rules`: سياسة التنفيذ الفعلية، وتشمل فحص `users/{uid}.disabled` في كل وصول محمي.

### وضع المهمة الحالي

لا يتطلب هذا العرض تأكيد البريد أو Cloud Functions أو خطة مدفوعة. الأدوار معرّفة محليًا في `app/auth-provider.js` للحسابات التجريبية التالية:

| الحساب | الدور |
| --- | --- |
| `mag65@gmail.com` | Admin |
| `ah555@gmail.com` | Instructor |
| `al12003@gmail.com` | Student |

حسابات العرض تستخدم Firebase Authentication فعليًا. عند أول دخول ينشئ التطبيق تلقائيًا profile للمستخدم في Firestore؛ وعند دخول المعلم لأول مرة يضيف دورة منشورة ومحاضرتين واختبارًا. يدخل الطالب بعدها مرة أخرى لإنشاء enrollment تلقائيًا. قواعد Firestore تربط كل دور بالبريد المقابل، لذلك لا يستطيع حساب الطالب الكتابة كمعلّم ضمن نطاق الحسابات الثلاثة.

> هذا التعيين بالبريد مناسب للمهمة فقط. عند تحويل المشروع إلى نسخة حقيقية، احذف خريطة العرض واستخدم Custom Claims وقواعد Firestore كما هو موضح أدناه.

## نموذج البيانات

```ts
type Role = "admin" | "instructor" | "student";
type CourseStatus = "draft" | "published";

interface User {
  uid: string; email: string | null; displayName: string | null;
  photoURL: string | null; role: Role; disabled: boolean;
  updatedAt: FirebaseFirestore.Timestamp;
  lastRoleChangedAt: FirebaseFirestore.Timestamp;
  lastRoleChangedBy: string;
}

interface Course {
  title: string; description: string; instructorId: string;
  status: CourseStatus; coverUrl?: string; category?: string;
  createdAt: FirebaseFirestore.Timestamp; updatedAt: FirebaseFirestore.Timestamp;
}

// /courses/{courseId}/lectures/{lectureId}
interface Lecture {
  title: string; videoUrl: string; durationSeconds: number; order: number;
  isPreview: boolean; resources: { title: string; url: string }[];
  createdAt: FirebaseFirestore.Timestamp; updatedAt: FirebaseFirestore.Timestamp;
}

// /courses/{courseId}/quizzes/{quizId}; لا تضع correctAnswer هنا إطلاقًا.
interface Quiz {
  courseId: string; title: string; status: CourseStatus; timeLimitSeconds: number;
  questions: { id: string; prompt: string; choices: string[] }[];
  createdAt: FirebaseFirestore.Timestamp; updatedAt: FirebaseFirestore.Timestamp;
}

// document ID = `${studentId}_${courseId}`
interface Enrollment {
  studentId: string; courseId: string; progressPercent: number;
  status: "active" | "cancelled"; enrolledAt: FirebaseFirestore.Timestamp;
}

// document ID = `${studentId}_${quizId}`; يحتسب التقييم في Function فقط.
interface QuizSubmission {
  studentId: string; courseId: string; quizId: string;
  answers: Record<string, string>; status: "submitted";
  submittedAt: FirebaseFirestore.Timestamp;
  score?: never; maxScore?: never; percentage?: never;
}
```

مفاتيح الإجابة تُحفظ منفصلة في `/courses/{courseId}/quizAnswerKeys/{quizId}` ولا يقرأها العميل. عند الحاجة إلى عدة محاولات، أضف `attemptNo` للبيانات واستبدل معرّف المستند الثابت بمعرّف يولّده Cloud Function بعد تطبيق حدّ المحاولات.

## الأدوار وCustom Claims

يحمل الـ ID token claims متنافية: `{ role, admin, instructor, student }`. الدوال فقط هي التي تستدعي `setCustomUserClaims`، لذلك لا يمكن للمتصفح رفع دوره. بعد أي تعديل على الدور، تستدعي الدالة `revokeRefreshTokens`؛ وعلى العميل نفّذ `getIdToken(true)` (موجود في `refreshClaims`) قبل إعادة حساب الدور.

الدوال القابلة للاستدعاء:

- `provisionStudent()`: يمنح المستخدم الدور الأدنى `student` عند استخدام Cloud Functions في نسخة الإنتاج.
- `createPlatformUser({ email, password, displayName, role })`: للـ admin فقط؛ ينشئ Auth user وملف Firestore وسجل تدقيق.
- `setPlatformUserRole({ uid, role })`: للـ admin فقط؛ يغير claims ويسجل العملية.
- `setPlatformUserDisabled({ uid, disabled })`: للـ admin فقط؛ يعطّل Auth، يلغي refresh tokens، ويمنع Rules الوصول فورًا من خلال `disabled`.

لا تُرجع الدوال كلمات مرور أو رموزًا. ولإرسال رسالة تحقق عند إنشاء مستخدم، أضف مزود بريد موثوقًا (Extension أو وظيفة خادمية)؛ Auth client يمكنه استخدام `sendEmailVerification` للحساب الحالي فقط.

## صلاحيات Firestore

قواعد [firestore.rules](./firestore.rules) تطبق التالي:

- Admin موثق ونشط: وصول كامل.
- Instructor: ينشئ/يعدل محتوى الدورات التي يطابق `instructorId` فيها UID فقط، ويرى طلابها وتسليماتهم.
- Student: يرى الدورات المنشورة؛ يرى المحاضرات التمهيدية أو محتوى الدورة المسجل بها؛ ينشئ enrollment لنفسه ويزيد تقدمه فقط؛ وينشئ تسليمًا واحدًا لنفسه بلا درجة من العميل.
- إجابات الاختبارات ودرجاتها لا تُعطى للمتصفح. Function موثوق فقط يحسب الدرجة ويكتب حقولها.

عند querying من SDK، أضف دائمًا القيود التي تتطلبها القاعدة (مثل `where("studentId", "==", auth.currentUser.uid)`)؛ Firestore يرفض query قد تعيد وثيقة غير مسموح بها.

## الإعداد والتشغيل

1. انسخ `.env.local.example` إلى `.env.local` واملأ متغيرات `NEXT_PUBLIC_FIREBASE_*` من إعدادات Web app في Firebase. لا تضع service-account في هذا الملف أو في المتصفح.
2. من Firebase Console فعّل Email/Password وFirestore. نسخة المهمة تستخدم الأدوار الثابتة الثلاثة ولا تحتاج Admin SDK أو خطة مدفوعة.
3. انشر قواعد Firestore (أو الصق الملف في Firebase Console):

```bash
firebase deploy --only firestore:rules
```

4. شغّل الواجهة:

```bash
npm run dev
```

لتشغيل Functions محليًا استخدم Firebase Emulator Suite. انشر الفهارس المطلوبة عندما تضيف استعلامات مركّبة (مثلاً `courseId + status + enrolledAt`).

## نشر Firebase وVercel

1. في Firebase Console أنشئ **Cloud Firestore Database** في وضع Production، ثم الصق محتوى `firestore.rules` في تبويب Rules وانشره. هذا متاح ضمن Spark المجاني.
2. سجّل دخول `ah555@gmail.com` مرة واحدة أولًا لتُنشأ الدورة والمحاضرات والاختبار، ثم سجّل دخول `al12003@gmail.com` لإنشاء enrollment. دخول `mag65@gmail.com` ينشئ profile المدير.
3. ارفع المشروع إلى GitHub ثم استورده في Vercel. يقرأ Vercel إعداد [vercel.json](./vercel.json) تلقائيًا.
4. أضف المتغيرات الستة من `.env.local` إلى **Vercel → Project → Settings → Environment Variables** لكل من Production وPreview. لا ترفع ملف `.env.local` إلى Git.
5. في Firebase Console افتح **Authentication → Settings → Authorized domains** وأضف نطاق Vercel الذي ظهر بعد النشر (مثل `your-project.vercel.app`).
