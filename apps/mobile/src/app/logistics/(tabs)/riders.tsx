import { Linking, Pressable, View } from "react-native";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TonePill } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Card, PillButton, T } from "@/components/ui";
import { fetchRiders } from "@/lib/logistics";
import { timeAgo } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Riders: who is out (switched Online in the Riders app and seen in the last 30 minutes), what each is carrying
// and has delivered today. Adding riders and sending their Riders app links is on the web.

export default function LogisticsRiders() {
  const riders = useLoad(fetchRiders);
  const list = riders.data?.riders ?? [];
  const out = list.filter((rider) => rider.out).length;
  const active = list.filter((rider) => rider.active).length;

  return (
    <TabScreen title="Riders" action={<PillButton title="Add" size="sm" onPress={() => void openWeb("/logistics/couriers")} />} refreshing={riders.refreshing} onRefresh={() => void riders.refresh()}>
      {riders.data ? <T style={{ color: colors.inkSoft, marginBottom: 12 }}>{out} out · {active - out} offline{list.length > active ? ` · ${list.length - active} paused` : ""}</T> : null}
      <View style={{ gap: 8 }}>
        {riders.loading && !riders.data ? <LoadingBlock label="Loading riders…" /> : null}
        {riders.error && !riders.data ? <ErrorState message={riders.error} onRetry={() => void riders.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/couriers") }} /> : null}
        {riders.data && !list.length ? (
          <EmptyState icon="truck" title="No riders yet" action={<PillButton title="Add riders on the web" size="sm" onPress={() => void openWeb("/logistics/couriers")} />}>
            Add your riders and send each one their Riders app link. They switch Online when they start work.
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
                <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>
                  {!rider.active ? "Paused" : rider.out ? "Online" : rider.lastSeenAt ? `Offline · seen ${timeAgo(rider.lastSeenAt)}` : "Offline"}
                  {rider.hasAppLink ? "" : " · no app link yet"}
                </T>
              </View>
              {rider.phone ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Call ${rider.name}`} onPress={() => void Linking.openURL(`tel:${rider.phone}`)} hitSlop={6} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name="phone" size={18} />
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <TonePill tone={rider.openJobs ? "info" : "muted"} label={`${rider.openJobs} on the road`} />
              <TonePill tone="success" label={`${rider.deliveredToday} delivered today`} />
              {rider.earnedToday ? <TonePill tone="muted" label={naira(rider.earnedToday)} /> : null}
            </View>
          </Card>
        ))}
      </View>
    </TabScreen>
  );
}
