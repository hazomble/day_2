import { getFirebaseAdmin } from "./firebase-admin";

export async function requireMasterAdmin(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication is required.");
  const { auth, db } = getFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token);
  const profile = await db.collection("users").doc(decoded.uid).get();
  const isAdmin = decoded.admin === true || decoded.email?.toLowerCase() === "mag65@gmail.com" || profile.data()?.role === "admin";
  if (!isAdmin || profile.data()?.disabled === true) throw new Error("Administrator access is required.");
  return { uid: decoded.uid, email: decoded.email || null };
}
