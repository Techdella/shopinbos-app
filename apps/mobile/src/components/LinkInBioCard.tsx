import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Eyebrow } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { bioCardState, type BioPage } from "@/lib/paylinks-pure";
import { shareText } from "@/lib/share";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Home's "Link in bio" card: the seller's one link for their Instagram, TikTok and WhatsApp bio, with Copy and Share,
// and Edit (app/link-in-bio.tsx). Before the page is saved: "Set it up", the onboarding step (onboarding/bio.tsx)
// opened from Home. The page comes from GET /api/app/bio, loaded with Home's other extras; hidden until it loads (or
// when it can't), so Home never waits for it.

export function LinkInBioCard({ page, shopName }: { page: BioPage | null; shopName: string }) {
  const t = useT("m_home");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const state = bioCardState(page);
  if (state.kind === "loading") return null;

  async function copy(url: string) {
    await Clipboard.setStringAsync(url).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <View style={{ gap: 10 }} testID="home-link-in-bio">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Eyebrow>{t("linkBio.title")}</Eyebrow>
        {state.kind !== "setup" ? (
          <Pressable testID="home-link-in-bio-edit" accessibilityRole="link" onPress={() => router.push("/link-in-bio")} hitSlop={8} style={{ minHeight: 32, justifyContent: "center" }}>
            <T weight="bold" style={{ fontSize: 14, color: colors.accentInk }}>{t("linkBio.edit")}</T>
          </Pressable>
        ) : null}
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }}>
        {state.kind === "setup" ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="link" size={20} color={colors.forest} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 16 }}>{t("linkBio.setupTitle")}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("linkBio.setupSub")}</T>
              </View>
            </View>
            <PillButton testID="home-link-in-bio-setup" size="md" title={t("linkBio.setup")} onPress={() => router.push({ pathname: "/onboarding/bio", params: { from: "home" } })} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: state.kind === "live" ? colors.mintTint : colors.canvas, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="link" size={20} color={state.kind === "live" ? colors.forest : colors.inkSoft} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T selectable weight="bold" style={{ fontSize: 15.5 }} numberOfLines={1}>{state.url.replace(/^https?:\/\//, "")}</T>
                <T style={{ color: state.kind === "live" ? colors.inkSoft : colors.warnInk, fontSize: 13.5 }} numberOfLines={1}>{state.kind === "live" ? t("linkBio.live") : t("linkBio.off")}</T>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PillButton testID="home-link-in-bio-copy" size="md" tone="white" style={{ flex: 1 }} icon={copied ? "check" : "copy"} title={copied ? t("linkBio.copied") : t("linkBio.copy")} accessibilityLabel={copied ? t("linkBio.copied") : t("linkBio.copy")} onPress={() => void copy(state.url)} />
              <PillButton testID="home-link-in-bio-share" size="md" tone="white" style={{ flex: 1 }} icon="share" title={t("linkBio.share")} accessibilityLabel={t("linkBio.share")} onPress={() => void shareText(t("linkBio.shareMessage", { name: shopName, url: state.url }))} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}
