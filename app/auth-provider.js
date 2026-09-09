"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "../lib/firebase";
import { seedTaskData } from "../lib/demo-seed";

const AuthContext = createContext(null);

// Task/demo mode: these accounts are intentionally mapped locally so the
// assignment can demonstrate three dashboards without Custom Claims, billing,
// Cloud Functions deployment, or email verification. Real deployments must
// remove this map and use the server-created claims below.
const TASK_DEMO_ROLES = Object.freeze({
  "mag65@gmail.com": "admin",
  "ah555@gmail.com": "instructor",
  "al12003@gmail.com": "student",
});

function roleFromClaims(claims) {
  if (claims.admin === true) return "admin";
  if (claims.instructor === true) return "instructor";
  if (claims.student === true) return "student";
  return null;
}

function roleForTask(user, claims) {
  return roleFromClaims(claims) || TASK_DEMO_ROLES[user.email?.toLowerCase()] || null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ loading: firebaseConfigured, user: null, role: null, disabled: false });

  useEffect(() => {
    if (!auth || !db) return undefined;

    return onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setSession({ loading: false, user: null, role: null, disabled: false });
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        let disabled = false;
        let profileRole = null;
        try {
          const profile = await getDoc(doc(db, "users", user.uid));
          disabled = profile.exists() && profile.data().disabled === true;
          profileRole = profile.exists() ? profile.data().role : null;
        } catch {
          // Fixed task accounts receive their profile just below.
        }
        const role = roleForTask(user, token.claims) || profileRole;
        if (role && TASK_DEMO_ROLES[user.email?.toLowerCase()]) {
          try { await seedTaskData(db, user, role); } catch (seedError) { console.warn("Task data could not be seeded", seedError.code); }
        }

        // The Firestore profile makes an access revocation effective immediately.
        if (disabled) await signOut(auth);
        setSession({ loading: false, user, role, disabled });
      } catch {
        setSession({ loading: false, user: null, role: null, disabled: false, error: "تعذّر التحقق من الجلسة." });
      }
    });
  }, []);

  const value = useMemo(() => ({
    ...session,
    configured: firebaseConfigured,
    signOut: () => auth ? signOut(auth) : Promise.resolve(),
    // Call this after a callable Function changes custom claims. The new ID
    // token is fetched before the local role state is updated.
    refreshClaims: async () => {
      const currentUser = auth?.currentUser;
      if (!currentUser) return null;
      const token = await currentUser.getIdTokenResult(true);
      setSession((previous) => ({
        ...previous,
        loading: false,
        user: currentUser,
        role: roleForTask(currentUser, token.claims),
      }));
      return token;
    },
  }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
