import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { CHANNEL_LABEL, type OrderChannel } from "@shared/channels";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { Card, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { capitalise, friendlyTime } from "@/lib/friendly";
import { Screen } from "@/components/Screen";
import { TONE_COLORS } from "@/lib/dashboard";
import { fetchOrder, updateOrder, type OrderDetail } from "@/lib/orders";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

type PaidWith = "transfer" | "cash" | "pos";

function Badge({ label, tone }: OrderDetail["row"]["stage"]) {
  return (
    <View style={{ backgroundColor: TONE_COLORS[tone].bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <T weight="bold" style={{ fontSize: 12.5, color: TONE_COLORS[tone].fg }}>{label}</T>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <T style={{ color: strong ? colors.ink : colors.inkSoft }} weight={strong ? "extrabold" : "regular"}>{label}</T>
      <T weight={strong ? "extrabold" : "semibold"}>{value}</T>
    </View>
  );
}

/** wa.me wants the number in international form without "+"; Nigerian local numbers start with 0. */
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paidWith, setPaidWith] = useState<PaidWith>("transfer");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrder(id));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "This order didn't load. Pull down to try again.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(status: string, extra: { paymentMethod?: string; logisticsType?: "personal" } = {}) {
    setBusy(status);
    setError(null);
    try {
      setOrder(await updateOrder(id, { status, ...extra }));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "That didn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function confirmCancel() {
    Alert.alert("Cancel this order?", "The customer won't be charged and the order moves to Cancelled.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel order", style: "destructive", onPress: () => void change("cancelled") },
    ]);
  }

  if (!order) {
    return (
      <Screen title="Order">
        {error ? <Notice>{error}</Notice> : <T style={{ color: colors.inkSoft }}>Loading…</T>}
      </Screen>
    );
  }

  const unpaid = order.status === "pending" || order.status === "awaiting_payment";
  const toSend = ["paid", "processing", "packed"].includes(order.status);
  const address = order.deliveryAddress && order.deliveryAddress.street ? [order.deliveryAddress.street, order.deliveryAddress.city, order.deliveryAddress.state].filter(Boolean).join(", ") : null;
  const phone = order.buyerPhone;
  const reminder = `Hi ${order.buyerName.split(" ")[0]}, a reminder about your order ${order.orderNumber}: ${naira(order.total)}. Let me know once you've paid. Thank you!`;

  // One main button at the bottom: the next thing to do with this order (build spec 8A). Everything else is a link.
  const footer = unpaid ? (
    <PillButton title="They paid. Mark as paid" busy={busy === "paid"} onPress={() => void change("paid", { paymentMethod: paidWith })} />
  ) : toSend ? (
    <PillButton title="Get a rider" onPress={() => void openWeb(`/home/orders/${order.id}`)} />
  ) : order.status === "shipped" ? (
    <PillButton title="It was delivered" busy={busy === "delivered"} onPress={() => void change("delivered")} />
  ) : null;

  return (
    <Screen
      title={order.buyerName}
      sub={`${order.orderNumber} · ${capitalise(friendlyTime(order.createdAt))}`}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      footer={footer}
    >
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Badge {...order.row.stage} />
        <Badge {...order.row.payment} />
      </View>
      {error && <Notice>{error}</Notice>}

      {/* What to do now */}
      {unpaid && (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" style={{ fontSize: 22 }}>How did they pay?</T>
          <Segmented<PaidWith> options={[{ value: "transfer", label: "Transfer" }, { value: "cash", label: "Cash" }, { value: "pos", label: "POS" }]} value={paidWith} onChange={setPaidWith} />
          {phone && <LinkButton title="Not paid yet? Remind them on WhatsApp" color={colors.forest} onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(reminder)}`)} />}
        </Card>
      )}
      {toSend && (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 22 }}>Send the order</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>Pack it, and we&apos;ll find a rider to take it to {order.buyerName.split(" ")[0]}. Getting a rider opens in your browser.</T>
          <LinkButton title={busy === "shipped" ? "Saving…" : "I sent it myself"} onPress={() => void change("shipped", { logisticsType: "personal" })} />
          <LinkButton title="Print a label" color={colors.inkSoft} onPress={() => void openWeb(`/home/labels?orders=${order.id}`)} />
        </Card>
      )}
      {order.status === "shipped" && (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 22 }}>On the way</T>
          {order.trackingCode ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>Rider&apos;s code: {order.trackingCode}</T> : null}
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>Tap the button below when {order.buyerName.split(" ")[0]} has it.</T>
        </Card>
      )}
      {/* Items */}
      <Card style={{ gap: 4 }}>
        {order.items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.canvas }} />
            )}
            <View style={{ flex: 1 }}>
              <T weight="bold" numberOfLines={2}>{item.name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13 }}>{item.quantity} × {naira(item.price)}</T>
            </View>
            <T weight="extrabold">{naira(item.price * item.quantity)}</T>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />
        <Row label="Items" value={naira(order.subtotal)} />
        {order.discountAmount ? <Row label="Discount" value={`−${naira(order.discountAmount)}`} /> : null}
        <Row label="Delivery" value={order.shippingFee ? naira(order.shippingFee) : "Free"} />
        <Row label="Total" value={naira(order.total)} strong />
        {(order.paymentMethod || order.channel) && (
          <T style={{ color: colors.inkSoft, fontSize: 13, marginTop: 6 }}>
            {[order.paymentMethod && `Payment: ${PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}`, order.channel && `From ${CHANNEL_LABEL[order.channel as OrderChannel] ?? order.channel}`].filter(Boolean).join(" · ")}
          </T>
        )}
      </Card>

      {/* Customer */}
      <Card style={{ gap: 6 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>Customer</T>
        {phone ? <T>{phone}</T> : null}
        {order.buyerEmail ? <T>{order.buyerEmail}</T> : null}
        {address ? <T style={{ color: colors.inkSoft }}>{address}</T> : null}
        {order.notes ? <T style={{ color: colors.inkSoft }}>Note: {order.notes}</T> : null}
        {phone && (
          <View style={{ flexDirection: "row", gap: 16, marginTop: 2 }}>
            <LinkButton title={`Message on WhatsApp`} color={colors.forest} onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}`)} />
            <LinkButton title="Call" onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`)} />
          </View>
        )}
      </Card>

      {(unpaid || toSend) && <LinkButton title={busy === "cancelled" ? "Cancelling…" : "Cancel this order"} color={colors.danger} onPress={confirmCancel} />}
    </Screen>
  );
}
