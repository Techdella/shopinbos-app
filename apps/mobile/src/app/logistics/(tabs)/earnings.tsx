import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
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

// Money: "Pay in ₦X by 6pm", the company's own pay-in account number with a Copy button (transfers to it are matched
// automatically, lib/logistics/payins.server.ts), recent pay-ins with their status, then what the company earned
// (after the Shopinbos fee) and where we send its money. Without a pay-in account (not available yet), "I've paid it
// in" opens the web form. Changing the bank happens on the web.

export default function LogisticsEarnings() {
  const earnings = useLoad(fetchEarnings);
  const data = earnings.data;
  const [copied, setCopied] = useState(false);

  async function copy(value: string) {
    if (!value) return;
    await Clipboard.setStringAsync(value).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <TabScreen title="Money" refreshing={earnings.refreshing} onRefresh={() => void earnings.refresh()}>
      {earnings.loading && !data ? <LoadingBlock /> : null}
      {earnings.error && !data ? <ErrorState message={earnings.error} onRetry={() => void earnings.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/cash") }} /> : null}
      {data ? (
        <View style={{ gap: 12 }}>
          <View style={{ backgroundColor: data.cashToPayIn > 0 ? "#FDF0D5" : colors.surface, borderRadius: radii.card, padding: 18, gap: 6 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>Cash to pay in</T>
            <T weight="extrabold" style={{ fontSize: 26, letterSpacing: -0.5 }} accessibilityRole="header">
              {data.cashToPayIn > 0 ? `Pay in ${naira(data.cashToPayIn)} ${data.payInBy ?? "by 6pm"}` : "Nothing to pay in"}
            </T>
            <T style={{ color: data.late ? colors.danger : colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
              {data.cashToPayIn > 0
                ? data.late
                  ? "This was due by 6pm. Pay it in now so you keep getting jobs where customers pay when it arrives."
                  : "Cash your riders collected from customers who paid when it arrived."
                : (data.credit ?? 0) > 0
                ? `You paid ${naira(data.credit ?? 0)} extra. We'll use it for your next cash jobs.`
                : "Cash your riders collect shows here."}
            </T>
          </View>

          {data.payIn?.state === "ready" ? (
            <Card style={{ gap: 10, padding: 18 }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>Your pay-in account</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <T weight="extrabold" selectable style={{ flex: 1, fontSize: 28, letterSpacing: 1 }} accessibilityLabel={`Account number ${data.payIn.accountNumber.split("").join(" ")}`}>
                  {data.payIn.accountNumber}
                </T>
                <PillButton title={copied ? "Copied" : "Copy"} size="md" tone={copied ? "white" : undefined} onPress={() => void copy(data.payIn?.state === "ready" ? data.payIn.accountNumber : "")} />
              </View>
              <View style={{ gap: 2 }}>
                <T style={{ fontSize: 16 }}>{data.payIn.bankName}</T>
                <T style={{ fontSize: 16, color: colors.inkSoft }}>{data.payIn.accountName}</T>
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>We match your payment automatically. It shows here within a few minutes.</T>
            </Card>
          ) : data.cashToPayIn > 0 ? (
            <Card style={{ gap: 8, padding: 18 }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>How to pay in</T>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
                {data.payIn?.state === "setting_up"
                  ? "We're getting your own account number ready. Until then, pay in the usual way and tell us how much you paid, so we can tick off your jobs."
                  : "Pay in the usual way, then tell us how much you paid. We tick off your jobs once we've checked it."}
              </T>
              <PillButton title="I've paid it in" style={{ marginTop: 4 }} onPress={() => void openWeb("/logistics/cash")} />
            </Card>
          ) : null}

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
              <SectionTitle>Recent pay-ins</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {data.remittances.map((row, index) => (
                  <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T style={{ fontSize: 15 }}>{row.method === "account" ? "To your pay-in account" : row.method === "cash" ? "Cash" : row.method === "api" ? "From your software" : "Transfer"} · {dayWord(row.createdAt)}</T>
                      {row.status ? <T style={{ color: colors.success, fontSize: 14 }}>{row.status}</T> : null}
                    </View>
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
