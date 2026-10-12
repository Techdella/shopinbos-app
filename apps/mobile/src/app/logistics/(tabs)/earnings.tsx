import { Pressable, View } from "react-native";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { RouteLine } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Card, PillButton, T } from "@/components/ui";
import { fetchEarnings } from "@/lib/logistics";
import { dayWord, shortPlace } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Cash: cash collected when customers pay on arrival that's still to pay in, then what the company earned (after the
// Shopinbos fee) today, this week and in 30 days, recent pay-ins and where we send your money. Saving a pay-in and
// changing the bank happen on the web.

export default function LogisticsEarnings() {
  const earnings = useLoad(fetchEarnings);
  const data = earnings.data;

  return (
    <TabScreen title="Cash" refreshing={earnings.refreshing} onRefresh={() => void earnings.refresh()}>
      {earnings.loading && !data ? <LoadingBlock /> : null}
      {earnings.error && !data ? <ErrorState message={earnings.error} onRetry={() => void earnings.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/cash") }} /> : null}
      {data ? (
        <View style={{ gap: 12 }}>
          <View style={{ backgroundColor: data.cashToPayIn > 0 ? "#FDF0D5" : colors.surface, borderRadius: radii.card, padding: 18, gap: 6 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>Cash to pay in</T>
            <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }}>{naira(data.cashToPayIn)}</T>
            <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
              {data.cashToPayIn > 0 ? "Cash your riders collected from customers who paid when it arrived." : "Nothing to pay in right now."}
            </T>
            {data.cashToPayIn > 0 ? <PillButton title="I've paid it in" style={{ marginTop: 8 }} onPress={() => void openWeb("/logistics/cash")} /> : null}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              { label: "Earned today", value: data.today },
              { label: "This week", value: data.week },
              { label: "30 days", value: data.month },
            ].map((item) => (
              <Card key={item.label} style={{ flex: 1, gap: 4, padding: 14 }}>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{item.label}</T>
                <T weight="extrabold" style={{ fontSize: 18 }}>{naira(item.value.amount)}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{item.value.jobs} {item.value.jobs === 1 ? "job" : "jobs"}</T>
              </Card>
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={() => void openWeb("/logistics/payouts")} style={{ backgroundColor: data.bank?.ready ? colors.surface : "#FDF0D5", borderRadius: radii.card, padding: 16, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="coin" size={20} />
              <T weight="extrabold" style={{ flex: 1, fontSize: 15 }}>Money sent to your bank</T>
              <T weight="bold" style={{ color: colors.accentInk, fontSize: 15 }}>{data.bank ? "Change" : "Add bank"}</T>
            </View>
            <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
              {data.bank ? `${data.bank.bankName} ${data.bank.account} · ${data.bank.accountName}${data.bank.ready ? "" : " · we're checking it"}` : "Add your company bank account so we can send you money for delivered jobs."}
            </T>
          </Pressable>

          {data.remittances.length ? (
            <>
              <SectionTitle>Cash you paid in</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {data.remittances.map((row, index) => (
                  <View key={row.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <T style={{ flex: 1, fontSize: 15 }}>{row.method === "cash" ? "Cash" : row.method === "api" ? "From your software" : "Transfer"} · {dayWord(row.createdAt)}</T>
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
                    <T style={{ color: colors.inkSoft, fontSize: 14 }}>{row.rider ? `${row.rider} · ` : ""}{dayWord(row.deliveredAt)}</T>
                  </View>
                  <T weight="extrabold">{naira(row.amount)}</T>
                </View>
              ))}
            </Card>
          ) : (
            <Card><T style={{ color: colors.inkSoft, fontSize: 15 }}>No deliveries in the last 30 days yet. Money from delivered jobs shows up here.</T></Card>
          )}
        </View>
      ) : null}
    </TabScreen>
  );
}
