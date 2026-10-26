import { View } from "react-native";
import { Mascot, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// "120 credits" for Rex and Peggy, and that the plan's credits refill each month. AI credits are digital goods, so
// the app never sells them or points anywhere to buy them (Google Play Payments, Apple 3.1.1 and 3.1.3; see
// docs/store-payments-audit.md): no Top up, no price, no website, no email. Hidden when the balance isn't known.

export function CreditsLine({ balance, who = "rex" }: { balance: number | null | undefined; who?: "rex" | "peggy" }) {
  const t = useT("m_familiar", "m_ui");
  if (balance == null) return null;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <View accessible accessibilityLabel={t("credits.count", { count: balance })} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.grayTint, borderRadius: radii.pill, paddingLeft: 4, paddingRight: 12, minHeight: 36 }}>
        <Mascot who={who} size={28} label="" />
        <T weight="bold" style={{ fontSize: 14 }}>{t("credits.count", { count: balance })}</T>
      </View>
      <T style={{ flexShrink: 1, fontSize: 13, color: colors.inkSoft }}>{t("credits.refill")}</T>
    </View>
  );
}
