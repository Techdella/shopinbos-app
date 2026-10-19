import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { AppIcon } from "@/components/icons";
import { Badge, ChipRow, EmptyState, ErrorState, LinkRow, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Notice, PillButton, T } from "@/components/ui";
import { TONE_COLORS } from "@/lib/dashboard";
import { friendlyDay } from "@/lib/friendly";
import { fetchPayouts } from "@/lib/money";
import { countPayouts, filterPayouts, orderStatusTone, PAYOUT_FILTERS, type PayoutFilter } from "@/lib/money-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Payouts (web /home/payouts): money from paid orders and where each one went. Paid online (Paystack) goes to the
// payout bank by itself, so there's nothing to request; cash, transfer and POS were collected by the seller. Shows
// the payout bank (added or changed on Payments), the two totals and the latest 100 paid orders.

export default function Payouts() {
  const t = useT("m_money", "m_ui");
  const loaded = useLoad(fetchPayouts);
  const [filter, setFilter] = useState<PayoutFilter>("online");
  const data = loaded.data;
  const orders = data?.orders ?? [];
  const counts = countPayouts(orders);
  const shown = filterPayouts(orders, filter);
  const method = (key: string | null) => (key ? t.dynamic(`method.${key}`, PAYMENT_METHOD_LABEL[key] ?? key) : t("method.paystack"));

  return (
    <Screen title={t("po.title")} sub={t("po.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      {data ? (
        <>
          <Card style={{ gap: 6 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("po.paidOnline")}</T>
            <T weight="extrabold" style={{ fontSize: 34, letterSpacing: -0.8, lineHeight: 40 }}>{naira(data.online.total)}</T>
            <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{`${t("count.orders", { count: data.online.count })} · ${t("po.paidOnlineHint")}`}</T>
            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T weight="semibold" style={{ fontSize: 15 }}>{t("po.collected")}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{`${t("count.orders", { count: data.offline.count })} · ${t("po.collectedHint")}`}</T>
              </View>
              <T weight="extrabold" style={{ fontSize: 16 }}>{naira(data.offline.total)}</T>
            </View>
          </Card>

          <SectionTitle>{t("po.bank")}</SectionTitle>
          <Card style={{ gap: 12 }}>
            {data.bank ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name="wallet" size={22} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{data.bank.bankName}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>
                    {data.bank.accountName}{data.bank.accountEnding ? ` · ${t("po.ending", { digits: data.bank.accountEnding })}` : ""}
                  </T>
                </View>
              </View>
            ) : (
              <Notice tone="info">{t("po.noBank")}</Notice>
            )}
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("po.auto")}</T>
            <PillButton title={data.bank ? t("po.changeBank") : t("po.addBank")} tone={data.bank ? "white" : "ink"} size="md" onPress={() => router.push("/wallet")} />
          </Card>

          {orders.length ? (
            <ChipRow>
              {PAYOUT_FILTERS.map((key) => (
                <Chip key={key} label={`${t(`filter.${key}`)} ${counts[key]}`} on={filter === key} onPress={() => setFilter(key)} />
              ))}
            </ChipRow>
          ) : null}

          {!orders.length ? <EmptyState icon="coin" title={t("po.empty")}>{t("po.emptySub")}</EmptyState> : null}
          {orders.length && !shown.length ? <EmptyState icon="coin" title={t("po.emptyFilter")} /> : null}

          {shown.length ? (
            <Card style={{ paddingVertical: 2 }}>
              {shown.map((order, index) => {
                const tone = TONE_COLORS[orderStatusTone(order.status)];
                return (
                  <LinkRow
                    key={order.id}
                    first={index === 0}
                    label={`${order.buyerName || t("customer")} · ${naira(order.total)}`}
                    hint={`${order.online ? t("po.onlineToBank") : t("po.keptByYou", { method: method(order.paymentMethod) })} · ${friendlyDay(order.createdAt, new Date(), t)}`}
                    right={<Badge label={t.dynamic(`status.${order.status}`, order.status)} bg={tone.bg} fg={tone.fg} />}
                    onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
                  />
                );
              })}
            </Card>
          ) : null}

          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("po.note")}</T>
        </>
      ) : null}
    </Screen>
  );
}
