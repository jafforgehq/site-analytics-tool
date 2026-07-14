import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/query-client";

export type AssuranceLevel = "aal1" | "aal2";

/**
 * Where the user is in the auth + MFA journey. Guards key off this so that
 * protected data is never rendered while the state is still unresolved.
 *
 *  loading           – still resolving session / MFA / admin
 *  signed-out        – no session
 *  needs-mfa-setup   – signed in, but no verified TOTP factor yet
 *  needs-mfa-verify  – signed in with a verified factor, session still aal1
 *  not-admin         – aal2 session, but not in private.admin_users
 *  ready             – aal2 + admin: full dashboard access
 */
export type AuthStatus =
  | "loading"
  | "signed-out"
  | "needs-mfa-setup"
  | "needs-mfa-verify"
  | "not-admin"
  | "ready";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  currentLevel: AssuranceLevel | null;
  /** Re-resolve session/MFA/admin (call after enroll/verify/unenroll). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [currentLevel, setCurrentLevel] = useState<AssuranceLevel | null>(null);
  // Guards against a slow resolve overwriting a newer one.
  const resolveSeq = useRef(0);

  const resolve = useCallback(async () => {
    const seq = ++resolveSeq.current;
    const apply = (next: {
      status: AuthStatus;
      session: Session | null;
      level: AssuranceLevel | null;
    }) => {
      if (seq !== resolveSeq.current) return; // a newer resolve won
      setSession(next.session);
      setCurrentLevel(next.level);
      setStatus(next.status);
    };

    const {
      data: { session: current },
    } = await supabase.auth.getSession();

    if (!current) {
      apply({ status: "signed-out", session: null, level: null });
      return;
    }

    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const level = (aal?.currentLevel ?? "aal1") as AssuranceLevel;

    if (level !== "aal2") {
      // nextLevel === 'aal2' means a verified factor exists → challenge it;
      // otherwise the user must enroll one first.
      const needsVerify = aal?.nextLevel === "aal2";
      apply({
        status: needsVerify ? "needs-mfa-verify" : "needs-mfa-setup",
        session: current,
        level,
      });
      return;
    }

    // aal2 - confirm the user is an authorized admin.
    const { data: isAdmin, error } = await supabase.rpc("is_portfolio_admin");
    apply({
      status: error || !isAdmin ? "not-admin" : "ready",
      session: current,
      level,
    });
  }, []);

  useEffect(() => {
    let active = true;
    void resolve();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Never await supabase calls directly inside this callback (deadlock);
      // defer the re-resolve to a fresh tick.
      if (active) setTimeout(() => void resolve(), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [resolve]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    // onAuthStateChange will fire, but set state eagerly for snappy UX.
    setSession(null);
    setCurrentLevel(null);
    setStatus("signed-out");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        user: session?.user ?? null,
        currentLevel,
        refresh: resolve,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
