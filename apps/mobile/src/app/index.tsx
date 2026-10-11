import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, type Href } from "expo-router";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { OnboardingStatus } from "@/lib/onboarding";
import { colors } from "@/theme";

// Decides where a launch lands: welcome (signed out), onboarding (mid-setup) or home.
export default function Gate() {
  const { session, loading } = useSession();
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;
    api<OnboardingStatus>("/api/app/onboarding")
      .then((status) => {
        if (cancelled) return;
        if (status.finished) setTarget("/home");
        else if (status.store.live) setTarget("/onboarding/live");
        else setTarget(status.memory?.screen && status.memory.screen !== "chat" ? `/onboarding/${status.memory.screen}` : "/onboarding");
      })
      .catch((error) => {
        if (cancelled) return;
        // 403: supplier, logistics or admin accounts. Home explains where to go.
        setTarget(error instanceof ApiError && error.status === 401 ? "/welcome" : "/home");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, session]);

  if (!loading && !session) return <Redirect href="/welcome" />;
  if (target) return <Redirect href={target} />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}
