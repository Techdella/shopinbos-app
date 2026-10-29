import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { Eyebrow, List, Row, Sub, Tile } from "@/components/design";
import { MiniBars, StatCard } from "@/components/visual";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { T } from "@/components/ui";
import { fetchRider, type RiderWeekDelivery } from "@/lib/rider";
import { groupByDay, lagosTime, weekBars } from "@/lib/rider-pure";
import { useRiderStrings } from "@/lib/rider-strings";
import { useLoad } from "@/lib/useLoad";

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
          {/* The week's money big, and under it "Deliveries by day": Monday to Sunday bars, today lit. */}
          <StatCard tone="forest" icon="coin" label={say("earn.week")} value={naira(week.total)} line={say("earn.line", { count: week.count, company })} chart={<DayBars deliveries={week.deliveries} />} />
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

/** "Deliveries by day" on the week card: this week's deliveries per day, Monday to Sunday, today's bar lit. */
function DayBars({ deliveries }: { deliveries: RiderWeekDelivery[] }) {
  const { say } = useRiderStrings();
  const { counts, today } = weekBars(deliveries);
  const spoken = DAY_KEYS.map((key, index) => `${say(key)} ${counts[index]}`).join(", ");
  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.14)", paddingTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <T weight="bold" style={{ fontSize: 14, color: "#FFFFFF" }}>{say("earn.byDay")}</T>
        <T weight="bold" style={{ fontSize: 13, color: "#BFE6DD" }}>{say("earn.todayCount", { count: counts[today] })}</T>
      </View>
      <MiniBars dark height={84} values={counts} labels={DAY_KEYS.map((key) => say(key))} highlight={today} accessibilityLabel={`${say("earn.byDay")}. ${spoken}`} />
    </View>
  );
}
