import { useEffect, useState } from "react";
import { Redirect, type Href } from "expo-router";
import { LaunchView } from "@/components/Loading";
import { api, ApiError } from "@/lib/api";
import { onboardingFinished, rememberOnboardingFinished, rememberStoreName } from "@/lib/launch";
import { useSession } from "@/lib/session";
import type { OnboardingStatus } from "@/lib/onboarding";

/** Past this, stop waiting for the onboarding check and let Home handle the slow network. */
const CHECK_TIMEOUT_MS = 8000;

// Decides where a launch lands: welcome (signed out), onboarding (mid-setup) or home.
// Shows the launch screen (same as the native splash) while it decides.
export default function Gate() {
  const { session, loading } = useSession();
  const uid = session?.user.id;
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    if (loading || !uid) return;
    // Sellers who finished onboarding on this phone go straight to Home; it loads its own data.
    if (onboardingFinished(uid)) {
      setTarget("/home");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    api<OnboardingStatus>("/api/app/onboarding", { signal: controller.signal })
      .then((status) => {
        if (cancelled) return;
        rememberStoreName(uid, status.store.name);
        if (status.finished) {
          rememberOnboardingFinished(uid);
          setTarget("/home");
        } else if (status.store.live) setTarget("/onboarding/live");
        else setTarget(status.memory?.screen && status.memory.screen !== "chat" ? `/onboarding/${status.memory.screen}` : "/onboarding");
      })
      .catch((error) => {
        if (cancelled) return;
        // 403: supplier, logistics or admin accounts. Home explains where to go.
        // Network trouble: Home shows the slow-network screen and keeps retrying.
        setTarget(error instanceof ApiError && error.status === 401 ? "/welcome" : "/home");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [loading, uid]);

  if (!loading && !session) return <Redirect href="/welcome" />;
  if (target) return <Redirect href={target} />;
  return <LaunchView />;
}
