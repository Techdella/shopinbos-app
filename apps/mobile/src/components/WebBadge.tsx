import { View, type StyleProp, type ViewStyle } from "react-native";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// The one sign that a button or row leaves the app for the website: "Opens website ↗". Every page stays in the app;
// only advanced or paid tools open the website (buying a domain, plans and billing, AI credits or a wallet top-up,
// the full web store builder, the video studio's final render), plus the admin panel and Google's Gmail sign-in.
// tests/mobile-web-exits.test.mjs fails when an openWeb( call has no WebBadge or WebButtonLabel beside it.

/** A small pill for the right of a Row or LinkRow (pass it as `right`), or under a link. */
export function WebBadge({ style, dark }: { style?: StyleProp<ViewStyle>; dark?: boolean }) {
  const t = useT("m_ui");
  return (
    <View style={[{ borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: dark ? "rgba(255,255,255,0.16)" : colors.grayTint, alignSelf: "flex-start" }, style]}>
      <T weight="bold" style={{ fontSize: 12, color: dark ? "#FFFFFF" : colors.grayInk }} numberOfLines={1}>{t("web.badge")}</T>
    </View>
  );
}

/** The label inside a PillButton that opens the website: its title with "Opens website ↗" on a small line below. */
export function WebButtonLabel({ title, tone = "ink", size = "lg" }: { title: string; tone?: "ink" | "white" | "accent" | "forest"; size?: "lg" | "md" | "sm" }) {
  const t = useT("m_ui");
  const color = tone === "white" || tone === "accent" ? colors.ink : "#FFFFFF";
  return (
    <View style={{ alignItems: "center", paddingVertical: 4 }}>
      <T weight={size === "lg" ? "extrabold" : "bold"} style={{ color, fontSize: size === "lg" ? 17 : size === "md" ? 16 : 15, textAlign: "center" }} numberOfLines={1}>{title}</T>
      <T weight="semibold" style={{ color, opacity: 0.75, fontSize: 12, textAlign: "center" }} numberOfLines={1}>{t("web.badge")}</T>
    </View>
  );
}
