import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { confirmSignOut } from "@/components/partner";
import { BackButton, LinkButton, Mascot, PillButton, T, Wordmark } from "@/components/ui";
import { EMAIL_SETUP_PATH } from "@/lib/channels-pure";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Do this on the web". With ?what=… a seller learns why a tool is easier on a bigger screen and
// can open it there (signed in) or ask us to do it. Without it, admin accounts land here: the admin panel is web only.

// title and body are m_shop or m_channels keys. The admin screen below stays in English (admin only).
const TOOLS: Record<string, { title: "webOnly.look.title" | "webOnly.bio.title" | "email.domainTitle"; body: "webOnly.look.body" | "webOnly.bio.body" | "email.domainBody"; path: string; ask?: string; askLabel?: "webOnly.askRex" | "email.askUs" }> = {
  look: {
    title: "webOnly.look.title",
    body: "webOnly.look.body",
    path: "/home/editor",
    ask: "/rex",
    askLabel: "webOnly.askRex",
  },
  // Email from the shop's own domain (hello@myshop.com): DNS records are added on the web's email page.
  emailDomain: {
    title: "email.domainTitle",
    body: "email.domainBody",
    path: EMAIL_SETUP_PATH,
    ask: "/ask-us?what=channels",
    askLabel: "email.askUs",
  },
  // Link in bio colours, photo and the blocks the phone doesn't edit (app/link-in-bio.tsx).
  bio: {
    title: "webOnly.bio.title",
    body: "webOnly.bio.body",
    path: "/home/social/link-in-bio",
  },
};

export default function WebOnly() {
  const { what } = useLocalSearchParams<{ what?: string }>();
  const tool = what ? TOOLS[String(what)] : undefined;
  const t = useT("m_shop", "m_ui", "m_channels");

  if (tool) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22, paddingBottom: 12 }}>
        <View style={{ paddingTop: 10 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/shop"))} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <Mascot name="peggyWave" size={130} label="" />
          <T weight="extrabold" style={{ fontSize: 24, textAlign: "center", letterSpacing: -0.4 }} accessibilityRole="header">{t(tool.title)}</T>
          <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 16, lineHeight: 23, maxWidth: 340 }}>{t(tool.body)}</T>
        </View>
        <PillButton title={t("openInBrowser")} onPress={() => void openWeb(tool.path)} />
        {tool.ask && tool.askLabel ? <LinkButton title={t(tool.askLabel)} style={{ marginTop: 6 }} onPress={() => router.push(tool.ask as never)} /> : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22, paddingBottom: 12 }}>
      <View style={{ paddingTop: 10 }}>
        <Wordmark />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <Mascot name="peggyWave" size={150} label="" />
        <T weight="extrabold" style={{ fontSize: 26, textAlign: "center", letterSpacing: -0.4 }} accessibilityRole="header">The admin panel is on the web</T>
        <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 16, lineHeight: 23, maxWidth: 320 }}>
          This account is a Shopinbos admin. Open the admin panel in your browser to review suppliers, partners and payouts.
        </T>
      </View>
      <PillButton title="Open the admin panel" onPress={() => void openWeb("/admin/dashboard")} />
      <LinkButton title="Log out" color={colors.danger} style={{ marginTop: 6 }} onPress={() => confirmSignOut()} />
    </SafeAreaView>
  );
}
