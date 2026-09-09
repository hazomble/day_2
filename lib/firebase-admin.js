import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// This module is server-only. Do not import it from a Client Component and do
// not prefix either environment variable with NEXT_PUBLIC_.
function readServiceAccount() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!rawServiceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  }

  try {
    return JSON.parse(rawServiceAccount);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.");
  }
}

// Initialise lazily so `next build` succeeds without production secrets.
// The secret is only required when an MCP tool is actually called.
export function getFirebaseAdmin() {
  const app = getApps()[0] || initializeApp({ credential: cert(readServiceAccount()) });

  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
