// SIMULATED demo authentication — a session cookie, no backend user table, no
// password storage. Any credentials work; the cookie survives refresh for 7 days.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

const COOKIE = "scopos_session";
const MAX_AGE = 7 * 24 * 3600;

function readCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === `${COOKIE}=1`);
}

type AuthState = { ready: boolean; signedIn: boolean; signIn: () => void; signOut: () => void };
const AuthCtx = createContext<AuthState>({ ready: false, signedIn: false, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(readCookie()); setReady(true); }, []);
  const signIn = () => {
    document.cookie = `${COOKIE}=1; path=/; max-age=${MAX_AGE}; samesite=lax`;
    setSignedIn(true);
  };
  const signOut = () => {
    document.cookie = `${COOKIE}=; path=/; max-age=0`;
    setSignedIn(false);
  };
  return <AuthCtx.Provider value={{ ready, signedIn, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}

/** Wrap protected route components. Redirects to the landing page when no session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, signedIn } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !signedIn) navigate({ to: "/" });
  }, [ready, signedIn, navigate]);
  if (!ready || !signedIn) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }
  return <>{children}</>;
}
