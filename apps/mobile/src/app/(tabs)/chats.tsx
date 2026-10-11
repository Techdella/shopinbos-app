import { View } from "react-native";
import { router } from "expo-router";
import { Card, Mascot, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Chats live on the web inbox for now; Peggy answers questions about the shop right here.
export default function Chats() {
  return (
    <TabScreen title="Chats">
      <Card style={{ backgroundColor: colors.mintTint, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Mascot name="peggy" size={52} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>Ask Peggy</T>
            <T style={{ color: colors.inkSoft, fontSize: 13 }}>Sales, stock, what to restock, what to post next.</T>
          </View>
        </View>
        <PillButton title="Ask Peggy about your shop" onPress={() => router.push("/peggy")} />
      </Card>
      <Card style={{ marginTop: 12, gap: 12 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>Messages</T>
        <T style={{ color: colors.inkSoft, lineHeight: 20 }}>Chats with suppliers, riders and your shop&apos;s contact form are in the web inbox while we bring them to the app.</T>
        <PillButton title="Open inbox" tone="white" size="md" onPress={() => void openWeb("/home/messages")} />
      </Card>
    </TabScreen>
  );
}
