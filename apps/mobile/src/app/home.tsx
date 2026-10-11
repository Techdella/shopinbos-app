import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkButton, Mascot, PillButton, T, Wordmark } from "@/components/ui";
import { api, API_URL, ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import type { OnboardingStatus } from "@/lib/onboarding";
import { colors } from "@/theme";

// Placeholder seller home until the seller app dashboard (next design phase) lands.
export default function Home() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [notSeller, setNotSeller] = useState(false);

  useEffect(() => {
    api<OnboardingStatus>("/api/app/onboarding")
      .then(setStatus)
      .catch((error) => setNotSeller(error instanceof ApiError && error.status === 403));
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22 }}>
      <View style={{ paddingTop: 10 }}><Wordmark /></View>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
        <Mascot name="peggyWave" size={140} />
        {notSeller ? (
          <>
            <T weight="extrabold" style={{ fontSize: 26, textAlign: "center" }}>This app is for sellers</T>
            <T style={{ color: colors.inkSoft, textAlign: "center", lineHeight: 21 }}>Supplier, delivery and admin portals are on the web for now.</T>
            <PillButton title="Open Shopinbos on the web" onPress={() => void WebBrowser.openBrowserAsync(API_URL)} style={{ alignSelf: "stretch", marginTop: 12 }} />
          </>
        ) : (
          <>
            <T weight="extrabold" style={{ fontSize: 26, textAlign: "center" }}>{status ? status.store.name : "Your shop"}</T>
            <T style={{ color: colors.inkSoft, textAlign: "center", lineHeight: 21 }}>Your full dashboard is coming to the app next. Until then, orders and products live on the web.</T>
            <PillButton title="Open my dashboard" onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/home`)} style={{ alignSelf: "stretch", marginTop: 12 }} />
            {status && <PillButton title="Finish setting up" tone="white" size="md" onPress={() => router.push("/onboarding/checklist")} style={{ alignSelf: "stretch" }} />}
          </>
        )}
      </View>
      <LinkButton title="Log out" color={colors.inkSoft} style={{ marginBottom: 8 }} onPress={() => void signOut().then(() => router.replace("/welcome"))} />
    </SafeAreaView>
  );
}
