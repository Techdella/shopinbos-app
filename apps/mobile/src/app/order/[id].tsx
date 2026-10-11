import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { CHANNEL_LABEL, type OrderChannel } from "@shared/channels";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { Card, Notice, PillButton, Segmented, T } from "@/components/ui";
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
      setError(loadError instanceof Error ? loadError.message : "Couldn't load this order.");
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
      setError(updateError instanceof Error ? updateError.message : "Couldn't update this order.");
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

  return (
    <Screen
      title={order.buyerName}
      sub={`${order.orderNumber} · ${new Date(order.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
    >
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Badge {...order.row.stage} />
        <Badge {...order.row.payment} />
      </View>
      {error && <Notice>{error}</Notice>}

      {/* What to do next */}
      {unpaid && (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>Got the money?</T>
          <Segmented<PaidWith> options={[{ value: "transfer", label: "Transfer" }, { value: "cash", label: "Cash" }, { value: "pos", label: "POS" }]} value={paidWith} onChange={setPaidWith} />
          <PillButton title="Mark as paid" size="md" busy={busy === "paid"} onPress={() => void change("paid", { paymentMethod: paidWith })} />
          {phone && <PillButton title="Remind on WhatsApp" tone="white" size="md" onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(reminder)}`)} />}
        </Card>
      )}
      {toSend && (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>Send it out</T>
          <PillButton title="Book a rider" size="md" onPress={() => void openWeb(`/home/orders/${order.id}`)} />
          <PillButton title="I sent it myself" tone="white" size="md" busy={busy === "shipped"} onPress={() => void change("shipped", { logisticsType: "personal" })} />
          <PillButton title="Print a label" tone="white" size="md" onPress={() => void openWeb(`/home/labels?orders=${order.id}`)} />
        </Card>
      )}
      {order.status === "shipped" && (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>On the way{order.trackingCode ? ` · ${order.trackingCode}` : ""}</T>
          <PillButton title="Mark as delivered" size="md" busy={busy === "delivered"} onPress={() => void change("delivered")} />
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
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <PillButton title="WhatsApp" size="sm" tone="forest" style={{ flex: 1 }} onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}`)} />
            <PillButton title="Call" size="sm" tone="white" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`)} />
          </View>
        )}
      </Card>

      {(unpaid || toSend) && <PillButton title="Cancel order" tone="white" size="md" busy={busy === "cancelled"} onPress={confirmCancel} />}
    </Screen>
  );
}
