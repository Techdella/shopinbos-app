import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AppState } from "react-native";
import { router } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { signOutWasRequested } from "./auth";
import { clearLaunchCache } from "./launch";
import { supabase } from "./supabase";

interface SessionState {
  session: Session | null;
  loading: boolean;
  /** True when the session ended on its own (expired, or "Log out of all devices" elsewhere). */
  expired: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, loading: true, expired: false });

/** Checks with Supabase that the saved session still exists (it can be revoked from another device). */
async function sessionStillValid() {
  const { error } = await supabase.auth.getUser();
  // Only a definite "no" counts: offline or a server hiccup must not log anyone out.
  return !(error && (error.status === 401 || error.status === 403));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, expired: false });
  const hadSession = useRef(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      hadSession.current = Boolean(data.session);
      setState({ session: data.session, loading: false, expired: false });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Forget the saved Home and launch flags so the next person on this phone starts fresh.
        clearLaunchCache();
        const expired = hadSession.current && !signOutWasRequested();
        hadSession.current = false;
        setState({ session: null, loading: false, expired });
        if (expired) {
          Alert.alert("You've been logged out", "Your session has ended. Log in again to carry on.");
          setTimeout(() => {
            try {
              router.replace("/login");
            } catch {
              // Navigation isn't mounted yet; the launch screen sends signed-out people to Welcome.
            }
          }, 0);
        }
        return;
      }
      hadSession.current = Boolean(session);
      setState({ session, loading: false, expired: false });
    });

    // Coming back to the app: drop a session that was revoked or expired while we were away.
    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active" || !hadSession.current) return;
      void sessionStillValid().then((valid) => {
        if (!valid) void supabase.auth.signOut({ scope: "local" });
      });
    });

    return () => {
      data.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

