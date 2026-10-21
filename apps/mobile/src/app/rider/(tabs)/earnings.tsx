import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { BigNumber, Eyebrow, List, Row, Small, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { T } from "@/components/ui";
import { fetchRider } from "@/lib/rider";
import { groupByDay, lagosTime } from "@/lib/rider-pure";
import { useRiderStrings } from "@/lib/rider-strings";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Riders app, Earnings (E2E-Rider "earn"): this week's total on a dark teal card (Monday to now, Lagos time), how many
// deliveries and who pays, then each delivery under Today, Yesterday and Earlier this week.

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
