import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Confetti } from "@/components/Celebrate";
import { LinkButton, PillButton, T } from "@/components/ui";
import { StorePreview } from "@/components/store-editor/StorePreview";
import { useT } from "@/lib/i18n";
import { finishOnboarding } from "@/lib/onboarding";
import { sharePost } from "@/lib/familiar-share";
import { patchSetup } from "@/lib/setup";
import { fetchOnboarding, track, type OnboardingState } from "@/lib/seller-onboarding";
import { shownHost } from "@/lib/store-editor";
import { colors, fonts, surfaceCard } from "@/theme";

// E3 "Ada's Hair is live! Rex built 4 pages for you." (design RB-16, the same moment as F-Seller-02-live): confetti,
// the real shop in a card (the store editor's StorePreview), Share on WhatsApp Status as the main button, Edit it
// myself (the store editor) and Ask Rex (the editor's Rex sheet). Then Home, where the three-tip tour and "Get your
// shop ready" take over.

export default function Launched() {
  const t = useT("m_rexBuild");
  const params = useLocalSearchParams<{ url?: string; pages?: string }>();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [sharing, setSharing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    void fetchOnboarding().then(setState).catch(() => null);
  }, []);

  const name = state?.store?.name ?? "";
  const url = params.url || state?.store?.url || "";
  const pages = Number(params.pages) || state?.flow.builtPages || 0;
  const redesign = state?.flow.mode === "redesign";

  async function shareStatus() {
    setSharing(true);
    track("share_tapped", { channel: "whatsapp_status" });
    try {
      const shared = await sharePost({ imageUrl: state?.flow.banner?.url ?? null, caption: t("live.shareText", { name, url }), target: "whatsapp_status", title: name });
      if (shared) void patchSetup({ type: "shared" }).catch(() => null);
    } finally {
      setSharing(false);
    }
  }

  /** Onboarding is done: Home, with the three tips the first time (F1–F3) and the "Get your shop ready" list. */
  async function leave(next?: { pathname: "/store-editor"; params?: { sheet: string } }) {
    setLeaving(true);
    await finishOnboarding(true).catch(() => null);
    router.replace({ pathname: "/home", params: { tour: "1" } });
    if (next) router.push(next);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Confetti />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 18 }} edges={["top", "bottom"]}>
        <View style={{ alignItems: "center", gap: 8, paddingTop: 24 }}>
          <T style={{ fontSize: 56 }} accessibilityElementsHidden importantForAccessibility="no">🎉</T>
          <T accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, textAlign: "center", letterSpacing: -0.6 }}>{t("live.title", { name })}</T>
          <T style={{ fontSize: 16, lineHeight: 23, color: colors.inkSoft, textAlign: "center" }}>
            {redesign ? t("live.redesigned") : pages === 1 ? t("live.subOne") : t("live.sub", { count: pages || 4 })} <T weight="extrabold" selectable style={{ color: colors.ink, fontSize: 16 }}>{shownHost(url)}</T>
          </T>
        </View>
        <View style={{ ...surfaceCard(28), flex: 1, marginTop: 20, marginBottom: 16, padding: 10, maxHeight: 420 }}>
          {url ? <StorePreview url={url} accessibilityLabel={name} style={{ flex: 1, borderRadius: 20 }} /> : null}
        </View>
        <View style={{ gap: 10, paddingBottom: 6 }}>
          <PillButton tone="accent" icon="share" title={t("live.status")} busy={sharing} onPress={() => void shareStatus()} testID="live-status" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PillButton tone="white" icon="palette" title={t("live.edit")} disabled={leaving} style={{ flex: 1 }} onPress={() => void leave({ pathname: "/store-editor" })} testID="live-edit" />
            <PillButton tone="white" icon="sparkle" title={t("live.ask")} disabled={leaving} style={{ flex: 1 }} onPress={() => void leave({ pathname: "/store-editor", params: { sheet: "rex" } })} testID="live-ask" />
          </View>
          <LinkButton testID="live-home" title={t("live.home")} onPress={() => void leave()} />
        </View>
      </SafeAreaView>
    </View>
  );
}
