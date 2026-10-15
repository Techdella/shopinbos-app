import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { timerLine, useServerNow } from "@/components/campaigns";
import { fetchCountdowns } from "@/lib/campaigns";
import { countdownTiming } from "@/lib/campaigns-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Home: "Campaigns" with live countdowns for the live and upcoming ones (GET /api/app/campaigns/countdowns, live
// first). Shows nothing when there are none, or when it can't load. Tapping opens the campaigns list.

export function CampaignsCard() {
  const t = useT("m_campaigns", "m_ui");
  const data = useLoad(fetchCountdowns);
  const now = useServerNow(data.data?.offset ?? 0);
  const items = (data.data?.items ?? []).slice(0, 3);
  if (!items.length) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push("/campaigns")} style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: 20, padding: 16, marginTop: 18, gap: 10, opacity: pressed ? 0.85 : 1 })} testID="home-campaigns">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppIcon name="clock" size={18} color={colors.forest} />
        <T weight="extrabold" style={{ flex: 1, fontSize: 17 }} accessibilityRole="header">{t("home.title")}</T>
        <AppIcon name="chevron" size={18} color={colors.inkSoft} />
      </View>
      {items.map((item) => (
        <View key={item.key} style={{ gap: 2 }}>
          <T weight="bold" style={{ fontSize: 15 }} numberOfLines={1}>{item.name}</T>
          <T style={{ fontSize: 14.5, color: colors.inkSoft, fontVariant: ["tabular-nums"] }}>{timerLine(countdownTiming(item), now, t)}</T>
        </View>
      ))}
    </Pressable>
  );
}
