import { View, type StyleProp, type ViewStyle } from "react-native";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { shownHost } from "@/lib/store-editor";
import { colors } from "@/theme";

// The web build of the phone app has no WebView: the card shows the shop's address (Android and iPhone show the
// shop itself, StorePreview.native.tsx).

export function StorePreview({ url, style, accessibilityLabel }: { url: string; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={[{ alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface }, style]}>
      <AppIcon name="store" size={32} color={colors.inkSoft} />
      <T weight="bold" numberOfLines={1} style={{ fontSize: 15, color: colors.inkSoft }}>{shownHost(url)}</T>
    </View>
  );
}
