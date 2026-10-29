import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { naira } from "@shared/onboarding";
import { Eyebrow, List, Row, Small, Tile } from "@/components/design";
import { MiniBars, MiniStat, StatCard } from "@/components/visual";
import { trailingTotals, trailingWeekdays } from "@/lib/visual-pure";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { PayInOverdueCard } from "@/components/PayInOverdueCard";
import { CardButton } from "@/components/PartnerKit";
import { TabScreen } from "@/components/TabScreen";
import { Card, PillButton, T, WithTip } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchEarnings } from "@/lib/logistics";
import { dayWord, shortPlace } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { fetchSellersCash } from "@/lib/wallet";
import { colors } from "@/theme";

// Money ("Familiar app" prototype F-Delivery `money`): a dark card with what you earned this week (delivery fees go
// straight to your bank at checkout, so there is no balance, no withdraw and no PIN; the API has no "still coming"
// total, so the card says "Earned this week"), today and the last 30 days, the payout account with Change, the
// pay-on-delivery cash to settle with each seller, and Recent. Partners that still pay cash in to their own pay-in
// account see it here with Copy (transfers to it are matched automatically).

export default function LogisticsEarnings() {
  const t = useT("m_partner", "common");
  const ui = useT("m_ui");
  const earnings = useLoad(fetchEarnings);
  const cash = useLoad(fetchSellersCash);
  const data = earnings.data;
  const [copied, setCopied] = useState(false);
  const sellers = cash.data?.sellers ?? [];
  const owed = sellers.reduce((sum, row) => sum + row.amount, 0);

  async function copy(value: string) {
    if (!value) return;
    await Clipboard.setStringAsync(value).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function refresh() {
    void earnings.refresh();
    void cash.reload();
  }

  const bank = data?.bank ? `${data.bank.bankName} ${data.bank.account}` : null;
  // "Earned this week" is the server's last-7-days sum; the newest deliveries draw it a day a bar only when they hold it all.
  const week = trailingTotals((data?.recent ?? []).map((row) => ({ at: row.deliveredAt, amount: row.amount })), 7, data?.week.amount ?? 0);
  const days = trailingWeekdays(7).map((day) => ui(`wk.${day}` as "wk.0"));

  return (
    <TabScreen title={t("money.title")} refreshing={earnings.refreshing} onRefresh={refresh}>
      {earnings.loading && !data ? <LoadingBlock /> : null}
      {earnings.error && !data ? <ErrorState message={earnings.error} onRetry={() => void earnings.reload()} /> : null}
      {data ? (
        <>
          {data.overdue ? <PayInOverdueCard overdue={data.overdue} onChecked={() => void earnings.reload()} /> : null}

          {/* This week's big number, with a bar a day (today lit) when the recent deliveries hold the whole week. */}
          <StatCard
            tone="dark"
            icon="truck"
            label={t("moneyCard.week")}
            value={naira(data.week.amount)}
            line={t("moneyCard.line", { count: data.week.jobs })}
            chart={week.complete ? <MiniBars dark values={week.totals} labels={days} accessibilityLabel={ui("chart.lastDays", { days: week.totals.map((amount, index) => `${days[index]} ${naira(amount)}`).join(", ") })} /> : null}
          />

          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStat tone="butter" label={t("money.earnedToday")} value={naira(data.today.amount)} line={t("money.jobs", { count: data.today.jobs })} />
            <MiniStat tone="mint" label={t("money.month")} value={naira(data.month.amount)} line={t("money.jobs", { count: data.month.jobs })} />
          </View>

          <List>
            <Row
              lead={<Tile icon="wallet" tone="mint" />}
              title={bank ?? t("biz.payoutNone")}
              sub={data.bank?.accountName ?? t("money.noBank")}
              accessibilityLabel={bank ? t("fam.money.bankLabel", { bank }) : t("money.addBank")}
              onPress={() => router.push("/logistics/wallet")}
              right={<T weight="bold" style={{ fontSize: 14, color: colors.forest, textDecorationLine: "underline" }}>{bank ? t("money.change") : t("money.addBank")}</T>}
            />
          </List>
          {/* How delivery fees reach the bank: one short line, the rest in the tip. */}
          <WithTip title={t("moneyCard.noteTitle")} tip={{ text: bank ? t("moneyCard.noteBank", { bank }) : t("moneyCard.note") }} style={{ marginTop: -8 }}>
            <Small>{t("moneyCard.noteShort")}</Small>
          </WithTip>

          <CardButton
            icon="coin"
            iconBg={colors.warnTint}
            iconFg={colors.warnInk}
            title={t("cashScreen.title")}
            sub={!sellers.length ? t("cashScreen.nothing") : sellers.length === 1 ? t("cashScreen.oneSeller", { amount: naira(owed), name: sellers[0].sellerName }) : t("cashScreen.manySellers", { amount: naira(owed), count: sellers.length })}
            onPress={() => router.push("/logistics/cash")}
          />

          {data.cashToPayIn > 0 || data.payIn?.state === "ready" ? (
            <Card style={{ gap: 10, padding: 20 }}>
              {/* What this cash is: in the tip. A late pay-in stays on screen. */}
              <WithTip title={t("cashScreen.title")} tip={data.cashToPayIn > 0 ? { text: t("codExplain") } : null}>
                <T weight="extrabold" style={{ fontSize: 17 }}>
                  {data.cashToPayIn > 0 ? t("payIn", { amount: naira(data.cashToPayIn), by: data.payInBy ?? t("bySix") }) : t("money.nothingToPayIn")}
                </T>
              </WithTip>
              {data.cashToPayIn > 0 ? (data.late && !data.overdue ? <Small>{t("money.late")}</Small> : null) : <Small>{(data.credit ?? 0) > 0 ? t("money.credit", { amount: naira(data.credit ?? 0) }) : t("money.codShows")}</Small>}
              {data.payIn?.state === "ready" && !data.overdue?.account ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <T weight="extrabold" selectable style={{ flex: 1, fontSize: 26, letterSpacing: 1 }} accessibilityLabel={t("accountNumber", { digits: data.payIn.accountNumber.split("").join(" ") })}>
                      {data.payIn.accountNumber}
                    </T>
                    <PillButton title={copied ? t("copied") : t("copy")} size="sm" tone={copied ? "white" : "ink"} onPress={() => void copy(data.payIn?.state === "ready" ? data.payIn.accountNumber : "")} />
                  </View>
                  <Small>{`${data.payIn.bankName} · ${data.payIn.accountName}`}</Small>
                  <Small>{t("money.autoMatch")}</Small>
                </>
              ) : null}
            </Card>
          ) : null}

          <Eyebrow>{t("fam.money.recent")}</Eyebrow>
          {data.recent.length ? (
            <List>
              {data.recent.map((row) => (
                <Row
                  key={row.id}
                  lead={<Tile icon="wallet" tone="mint" />}
                  title={`${row.ref} · ${shortPlace(row.from)} → ${shortPlace(row.to)}`}
                  sub={[row.rider, dayWord(row.deliveredAt, undefined, t)].filter(Boolean).join(" · ")}
                  right={<T weight="bold" style={{ color: colors.success }}>{`+${naira(row.amount)}`}</T>}
                />
              ))}
            </List>
          ) : (
            <Card style={{ padding: 20 }}>
              <Small>{t("money.noDeliveries")}</Small>
            </Card>
          )}

          {data.remittances.length ? (
            <>
              <Eyebrow>{t("money.recentPayIns")}</Eyebrow>
              <List>
                {data.remittances.map((row) => (
                  <Row
                    key={row.id}
                    title={`${row.method === "account" ? t("money.method.account") : row.method === "settled" ? t("money.method.settled") : row.method === "cash" ? t("cash") : row.method === "api" ? t("money.method.api") : t("transfer")} · ${dayWord(row.createdAt, undefined, t)}`}
                    sub={row.status ?? undefined}
                    right={<T weight="bold">{naira(row.amount)}</T>}
                  />
                ))}
              </List>
            </>
          ) : null}
        </>
      ) : null}
    </TabScreen>
  );
}
