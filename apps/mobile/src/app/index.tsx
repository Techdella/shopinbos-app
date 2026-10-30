import { useEffect, useState } from "react";
import { Redirect, type Href } from "expo-router";
import { LaunchView } from "@/components/Loading";
import { api, ApiError } from "@/lib/api";
import { onboardingFinished, rememberOnboardingFinished, rememberStoreName } from "@/lib/launch";
import { useSession } from "@/lib/session";
import type { OnboardingStatus } from "@/lib/onboarding";
import { homeFor } from "@/lib/partner-pure";
import { riderToken } from "@/lib/rider";
import { useRole } from "@/lib/role";

/** Past this, stop waiting for the onboarding check and let Home handle the slow network. */
const CHECK_TIMEOUT_MS = 8000;

// Decides where a launch lands: welcome (signed out), the Riders app (a rider's saved link), the supplier or
// delivery partner tabs, or for sellers onboarding (mid-setup) or home.
// Shows the launch screen (same as the native splash) while it decides.
export default function Gate() {
  const { session, loading } = useSession();
  const { role } = useRole();
  const uid = session?.user.id;
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    if (loading || !uid || role !== "seller") return;
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
        }
        // Not finished: the guided build (onboarding/index.tsx) picks up where they left off, from the saved answers.
        else setTarget("/onboarding");
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
  }, [loading, uid, role]);

  if (!loading && !session) return <Redirect href={riderToken() ? "/rider" : "/welcome"} />;
  if (role && role !== "seller") return <Redirect href={homeFor(role) as Href} />;
  if (target) return <Redirect href={target} />;
  return <LaunchView />;
}
