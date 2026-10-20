import { useCallback } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, PillButton, T } from "@/components/ui";
import { TONE_COLORS } from "@/lib/dashboard";
import { friendlyDay } from "@/lib/friendly";
import { invoiceTotals, orderStatusTone } from "@/lib/money-pure";
import { fetchOrder } from "@/lib/orders";
import { shareText } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One order's invoice (web /home/invoices lists them; each opens its order): who it's for, the lines, delivery,
// discount and total, and sharing it as text. "See the order" opens the order to act on it. There's no PDF to
// download yet; sharing sends the invoice as a message.

export default function OrderInvoice() {
  const t = useT("m_money", "m_ui", "common");
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => fetchOrder(String(id)), [id]);
  const loaded = useLoad(load, String(id));
  const order = loaded.data;

  if (!order) {
    return (
      <Screen title={t("inv.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }

  const totals = invoiceTotals(order);
  const tone = TONE_COLORS[orderStatusTone(order.status)];
  const share = () => {
    const lines = totals.lines.map((line) => t("inv.shareLine", { quantity: line.quantity, name: line.name, amount: naira(line.total) })).join("\n");
    void shareText(t("inv.shareOrder", { number: order.orderNumber, lines, total: naira(totals.total) }));
  };

  return (
    <Screen
      title={t("inv.number", { number: order.orderNumber })}
      refreshing={loaded.refreshing}
      onRefresh={() => void loaded.refresh()}
      footer={
        <PillButton onPress={share} tone="accent" accessibilityLabel={t("inv.share")}>
          <AppIcon name="share" size={20} color={colors.ink} />
          <T weight="extrabold" style={{ color: colors.ink, fontSize: 17 }}>{t("inv.share")}</T>
        </PillButton>
      }
    >
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Badge label={t.dynamic(`status.${order.status}`, order.status)} bg={tone.bg} fg={tone.fg} />
          <T style={{ flex: 1, color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{`${t("inv.date")}: ${friendlyDay(order.createdAt, new Date(), t)}`}</T>
        </View>
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("inv.for")}</T>
        <T weight="extrabold" style={{ fontSize: 18 }} numberOfLines={1}>{order.buyerName || t("customer")}</T>
        {order.buyerEmail ? <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={1} selectable>{order.buyerEmail}</T> : null}
        {order.buyerPhone ? <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={1} selectable>{order.buyerPhone}</T> : null}
      </Card>

      <Card style={{ gap: 4 }}>
        <T weight="extrabold" style={{ fontSize: 16, marginBottom: 6 }} accessibilityRole="header">{t("inv.items")}</T>
        {totals.lines.length ? (
          totals.lines.map((line, index) => (
            <View key={`${line.name}-${index}`} style={{ flexDirection: "row", gap: 12, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ flex: 1 }}>
                <T weight="semibold" style={{ fontSize: 15.5 }} numberOfLines={2}>{line.name}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{`${line.quantity} × ${naira(line.price)}`}</T>
              </View>
              <T weight="bold" style={{ fontSize: 15.5 }}>{naira(line.total)}</T>
            </View>
          ))
        ) : (
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("inv.noItems")}</T>
        )}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6, paddingTop: 10, gap: 6 }}>
          <Row label={t("inv.subtotal")} value={naira(totals.subtotal)} />
          {totals.delivery ? <Row label={t("inv.delivery")} value={naira(totals.delivery)} /> : null}
          {totals.discount ? <Row label={t("inv.discount")} value={`−${naira(totals.discount)}`} /> : null}
          <Row label={t("inv.total")} value={naira(totals.total)} strong />
        </View>
      </Card>

      <PillButton title={t("inv.seeOrder")} tone="white" size="md" onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })} />
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <T weight={strong ? "extrabold" : "regular"} style={{ fontSize: strong ? 17 : 15, color: strong ? colors.ink : colors.inkSoft }}>{label}</T>
      <T weight={strong ? "extrabold" : "semibold"} style={{ fontSize: strong ? 18 : 15 }}>{value}</T>
    </View>
  );
}
