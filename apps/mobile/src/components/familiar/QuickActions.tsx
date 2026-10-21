import { Pressable, View } from "react-native";
import { TILE, type TileTone } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { colors } from "@/theme";

// Four round tinted shortcuts in a row under the money card ("Familiar app" prototype `.qa`): Make a post, Delivery,
// Find stock, Share shop for sellers; each role passes its own.

export type QuickAction = { key: string; label: string; icon: AppIconName; tone: TileTone; onPress: () => void; testID?: string };

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {actions.map((action) => (
        <Pressable key={action.key} testID={action.testID} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 7, opacity: pressed ? 0.75 : 1 })}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: TILE[action.tone].bg, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name={action.icon} size={22} color={TILE[action.tone].fg} />
          </View>
          <T weight="semibold" numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16, textAlign: "center", color: colors.ink }}>{action.label}</T>
        </Pressable>
      ))}
    </View>
  );
}
