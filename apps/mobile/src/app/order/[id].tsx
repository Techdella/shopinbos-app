import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { CHANNEL_LABEL, type OrderChannel } from "@shared/channels";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { Card, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { capitalise, friendlyTime } from "@/lib/friendly";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { TONE_COLORS } from "@/lib/dashboard";
import { cancelAndRefund, fetchOrder, undoSupplierSwitch, updateOrder, type OrderDetail, type OrderPart, type OrderParts } from "@/lib/orders";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

type PaidWith = "transfer" | "cash" | "pos";

function Badge({ label, tone }: OrderDetail["row"]["stage"]) {
  return (
    <View style={{ backgroundColor: TONE_COLORS[tone].bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <T weight="bold" style={{ fontSize: 14, color: TONE_COLORS[tone].fg }}>{label}</T>
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

const PART_TONE: Record<OrderPart["state"], keyof typeof TONE_COLORS> = { waiting: "muted", preparing: "warning", sent: "accent", delivered: "success", problem: "danger" };

/** "2 of 3 parcels sent" and where each parcel is. */
function Parcels({ parts }: { parts: OrderParts }) {
  return (
    <Card style={{ gap: 8 }}>
      <T weight="extrabold" style={{ fontSize: 22 }}>{parts.line ?? "Sent by the supplier"}</T>
      {parts.parts.map((part) => (
        <View key={part.key} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <T weight="bold" style={{ flexShrink: 1 }}>{part.kind === "own" ? "Your part" : part.name}</T>
            <Badge label={part.label} tone={PART_TONE[part.state] ?? "muted"} />
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{part.items}</T>
          {part.trackingCode ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>Rider&apos;s code: {part.trackingCode}</T> : null}
        </View>
      ))}
    </Card>
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
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

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

  async function undo(supplierOrderId: string) {
    setBusy("undo");
    setError(null);
    try {
      setOrder(await undoSupplierSwitch(id, supplierOrderId));
      setSaved("Undone. The order is back with you. Choose what to do below.");
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "That didn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function refund() {
    setBusy("refund");
    setError(null);
    try {
      const result = await cancelAndRefund(id);
      setOrder(result);
      setSaved(result.message);
      setConfirmRefund(false);
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : "That didn't save. Check your connection and try again.");
      setConfirmRefund(false);
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
  // Orders a supplier sends: the seller only sends their own part (if any). Parcels are tracked one by one.
  const parts = order.parts ?? null;
  const ownPart = parts?.parts.find((part) => part.kind === "own") ?? null;
  const sellerSends = !parts || ownPart?.state === "waiting";
  const toSend = ["paid", "processing", "packed"].includes(order.status) && sellerSends;
  const deciding = parts?.problems.find((problem) => problem.needsChoice && problem.status === "expired") ?? null;
  const switches = parts?.problems.filter((problem) => problem.switched) ?? [];
  const address = order.deliveryAddress && order.deliveryAddress.street ? [order.deliveryAddress.street, order.deliveryAddress.city, order.deliveryAddress.state].filter(Boolean).join(", ") : null;
  const phone = order.buyerPhone;
  const reminder = `Hi ${order.buyerName.split(" ")[0]}, a reminder about your order ${order.orderNumber}: ${naira(order.total)}. Let me know once you've paid. Thank you!`;

  // One main button at the bottom: the next thing to do with this order (build spec 8A). Everything else is a link.
  const footer = deciding ? null : unpaid ? (
    <PillButton title="They paid. Mark as paid" busy={busy === "paid"} onPress={() => void change("paid", { paymentMethod: paidWith })} />
  ) : toSend ? (
    <PillButton title="Get a rider" onPress={() => void openWeb(`/home/orders/${order.id}`)} />
  ) : order.status === "shipped" && (!ownPart || ownPart.state !== "delivered") ? (
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
      {saved && !error && <Notice tone="success">{saved}</Notice>}

      {/* A supplier didn't accept in time: we sent it to someone else (Undo until they accept)… */}
      {switches.map((problem) => (
        <Card key={problem.supplierOrderId} style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 22 }}>{problem.supplierName} didn&apos;t accept in time.</T>
          <T style={{ fontSize: 15, lineHeight: 22 }}>We sent it to {problem.switched!.toName}. {problem.switched!.costWords}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{problem.items}</T>
          {problem.switched!.canUndo ? (
            <LinkButton title={busy === "undo" ? "Undoing…" : "Undo"} color={colors.danger} onPress={() => void undo(problem.switched!.toSupplierOrderId)} />
          ) : problem.switched!.accepted ? (
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{problem.switched!.toName} accepted it.</T>
          ) : null}
        </Card>
      ))}

      {/* …or the seller chooses: find another supplier, or cancel and refund the customer. */}
      {deciding && (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" style={{ fontSize: 22 }}>{deciding.supplierName} didn&apos;t accept in time.</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>{deciding.items}. Your customer hasn&apos;t been told. What do you want to do?</T>
          <ChoiceRow
            icon="search"
            title="Find another supplier"
            sub="See who else sells it"
            tint={colors.successTint}
            onPress={() => router.push({ pathname: "/find", params: { q: deciding.searchQuery } })}
          />
          {parts?.canCancelAndRefund && (
            <ChoiceRow icon="wallet" title="Cancel and refund the customer" sub="They get their money back" onPress={() => setConfirmRefund(true)} />
          )}
        </Card>
      )}

      {parts && parts.parts.length > 0 && <Parcels parts={parts} />}

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
              <T style={{ color: colors.inkSoft, fontSize: 14 }}>{item.quantity} × {naira(item.price)}</T>
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
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>
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

      <Sheet visible={confirmRefund} onClose={() => setConfirmRefund(false)} title="Cancel and refund the customer?">
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>
          The order is cancelled and {order.buyerName.split(" ")[0]} gets {naira(order.total)} back. If they paid you directly, you send it back by transfer.
        </T>
        <PillButton title="Yes, cancel and refund" busy={busy === "refund"} onPress={() => void refund()} />
        <LinkButton title="Keep the order" onPress={() => setConfirmRefund(false)} />
      </Sheet>

      {(unpaid || toSend) && !deciding && <LinkButton title={busy === "cancelled" ? "Cancelling…" : "Cancel this order"} color={colors.danger} onPress={confirmCancel} />}
    </Screen>
  );
}
