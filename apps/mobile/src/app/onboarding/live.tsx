import { useState } from "react";
import { Modal, Pressable, Share, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { withChannelRef } from "@shared/channels";
import { LinkButton, Mascot, PillButton, T, Wash } from "@/components/ui";
import { useOnboarding } from "@/components/OnboardingContext";
import { API_URL } from "@/lib/api";
import { colors, radii } from "@/theme";
import * as WebBrowser from "expo-web-browser";
import { HelpButton } from "@/components/Help";

export default function Live() {
  const { status, palette } = useOnboarding();
  const [toast, setToast] = useState<string | null>(null);
  const [qr, setQr] = useState(false);
  if (!status) return null;
  const url = status.store.url;
  const live = status.store.live;

  async function copy(message = "Link copied", link = url) {
    await Clipboard.setStringAsync(link);
    setToast(message);
    setTimeout(() => setToast(null), 2400);
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
            <T weight="bold" style={{ color: colors.success }}>{live ? "Your shop is live" : "Almost there"}</T>
          </View>
          <T weight="extrabold" style={{ fontSize: 32, lineHeight: 34, letterSpacing: -0.8, textAlign: "center", marginTop: 12, marginBottom: 14 }} accessibilityRole="header">
            {status.store.name} is {live ? "open" : "nearly open"}
          </T>
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden" }}>
          <View style={{ height: 190, backgroundColor: palette.swatches[1], alignItems: "center", justifyContent: "center" }}>
            <Mascot name="rex" mood="celebrate" size={140} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
            <View style={{ flex: 1 }}>
              <T weight="semibold" style={{ fontSize: 20, fontStyle: "italic" }} numberOfLines={1}>{status.store.name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</T>
            </View>
            <PillButton title="Copy" tone="white" size="sm" onPress={() => void copy()} />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          {[
            { label: "WhatsApp Status", onPress: () => void Share.share({ message: `${status.store.name} is open! Shop here: ${withChannelRef(url, "whatsapp")}` }) },
            { label: "Instagram bio", onPress: () => void copy("Link copied. Paste it in your Instagram bio.", withChannelRef(url, "instagram")) },
            { label: "QR poster", onPress: () => setQr(true) },
          ].map((item) => (
            <Pressable key={item.label} accessibilityRole="button" onPress={item.onPress} style={{ flex: 1, minHeight: 84, backgroundColor: colors.surface, borderRadius: radii.card, alignItems: "center", justifyContent: "center", padding: 10 }}>
              <T weight="bold" style={{ fontSize: 14, textAlign: "center" }}>{item.label}</T>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, backgroundColor: colors.mintTint, borderRadius: radii.card, padding: 16 }}>
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 15 }}>Let Peggy answer WhatsApp?</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 18 }}>She drafts replies in your voice. You approve until you trust her.</T>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <PillButton title="Connect WhatsApp" onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/home/social/whatsapp`)} />
        <LinkButton title="Go to my shop" style={{ marginTop: 4, marginBottom: 6 }} onPress={() => router.push("/onboarding/checklist")} />
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
            <T style={{ color: colors.inkSoft, marginTop: 4, marginBottom: 16 }}>Scan to shop</T>
            <QRCode value={url} size={240} color={colors.ink} backgroundColor="#FFFFFF" />
            <T style={{ color: colors.inkSoft, fontSize: 13.5, marginTop: 14, textAlign: "center" }}>Screenshot this and print it for your stall or packaging.</T>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
