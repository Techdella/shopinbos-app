import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { BigNumber, Eyebrow, List, Row, Small, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { T } from "@/components/ui";
import { fetchRider, type RiderWeekDelivery } from "@/lib/rider";
import { groupByDay, lagosTime, weekBars } from "@/lib/rider-pure";
import { useRiderStrings } from "@/lib/rider-strings";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Riders app, Earnings (E2E-Rider "earn"): this week's total on a dark teal card (Monday to now, Lagos time), how many
// deliveries and who pays, "Deliveries by day" (Monday to Sunday bars, worked out on the phone from each delivery's
// deliveredAt), then each delivery under Today, Yesterday and Earlier this week.

export default function RiderEarnings() {
  const rider = useLoad(fetchRider);
  const { t, say } = useRiderStrings();
  const data = rider.data;
  const week = data?.week ?? { total: 0, count: 0, deliveries: [] };
  const company = data?.rider.partnerName ?? "";

  return (
    <TabScreen title={say("earn.title")} refreshing={rider.refreshing} onRefresh={() => void rider.refresh()}>
      {rider.loading && !data ? <LoadingBlock label={t.loading} /> : null}
      {rider.error && !data ? <ErrorState message={rider.error} onRetry={() => void rider.reload()} /> : null}
      {data ? (
        <>
          <View style={{ backgroundColor: colors.forest, borderRadius: 24, padding: 20, gap: 10 }} accessible accessibilityLabel={`${say("earn.week")}: ${naira(week.total)}. ${say("earn.line", { count: week.count, company })}`}>
            <Small style={{ color: "#BFE6DD" }}>{say("earn.week")}</Small>
            <BigNumber color="#FFFFFF">{naira(week.total)}</BigNumber>
            <Small style={{ color: "#BFE6DD" }}>{say("earn.line", { count: week.count, company })}</Small>
          </View>
          <DayBars deliveries={week.deliveries} />
          {week.deliveries.length === 0 ? <Sub>{say("earn.none")}</Sub> : null}
          {groupByDay(week.deliveries).map((group) => (
            <View key={group.group} style={{ gap: 10 }}>
              <Eyebrow>{say(`day.${group.group}`)}</Eyebrow>
              <List>
                {group.items.map((item) => (
                  <Row
                    key={item.id}
                    lead={<Tile icon="check" tone="ok" />}
                    title={`${item.from} → ${item.to}`}
                    sub={lagosTime(item.deliveredAt)}
                    right={<T weight="bold" style={{ fontSize: 16 }}>{naira(item.amount)}</T>}
                  />
                ))}
              </List>
            </View>
          ))}
        </>
      ) : null}
    </TabScreen>
  );
}

const DAY_KEYS = ["wk.0", "wk.1", "wk.2", "wk.3", "wk.4", "wk.5", "wk.6"] as const;
/** Tallest bar: the 120px chart less the day label under it. */
const BAR_MAX = 94;

/** "Deliveries by day": this week's deliveries per day, Monday to Sunday, today's bar dark (`.bars`). */
function DayBars({ deliveries }: { deliveries: RiderWeekDelivery[] }) {
  const { say } = useRiderStrings();
  const { counts, today } = weekBars(deliveries);
  const most = Math.max(1, ...counts);
  const spoken = DAY_KEYS.map((key, index) => `${say(key)} ${counts[index]}`).join(", ");
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 14 }} accessible accessibilityLabel={`${say("earn.byDay")}. ${spoken}`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <T weight="bold" style={{ fontSize: 15 }}>{say("earn.byDay")}</T>
        <Small>{say("earn.todayCount", { count: counts[today] })}</Small>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: 120 }}>
        {counts.map((count, index) => (
          <View key={DAY_KEYS[index]} style={{ flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            {/* The busiest day fills the space above the labels; an empty day is a short stub. */}
            <View style={{ width: "100%", height: Math.round(Math.max(0.08, count / most) * BAR_MAX), borderRadius: 10, backgroundColor: index === today ? colors.forest : "#D6F0E9" }} />
            <T weight="semibold" style={{ fontSize: 11.5, color: index === today ? colors.ink : colors.inkSoft }} numberOfLines={1}>{say(DAY_KEYS[index])}</T>
          </View>
        ))}
      </View>
    </View>
  );
}
