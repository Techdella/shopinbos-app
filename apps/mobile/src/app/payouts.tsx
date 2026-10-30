import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { DarkCard, List, Row, Tile } from "@/components/design";
import { Badge, ChipRow, EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Chip, Notice, PillButton, T } from "@/components/ui";
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
          {/* Same look as Money (wallet.tsx): the dark card for card money, soft lists with icon tiles below. */}
          <DarkCard eyebrow={t("po.paidOnline")} amount={naira(data.online.total)} line={`${t("count.orders", { count: data.online.count })} · ${t("po.paidOnlineHint")}`} />

          <List>
            <Row
              lead={<Tile icon="coin" tone="ok" />}
              title={t("po.collected")}
              sub={`${t("count.orders", { count: data.offline.count })} · ${t("po.collectedHint")}`}
              right={<T weight="extrabold" style={{ fontSize: 16 }}>{naira(data.offline.total)}</T>}
            />
          </List>

          <SectionTitle tip={{ text: t("po.auto") }}>{t("po.bank")}</SectionTitle>
          {data.bank ? (
            <List>
              <Row
                lead={<Tile icon="wallet" tone="ok" />}
                title={data.bank.bankName}
                sub={`${data.bank.accountName}${data.bank.accountEnding ? ` · ${t("po.ending", { digits: data.bank.accountEnding })}` : ""}`}
                right={<PillButton title={t("po.changeBank")} tone="white" size="sm" onPress={() => router.push("/wallet")} />}
              />
            </List>
          ) : (
            <View style={{ gap: 10 }}>
              <Notice tone="info">{t("po.noBank")}</Notice>
              <PillButton title={t("po.addBank")} tone="ink" size="md" onPress={() => router.push("/wallet")} />
            </View>
          )}

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
            <List>
              {shown.map((order) => {
                const tone = TONE_COLORS[orderStatusTone(order.status)];
                return (
                  <Row
                    key={order.id}
                    lead={<Tile icon={order.online ? "wallet" : "coin"} tone={order.online ? "ok" : "gray"} />}
                    title={order.buyerName || t("customer")}
                    sub={`${order.online ? t("po.onlineToBank") : t("po.keptByYou", { method: method(order.paymentMethod) })} · ${friendlyDay(order.createdAt, new Date(), t)}`}
                    right={
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <T weight="extrabold" style={{ fontSize: 15.5 }}>{naira(order.total)}</T>
                        <Badge label={t.dynamic(`status.${order.status}`, order.status)} bg={tone.bg} fg={tone.fg} />
                      </View>
                    }
                    onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
                  />
                );
              })}
            </List>
          ) : null}

          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("po.note")}</T>
        </>
      ) : null}
    </Screen>
  );
}
