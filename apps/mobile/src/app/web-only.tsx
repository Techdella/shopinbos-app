import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { confirmSignOut } from "@/components/partner";
import { LinkButton, Mascot, PillButton, T, Wordmark } from "@/components/ui";
import { WebButtonLabel } from "@/components/WebBadge";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Admin accounts land here (lib/partner-pure.ts): the admin panel is web only, one of the few places the phone app
// opens the website. Seller tools no longer come here: each one has its own screen in the app or isn't on the phone.
// The admin screen stays in English (admin only).

export default function WebOnly() {
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
      <PillButton accessibilityLabel="Open the admin panel" onPress={() => void openWeb("/admin/dashboard")}>
        <WebButtonLabel title="Open the admin panel" />
      </PillButton>
      <LinkButton title="Log out" color={colors.danger} style={{ marginTop: 6 }} onPress={() => confirmSignOut()} />
    </SafeAreaView>
  );
}
