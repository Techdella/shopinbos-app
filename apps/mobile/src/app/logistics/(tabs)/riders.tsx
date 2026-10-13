import { Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TonePill } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Card, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchRiders } from "@/lib/logistics";
import { timeAgo } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Riders: who is out (switched Online in the Riders app and seen in the last 30 minutes), what each is carrying
// and has delivered today. "Add a rider" needs only a name and a WhatsApp number.

export default function LogisticsRiders() {
  const t = useT("m_partner");
  const riders = useLoad(fetchRiders);
  const list = riders.data?.riders ?? [];
  const out = list.filter((rider) => rider.out).length;
  const active = list.filter((rider) => rider.active).length;

  return (
    <TabScreen title={t("riders.title")} action={<PillButton title={t("riders.add")} size="sm" onPress={() => router.push("/logistics/add-rider")} />} refreshing={riders.refreshing} onRefresh={() => void riders.refresh()}>
      {riders.data ? <T style={{ color: colors.inkSoft, fontSize: 15, marginBottom: 12 }}>{[t("riders.out", { count: out }), t("riders.offline", { count: active - out }), list.length > active ? t("riders.paused", { count: list.length - active }) : null].filter(Boolean).join(" · ")}</T> : null}
      <View style={{ gap: 8 }}>
        {riders.loading && !riders.data ? <LoadingBlock label={t("riders.loading")} /> : null}
        {riders.error && !riders.data ? <ErrorState message={riders.error} onRetry={() => void riders.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/couriers") }} /> : null}
        {riders.data && !list.length ? (
          <EmptyState icon="truck" title={t("riders.none")} action={<PillButton title={t("riders.add")} size="md" onPress={() => router.push("/logistics/add-rider")} />}>
            {t("riders.noneBody")}
          </EmptyState>
        ) : null}
        {list.map((rider) => (
          <Card key={rider.id} style={{ gap: 10, opacity: rider.active ? 1 : 0.6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View>
                <Initials name={rider.name} bg={colors.mintTint} fg={colors.forest} />
                <View style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.surface, backgroundColor: rider.out ? colors.success : colors.toggleOff }} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="extrabold" style={{ fontSize: 15 }}>{rider.name}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>
                  {!rider.active ? t("riders.isPaused") : rider.out ? (rider.openJobs ? t("riders.onJob") : t("riders.free")) : rider.lastSeenAt ? t("riders.offlineSeen", { ago: timeAgo(rider.lastSeenAt, undefined, t) }) : t("riders.isOffline")}
                  {rider.active && rider.where?.includes(",") ? ` · ${rider.where}` : ""}
                  {rider.hasAppLink ? "" : ` · ${t("riders.noLink")}`}
                </T>
              </View>
              {rider.phone ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t("riders.callName", { name: rider.name })} onPress={() => void Linking.openURL(`tel:${rider.phone}`)} hitSlop={6} style={{ minHeight: 42, borderRadius: 21, paddingHorizontal: 14, backgroundColor: colors.canvas, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <AppIcon name="phone" size={18} />
                  <T weight="bold" style={{ fontSize: 15 }}>{t("riders.call")}</T>
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <TonePill tone={rider.openJobs ? "info" : "muted"} label={t("riders.onRoad", { count: rider.openJobs })} />
              <TonePill tone="success" label={t("riders.deliveredToday", { count: rider.deliveredToday })} />
              {rider.earnedToday ? <TonePill tone="muted" label={naira(rider.earnedToday)} /> : null}
            </View>
          </Card>
        ))}
      </View>
    </TabScreen>
  );
}
