import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { naira } from "@shared/onboarding";
import { BigNumber, Eyebrow, List, Row, Small, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { PayInOverdueCard } from "@/components/PayInOverdueCard";
import { CardButton, StatCard } from "@/components/PartnerKit";
import { TabScreen } from "@/components/TabScreen";
import { Card, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchEarnings } from "@/lib/logistics";
import { dayWord, shortPlace } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { fetchSellersCash } from "@/lib/wallet";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Money ("Delivery partner app" prototype `money`): what you earned this week on a dark card (the API has no
// "still coming" total, so the card shows this week's earnings), where delivery fees go, "Pay-on-delivery cash" to
// settle with each seller, then what was paid to your bank. Partners that still pay cash in to their own pay-in
// account see it here with Copy (transfers to it are matched automatically), plus today / week / month.

export default function LogisticsEarnings() {
  const t = useT("m_partner", "common");
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

  return (
    <TabScreen title={t("money.title")} refreshing={earnings.refreshing} onRefresh={refresh}>
      {earnings.loading && !data ? <LoadingBlock /> : null}
      {earnings.error && !data ? <ErrorState message={earnings.error} onRetry={() => void earnings.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/cash") }} /> : null}
      {data ? (
        <>
          {data.overdue ? <PayInOverdueCard overdue={data.overdue} onChecked={() => void earnings.reload()} /> : null}

          <View style={{ backgroundColor: colors.forest, borderRadius: 24, padding: 20, gap: 12 }} accessible accessibilityLabel={`${t("moneyCard.week")} ${naira(data.week.amount)}`}>
            <Small style={{ color: "#BFE6DD" }}>{t("moneyCard.week")}</Small>
            <BigNumber color="#FFFFFF">{naira(data.week.amount)}</BigNumber>
            <Small style={{ color: "#BFE6DD" }}>{t("moneyCard.line", { count: data.week.jobs })}</Small>
          </View>
          <Small style={{ marginTop: -6 }}>{data.bank ? t("moneyCard.noteBank", { bank: `${data.bank.bankName} ${data.bank.account}` }) : t("moneyCard.note")}</Small>

          <CardButton
            icon="coin"
            iconBg={colors.warnTint}
            iconFg={colors.warnInk}
            title={t("cashScreen.title")}
            sub={!sellers.length ? t("cashScreen.nothing") : sellers.length === 1 ? t("cashScreen.oneSeller", { amount: naira(owed), name: sellers[0].sellerName }) : t("cashScreen.manySellers", { amount: naira(owed), count: sellers.length })}
            onPress={() => router.push("/logistics/cash")}
          />

          {data.cashToPayIn > 0 || data.payIn?.state === "ready" ? (
            <Card style={{ gap: 10, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>
                {data.cashToPayIn > 0 ? t("payIn", { amount: naira(data.cashToPayIn), by: data.payInBy ?? t("bySix") }) : t("money.nothingToPayIn")}
              </T>
              <Small>{data.cashToPayIn > 0 ? (data.late && !data.overdue ? t("money.late") : t("codExplain")) : (data.credit ?? 0) > 0 ? t("money.credit", { amount: naira(data.credit ?? 0) }) : t("money.codShows")}</Small>
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

          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard value={naira(data.today.amount)} label={t("money.earnedToday")} />
            <StatCard value={naira(data.month.amount)} label={t("money.month")} />
          </View>

          <Eyebrow>{t("money.paidToBank")}</Eyebrow>
          {data.recent.length ? (
            <List>
              {data.recent.map((row) => (
                <Row
                  key={row.id}
                  lead={<Tile icon="check" tone="ok" />}
                  title={`${row.ref} · ${shortPlace(row.from)} → ${shortPlace(row.to)}`}
                  sub={[row.rider, dayWord(row.deliveredAt, undefined, t)].filter(Boolean).join(" · ")}
                  right={<T weight="bold" style={{ color: colors.success }}>{`+${naira(row.amount)}`}</T>}
                />
              ))}
            </List>
          ) : (
            <Card style={{ padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
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
                    title={`${row.method === "seller" ? t("money.method.seller") : row.method === "seller_confirmed" ? t("money.method.sellerConfirmed") : row.method === "account" ? t("money.method.account") : row.method === "settled" ? t("money.method.settled") : row.method === "cash" ? t("cash") : row.method === "api" ? t("money.method.api") : t("transfer")} · ${dayWord(row.createdAt, undefined, t)}`}
                    sub={row.status ?? undefined}
                    right={<T weight="bold">{naira(row.amount)}</T>}
                  />
                ))}
              </List>
            </>
          ) : null}

          <List>
            <Row lead={<Tile icon="wallet" tone="gray" />} title={t("money.wallet")} sub={t("money.walletHint")} onPress={() => router.push("/logistics/wallet")} />
          </List>
        </>
      ) : null}
    </TabScreen>
  );
}
