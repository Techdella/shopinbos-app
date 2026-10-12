import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { RouteLine } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Card, PillButton, T } from "@/components/ui";
import { fetchEarnings } from "@/lib/logistics";
import { shortPlace, timeAgo } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Money: what the company earned (after the Shopinbos fee) today, this week and in 30 days, cash collected on
// delivery still to pay in, recent pay-ins and the payout bank. Recording a pay-in and changing the bank are on the web.

export default function LogisticsEarnings() {
  const earnings = useLoad(fetchEarnings);
  const data = earnings.data;

  return (
    <TabScreen title="Money" refreshing={earnings.refreshing} onRefresh={() => void earnings.refresh()}>
      {earnings.loading && !data ? <LoadingBlock /> : null}
      {earnings.error && !data ? <ErrorState message={earnings.error} onRetry={() => void earnings.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/payouts") }} /> : null}
      {data ? (
        <View style={{ gap: 12 }}>
          <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 18, flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ color: "rgba(255,255,255,0.75)" }}>Earned today</T>
              <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 30, letterSpacing: -0.6 }}>{naira(data.today.amount)}</T>
              <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{data.today.jobs} deliver{data.today.jobs === 1 ? "y" : "ies"}</T>
            </View>
            <View style={{ flex: 1, backgroundColor: "#2E2B3B", borderRadius: 18, padding: 14, gap: 4 }}>
              <T style={{ color: "rgba(255,255,255,0.75)" }}>Cash to pay in</T>
              <T weight="extrabold" style={{ color: "#FFB591", fontSize: 22 }}>{naira(data.cashToPayIn)}</T>
              <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>From pay on delivery</T>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              { label: "This week", value: data.week },
              { label: "30 days", value: data.month },
            ].map((item) => (
              <Card key={item.label} style={{ flex: 1, gap: 4 }}>
                <T style={{ color: colors.inkSoft }}>{item.label}</T>
                <T weight="extrabold" style={{ fontSize: 20 }}>{naira(item.value.amount)}</T>
                <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{item.value.jobs} jobs</T>
              </Card>
            ))}
          </View>

          <View style={{ backgroundColor: data.bank?.ready ? colors.surface : "#FDF0D5", borderRadius: radii.card, padding: 16, gap: 8 }}>
            <T weight="extrabold" style={{ fontSize: 15 }}>Payouts</T>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>
              {data.bank ? `${data.bank.bankName} ${data.bank.account} · ${data.bank.accountName}${data.bank.ready ? "" : " · being checked"}` : "Add your company bank account to get paid."}
            </T>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <PillButton title={data.bank ? "Open payouts" : "Add bank account"} size="sm" onPress={() => void openWeb("/logistics/payouts")} />
              {data.cashToPayIn > 0 ? <PillButton title="Record a cash pay-in" size="sm" tone="white" onPress={() => void openWeb("/logistics/cash")} /> : null}
            </View>
          </View>

          {data.remittances.length ? (
            <>
              <SectionTitle>Recent pay-ins</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {data.remittances.map((row, index) => (
                  <View key={row.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <T>{row.method === "cash" ? "Cash" : "Transfer"}{row.reference ? ` · ${row.reference}` : ""} · {timeAgo(row.createdAt)}</T>
                    <T weight="extrabold">{naira(row.amount)}</T>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <SectionTitle>Delivered</SectionTitle>
          {data.recent.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {data.recent.map((row, index) => (
                <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <RouteLine from={shortPlace(row.from)} to={shortPlace(row.to)} size={14} />
                    <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{row.ref}{row.rider ? ` · ${row.rider}` : ""} · {timeAgo(row.deliveredAt)}</T>
                  </View>
                  <T weight="extrabold">{naira(row.amount)}</T>
                </View>
              ))}
            </Card>
          ) : (
            <Card><T style={{ color: colors.inkSoft }}>No deliveries in the last 30 days yet.</T></Card>
          )}
        </View>
      ) : null}
    </TabScreen>
  );
}
