import { getApp, getApps, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// A missing configuration must never silently connect the app to a different project.
export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const app = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app, "us-central1") : null;

// Creates a Firebase Auth account without replacing the administrator's active
// session. The caller must still create the protected Firestore role profile.
export async function createTaskAuthUser(email, password) {
  if (!firebaseConfigured) throw new Error("firebase-not-configured");
  const appName = "task-user-creator";
  const secondaryApp = getApps().find((item) => item.name === appName) || initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    return credential.user;
  } finally {
    await signOut(secondaryAuth);
  }
}
