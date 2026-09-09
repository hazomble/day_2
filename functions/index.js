const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

initializeApp();

const auth = getAuth();
const db = getFirestore();
const roles = new Set(["admin", "instructor", "student"]);

function claimsFor(role) {
  return {
    role,
    admin: role === "admin",
    instructor: role === "instructor",
    student: role === "student",
  };
}

async function writeProfile(uid, user, role, actorId) {
  await db.doc(`users/${uid}`).set({
    uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    role,
    disabled: false,
    updatedAt: FieldValue.serverTimestamp(),
    lastRoleChangedAt: FieldValue.serverTimestamp(),
    lastRoleChangedBy: actorId,
  }, { merge: true });
}

// Safe self-service provisioning: a browser can only assign itself the lowest role.
exports.provisionStudent = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "سجّل الدخول أولًا.");
  }

  const user = await auth.getUser(request.auth.uid);
  const currentRole = user.customClaims?.role;
  if (currentRole) return { role: currentRole, alreadyProvisioned: true };

  await auth.setCustomUserClaims(user.uid, claimsFor("student"));
  await writeProfile(user.uid, user, "student", user.uid);
  await db.collection("audit_logs").add({
    type: "STUDENT_SELF_PROVISIONED",
    actorId: user.uid,
    targetUserId: user.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info("Student provisioned", { uid: user.uid });
  return { role: "student", alreadyProvisioned: false };
});

// Creates an Auth account and its profile in one privileged operation. This is
// intentionally admin-only: browsers must never be able to set arbitrary roles.
exports.createPlatformUser = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.token.admin) {
    throw new HttpsError("permission-denied", "Administrator role required.");
  }

  const { email, password, displayName = null, role = "student" } = request.data ?? {};
  if (typeof email !== "string" || typeof password !== "string" ||
      password.length < 6 || !roles.has(role)) {
    throw new HttpsError("invalid-argument", "Provide a valid email, a password of at least 6 characters, and a valid role.");
  }

  let createdUser;
  try {
    createdUser = await auth.createUser({
      email: email.trim().toLowerCase(),
      password,
      displayName: typeof displayName === "string" ? displayName.trim() || null : null,
      emailVerified: false,
    });
    await auth.setCustomUserClaims(createdUser.uid, claimsFor(role));
    await writeProfile(createdUser.uid, createdUser, role, request.auth.uid);
    await db.collection("audit_logs").add({
      type: "USER_CREATED",
      actorId: request.auth.uid,
      targetUserId: createdUser.uid,
      role,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error("Unable to create platform user", { code: error.code, actorId: request.auth.uid });
    throw new HttpsError("internal", "Unable to create the user.");
  }

  // Do not return tokens or credentials from a callable function.
  return { uid: createdUser.uid, email: createdUser.email, role };
});

// Administrative role changes. Only an existing admin claim can invoke this.
exports.setPlatformUserRole = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.token.admin) {
    throw new HttpsError("permission-denied", "يلزم دور المدير.");
  }

  const { uid, role } = request.data ?? {};
  if (typeof uid !== "string" || !roles.has(role)) {
    throw new HttpsError("invalid-argument", "أرسل uid ودورًا صالحًا.");
  }
  if (uid === request.auth.uid && role !== "admin") {
    throw new HttpsError("failed-precondition", "لا يمكن للمدير إزالة دور المدير من حسابه.");
  }

  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, claimsFor(role));
  await auth.revokeRefreshTokens(uid);
  await writeProfile(uid, user, role, request.auth.uid);
  await db.collection("audit_logs").add({
    type: "ROLE_CHANGED",
    actorId: request.auth.uid,
    targetUserId: uid,
    role,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// Disablement is a separate, auditable action. The Firestore `disabled` flag
// blocks access in rules immediately; revoking refresh tokens limits stale
// client sessions as well.
exports.setPlatformUserDisabled = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.token.admin) {
    throw new HttpsError("permission-denied", "Administrator role required.");
  }
  const { uid, disabled } = request.data ?? {};
  if (typeof uid !== "string" || typeof disabled !== "boolean") {
    throw new HttpsError("invalid-argument", "Provide uid and disabled.");
  }
  if (uid === request.auth.uid && disabled) {
    throw new HttpsError("failed-precondition", "An administrator cannot disable their own account.");
  }

  await auth.updateUser(uid, { disabled });
  if (disabled) await auth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).update({
    disabled,
    updatedAt: FieldValue.serverTimestamp(),
    disabledChangedAt: FieldValue.serverTimestamp(),
    disabledChangedBy: request.auth.uid,
  });
  await db.collection("audit_logs").add({
    type: disabled ? "USER_DISABLED" : "USER_ENABLED",
    actorId: request.auth.uid,
    targetUserId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
