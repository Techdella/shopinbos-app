import { useState } from "react";
import { router } from "expo-router";
import { PaySellersCard } from "@/components/PaySellersCard";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { RouteLine } from "@/components/partner";
import { PayInOverdueCard } from "@/components/PayInOverdueCard";
import { TabScreen } from "@/components/TabScreen";
import { Card, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchEarnings } from "@/lib/logistics";
import { dayWord, shortPlace } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Money: "Pay in ₦X by 6pm", the company's own pay-in account number with a Copy button (transfers to it are matched
// automatically, lib/logistics/payins.server.ts), recent pay-ins with their status, then what the company earned
// (after the Shopinbos fee) and the company's Shopinbos Wallet. Cash on delivery belongs to the sellers: without a
// pay-in account, the partner pays each seller straight to their bank (PaySellersCard) or hands it over.

export default function LogisticsEarnings() {
  const t = useT("m_partner", "common");
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
    <TabScreen title={t("money.title")} refreshing={earnings.refreshing} onRefresh={() => void earnings.refresh()}>
      {earnings.loading && !data ? <LoadingBlock /> : null}
      {earnings.error && !data ? <ErrorState message={earnings.error} onRetry={() => void earnings.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/cash") }} /> : null}
      {data ? (
        <View style={{ gap: 12 }}>
          {data.overdue ? <PayInOverdueCard overdue={data.overdue} onChecked={() => void earnings.reload()} /> : null}
          <View style={{ backgroundColor: data.cashToPayIn > 0 && !data.overdue ? "#FDF0D5" : colors.surface, borderRadius: radii.card, padding: 18, gap: 6 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("money.cashToPayIn")}</T>
            <T weight="extrabold" style={{ fontSize: 26, letterSpacing: -0.5 }} accessibilityRole="header">
              {data.cashToPayIn > 0 ? t("payIn", { amount: naira(data.cashToPayIn), by: data.payInBy ?? t("bySix") }) : t("money.nothingToPayIn")}
            </T>
            <T style={{ color: data.late && !data.overdue ? colors.danger : colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
              {data.cashToPayIn > 0
                ? data.late && !data.overdue
                  ? t("money.late")
                  : t("codExplain")
                : (data.credit ?? 0) > 0
                ? t("money.credit", { amount: naira(data.credit ?? 0) })
                : t("money.codShows")}
            </T>
          </View>

          {data.payIn?.state === "ready" ? (
            data.overdue?.account ? null : (
            <Card style={{ gap: 10, padding: 18 }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>{t("money.account")}</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <T weight="extrabold" selectable style={{ flex: 1, fontSize: 28, letterSpacing: 1 }} accessibilityLabel={t("accountNumber", { digits: data.payIn.accountNumber.split("").join(" ") })}>
                  {data.payIn.accountNumber}
                </T>
                <PillButton title={copied ? t("copied") : t("copy")} size="md" tone={copied ? "white" : undefined} onPress={() => void copy(data.payIn?.state === "ready" ? data.payIn.accountNumber : "")} />
              </View>
              <View style={{ gap: 2 }}>
                <T style={{ fontSize: 16 }}>{data.payIn.bankName}</T>
                <T style={{ fontSize: 16, color: colors.inkSoft }}>{data.payIn.accountName}</T>
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("money.autoMatch")}</T>
            </Card>
            )
          ) : null}

          <PaySellersCard onPaid={() => void earnings.reload()} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              { label: t("money.earnedToday"), value: data.today },
              { label: t("money.thisWeek"), value: data.week },
              { label: t("money.month"), value: data.month },
            ].map((item) => (
              <Card key={item.label} style={{ flex: 1, gap: 4, padding: 14 }}>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{item.label}</T>
                <T weight="extrabold" style={{ fontSize: 18 }}>{naira(item.value.amount)}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("money.jobs", { count: item.value.jobs })}</T>
              </Card>
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={() => router.push("/wallet")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="wallet" size={20} />
              <T weight="extrabold" style={{ flex: 1, fontSize: 15 }}>{t("money.wallet")}</T>
              <T weight="bold" style={{ color: colors.accentInk, fontSize: 15 }}>{t("money.open")}</T>
            </View>
            <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("money.walletHint")}</T>
          </Pressable>

          {data.remittances.length ? (
            <>
              <SectionTitle>{t("money.recentPayIns")}</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {data.remittances.map((row, index) => (
                  <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T style={{ fontSize: 15 }}>{row.method === "account" ? t("money.method.account") : row.method === "settled" ? t("money.method.settled") : row.method === "cash" ? t("cash") : row.method === "api" ? t("money.method.api") : t("transfer")} · {dayWord(row.createdAt, undefined, t)}</T>
                      {row.status ? <T style={{ color: colors.success, fontSize: 14 }}>{row.status}</T> : null}
                    </View>
                    <T weight="extrabold">{naira(row.amount)}</T>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <SectionTitle>{t("money.delivered")}</SectionTitle>
          {data.recent.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {data.recent.map((row, index) => (
                <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <RouteLine from={shortPlace(row.from)} to={shortPlace(row.to)} size={14} />
                    <T style={{ color: colors.inkSoft, fontSize: 14 }}>{row.rider ? `${row.rider} · ` : ""}{dayWord(row.deliveredAt, undefined, t)}</T>
                  </View>
                  <T weight="extrabold">{naira(row.amount)}</T>
                </View>
              ))}
            </Card>
          ) : (
            <Card><T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("money.noDeliveries")}</T></Card>
          )}
        </View>
      ) : null}
    </TabScreen>
  );
}
