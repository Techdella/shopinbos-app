import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { confirmSignOut } from "@/components/partner";
import { BackButton, LinkButton, Mascot, PillButton, T, Wordmark } from "@/components/ui";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// "Do this on the web". With ?what=… a seller learns why a tool is easier on a bigger screen and
// can open it there (signed in) or ask us to do it. Without it, admin accounts land here: the admin panel is web only.

const TOOLS: Record<string, { title: string; body: string; path: string; ask: string }> = {
  look: {
    title: "Change your theme on a bigger screen",
    body: "Changing your theme, colours, pictures and the layout of your shop is easier on a computer or tablet. You can open it on this phone too. Or ask Rex to change it for you.",
    path: "/home/editor",
    ask: "/rex",
  },
};

export default function WebOnly() {
  const { what } = useLocalSearchParams<{ what?: string }>();
  const tool = what ? TOOLS[String(what)] : undefined;

  if (tool) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22, paddingBottom: 12 }}>
        <View style={{ paddingTop: 10 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/shop"))} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <Mascot name="peggyWave" size={130} label="" />
          <T weight="extrabold" style={{ fontSize: 24, textAlign: "center", letterSpacing: -0.4 }} accessibilityRole="header">{tool.title}</T>
          <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 16, lineHeight: 23, maxWidth: 340 }}>{tool.body}</T>
        </View>
        <PillButton title="Open it in my browser" onPress={() => void openWeb(tool.path)} />
        <LinkButton title="Ask Rex to do it" style={{ marginTop: 6 }} onPress={() => router.push(tool.ask as never)} />
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
