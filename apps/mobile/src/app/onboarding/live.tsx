import { useState } from "react";
import { Modal, Pressable, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { withChannelRef } from "@shared/channels";
import { LinkButton, Mascot, PillButton, T, Wash } from "@/components/ui";
import { MascotVideo } from "@/components/MascotVideo";
import { useOnboarding } from "@/components/OnboardingContext";
import { finishOnboarding } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";
import { HelpButton } from "@/components/Help";
import { AppIcon } from "@/components/icons";
import { PublishButton } from "@/components/seller/PublishShop";

// "Your shop is live!" ("Familiar app" prototype `on.live`): the link, Share on WhatsApp as the one main button
// (Status first, that's where customers are), the Instagram bio and QR poster, and "Go to my shop", which finishes
// onboarding and opens Home, where the first-login tour and "Get your shop ready" take over.

export default function Live() {
  const t = useT("m_onboarding", "m_home");
  const { status, palette, refresh } = useOnboarding();
  // From payments: why the shop didn't go live there (shown until it does), and fees kept because of the plan.
  const params = useLocalSearchParams<{ publishError?: string }>();
  const [toast, setToast] = useState<string | null>(null);
  const [qr, setQr] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!status) return null;
  const url = status.store.url;
  const live = status.store.live;

  async function copy(message = t("live.copied"), link = url) {
    await Clipboard.setStringAsync(link);
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }

  // Next: the link in bio step (onboarding/bio.tsx), which finishes onboarding and opens Home (skippable).
  function goToShop() {
    router.push("/onboarding/bio");
  }

  // "Let Peggy answer WhatsApp?": finish onboarding, then open the Peggy chatbot settings over Home.
  async function setUpPeggy() {
    setLeaving(true);
    await finishOnboarding(status!.store.live).catch(() => null);
    router.replace("/home");
    router.push("/inbox/chatbot" as never);
  }

  return (
    <View style={{ flex: 1 }}>
      <Wash />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 18 }}>
        <View style={{ alignItems: "flex-end", paddingTop: 8 }}>
          <HelpButton />
        </View>
        <View style={{ alignItems: "center", paddingTop: 4 }}>
          <View style={{ backgroundColor: colors.successTint, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
            <T weight="bold" style={{ color: colors.success }}>{live ? t("live.isLive") : t("loading.almost")}</T>
          </View>
          <T style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 35, letterSpacing: -0.8, textAlign: "center", marginTop: 12, marginBottom: 14 }} accessibilityRole="header">
            {live ? t("live.open", { name: status.store.name }) : t("live.nearlyOpen", { name: status.store.name })}
          </T>
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
          {/* Shop ready: Rex's double thumbs-up in a spotlight that fades into the shop's colour (Prototype 10). */}
          <View style={{ height: 190, backgroundColor: palette.swatches[1], alignItems: "center", justifyContent: "center" }}>
            <MascotVideo clip="rex-thumbs" size={178} decorative fadeTo={palette.swatches[1]} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
            <View style={{ flex: 1 }}>
              <T weight="semibold" style={{ fontSize: 20, fontStyle: "italic" }} numberOfLines={1}>{status.store.name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</T>
            </View>
            <PillButton title={t("live.copy")} tone="white" size="sm" onPress={() => void copy()} />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          {[
            { label: t("live.instagramBio"), onPress: () => void copy(t("live.copiedInstagram"), withChannelRef(url, "instagram")) },
            { label: t("live.qrPoster"), onPress: () => setQr(true) },
          ].map((item) => (
            <Pressable key={item.label} accessibilityRole="button" onPress={item.onPress} style={{ flex: 1, minHeight: 84, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", padding: 10 }}>
              <T weight="bold" style={{ fontSize: 14, textAlign: "center" }}>{item.label}</T>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("live.peggyTitle")} onPress={() => void setUpPeggy()} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, backgroundColor: colors.mintTint, borderRadius: 24, paddingVertical: 8, paddingLeft: 6, paddingRight: 16, opacity: pressed ? 0.85 : 1 })}>
          {/* The transparent sticker: Peggy waves (animated WebP at 96 px and up). */}
          <Mascot who="peggy" mood="wave" size={96} label="" style={{ marginVertical: -6 }} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 15 }}>{t("live.peggyTitle")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 18 }}>{t("live.peggyBody")}</T>
          </View>
          <AppIcon name="chevron" size={18} color={colors.inkSoft} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {live ? (
          <>
            <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20, textAlign: "center", marginBottom: 10 }}>{t("live.statusFirst")}</T>
            <PillButton title={t("live.shareWhatsApp")} tone="accent" onPress={() => void Share.share({ message: t("start.shareMessage", { name: status.store.name, url: withChannelRef(url, "whatsapp") }) })} />
          </>
        ) : (
          <>
            {/* It didn't go live on the payments step: the reason, and the one button to try again here. */}
            {params.publishError?.trim() ? <T style={{ color: colors.danger, fontSize: 14.5, lineHeight: 20, textAlign: "center", marginBottom: 10 }}>{params.publishError}</T> : null}
            <PublishButton title={t("pay.goLive")} onPublished={() => void refresh()} />
          </>
        )}
        <LinkButton title={leaving ? t("live.opening") : t("live.goToShop")} style={{ marginTop: 4, marginBottom: 6 }} onPress={goToShop} />
      </SafeAreaView>
      {toast && (
        <View style={{ position: "absolute", bottom: 120, alignSelf: "center", backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 12 }}>
          <T weight="bold" style={{ color: "#FFFFFF" }}>{toast}</T>
        </View>
      )}
      <Modal visible={qr} transparent animationType="fade" onRequestClose={() => setQr(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 }} onPress={() => setQr(false)}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 28, padding: 24, alignItems: "center", width: "100%", maxWidth: 360 }}>
            <T weight="semibold" style={{ fontSize: 24, fontStyle: "italic" }}>{status.store.name}</T>
            <T style={{ color: colors.inkSoft, marginTop: 4, marginBottom: 16 }}>{t("live.scan")}</T>
            <QRCode value={url} size={240} color={colors.ink} backgroundColor="#FFFFFF" />
            <T style={{ color: colors.inkSoft, fontSize: 13.5, marginTop: 14, textAlign: "center" }}>{t("live.print")}</T>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
