import { useState } from "react";
import { Alert, Linking, Pressable, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon, type AppIconName } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { KeyValue, Thumb } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { fetchSupplierOrder, moveSupplierOrder, type DropshipOrder, type OrderAction, type SupplierOrder } from "@/lib/supplier";
import { ORDER_KIND_LABEL, supplierOrderGroup, supplierOrderStage } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// One supplier order, as a guided flow (build spec 8A): a new order shows what you get and Accept; then "Pack it
// with this label" (print or send it, show it on the phone, or write it by hand) and "I've packed it"; then the
// parcel goes to the rider. Uses the same order actions as before (accept, decline, packed, handed_over, delivered).
// The backend doesn't book a rider for a set time yet, so the rider step says it in plain words without a time.

type LabelWay = "share" | "phone" | "hand";

const LABEL_WAYS: Array<{ key: LabelWay; icon: AppIconName; label: string; hint: string }> = [
  { key: "phone", icon: "phone", label: "Show it on my phone", hint: "The rider reads it from your screen" },
  { key: "share", icon: "printer", label: "Print it or send it", hint: "To a printer, or to someone on WhatsApp" },
  { key: "hand", icon: "doc", label: "Write it by hand", hint: "Copy these words onto the parcel" },
];

function labelLines(order: DropshipOrder) {
  return [
    `From: ${order.label.from}`,
    `To: ${order.label.to}`,
    order.label.phone ? `Phone: ${order.label.phone}` : null,
    ...order.label.address,
    `Order ${order.ref}`,
    order.label.collect > 0 ? `Rider collects ${naira(order.label.collect)}` : null,
  ].filter(Boolean) as string[];
}

function itemsTitle(order: SupplierOrder) {
  return order.kind === "dropship" ? order.items.map((item) => `${item.name}${item.variant ? ` (${item.variant})` : ""}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
}

function Step({ n, children }: { n: number; children: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
        <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 13 }}>{String(n)}</T>
      </View>
      <T style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{children}</T>
    </View>
  );
}

function ShopLabel({ order, big }: { order: DropshipOrder; big?: boolean }) {
  const size = big ? 20 : 16;
  return (
    <View accessibilityLabel={`Label: ${labelLines(order).join(". ")}`} style={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink, borderStyle: "dashed", borderRadius: radii.card, padding: 18, gap: 6 }}>
      <T weight="extrabold" style={{ fontSize: big ? 26 : 20 }}>{order.label.from}</T>
      <T style={{ color: colors.inkSoft, fontSize: 15 }}>Order {order.ref}</T>
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
      <T style={{ color: colors.inkSoft, fontSize: 15 }}>To:</T>
      <T weight="extrabold" style={{ fontSize: size + 2 }} selectable>{order.label.to}</T>
      {order.label.address.map((line) => <T key={line} style={{ fontSize: size }} selectable>{line}</T>)}
      {order.label.phone ? (
        <T weight="bold" style={{ fontSize: size, color: colors.forest }} onPress={() => void Linking.openURL(`tel:${order.label.phone}`)} accessibilityRole="link">{order.label.phone}</T>
      ) : null}
      {order.label.collect > 0 ? <T weight="extrabold" style={{ fontSize: size, color: colors.accentInk, marginTop: 6 }}>Rider collects {naira(order.label.collect)}</T> : null}
    </View>
  );
}

export default function SupplierOrderScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const orderKind = kind === "wholesale" ? "wholesale" : "dropship";
  const order = useLoad(() => fetchSupplierOrder(orderKind, String(id)), `${orderKind}:${id}`);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [way, setWay] = useState<LabelWay>("phone");
  // Shops' single orders have no "packed" status on the server: "I've packed it" moves to the rider step here.
  const [packed, setPacked] = useState(false);
  const [riderCode, setRiderCode] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const data = order.data;

  async function run(current: SupplierOrder, action: OrderAction) {
    setBusy(action);
    setError(null);
    try {
      order.setData(await moveSupplierOrder(current.kind, current.id, action, action === "handed_over" ? riderCode : undefined));
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function cant(current: SupplierOrder) {
    Alert.alert("Can't do this one?", "We tell the shop, so they can get it from someone else.", [
      { text: "Keep it", style: "cancel" },
      { text: "I can't do it", style: "destructive", onPress: () => void run(current, "decline") },
    ]);
  }

  async function shareLabel(current: DropshipOrder) {
    await Share.share({ message: labelLines(current).join("\n") }).catch(() => null);
  }

  if (!data) {
    return (
      <Screen title="Order" refreshing={order.refreshing} onRefresh={() => void order.refresh()}>
        {order.loading ? <LoadingBlock /> : null}
        {order.error ? <ErrorState message={order.error} onRetry={() => void order.reload()} /> : null}
      </Screen>
    );
  }

  const group = supplierOrderGroup(data);
  const youGet = data.kind === "dropship" ? data.yourTotal : data.total;
  const area = data.kind === "dropship" ? data.label.address[data.label.address.length - 1] ?? data.label.to : data.address || "the shop";
  // Where this order is in the flow.
  const stage: "new" | "label" | "rider" | "with-rider" | "finished" =
    group === "new" ? "new" : data.next.includes("packed") ? "label" : data.next.includes("handed_over") ? (data.kind === "dropship" && !packed ? "label" : "rider") : data.next.includes("delivered") ? "with-rider" : "finished";

  const title = stage === "new" ? itemsTitle(data) : stage === "label" ? "Pack it with this label" : stage === "rider" ? "Ready for the rider" : supplierOrderStage(data.status);

  let footer = null;
  if (stage === "new") {
    footer = (
      <View style={{ gap: 4 }}>
        <PillButton title="Accept order" busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => void run(data, "accept")} />
        <LinkButton title="I can't do this one" color={colors.inkSoft} onPress={() => cant(data)} />
      </View>
    );
  } else if (stage === "label") {
    footer = <PillButton title="I've packed it" busy={busy === "packed"} disabled={Boolean(busy)} onPress={() => (data.kind === "wholesale" ? void run(data, "packed") : setPacked(true))} />;
  } else if (stage === "rider") {
    footer = <PillButton title="I gave it to the rider" busy={busy === "handed_over"} disabled={Boolean(busy)} onPress={() => void run(data, "handed_over")} />;
  } else if (stage === "with-rider") {
    footer = <PillButton title="It was delivered" busy={busy === "delivered"} disabled={Boolean(busy)} onPress={() => void run(data, "delivered")} />;
  }

  return (
    <Screen title={title} sub={`${data.kind === "dropship" ? ORDER_KIND_LABEL.dropship : ORDER_KIND_LABEL.wholesale} · ${data.shop} · ${capitalise(friendlyDay(data.createdAt))}`} refreshing={order.refreshing} onRefresh={() => void order.refresh()} footer={footer}>
      {error ? <Notice>{error}</Notice> : null}
      {data.rejectReason ? <Notice tone="info">{data.rejectReason.startsWith("Cancelled by the seller") ? data.rejectReason : `You said no to this order: ${data.rejectReason}`}</Notice> : null}

      {stage === "new" ? (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Thumb uri={data.kind === "dropship" ? data.items[0]?.image : data.product.image} size={64} />
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={3}>{itemsTitle(data)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>Going to {area}</T>
            </View>
          </Card>
          <Card style={{ gap: 4 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>You get, after delivery</T>
            <T weight="extrabold" style={{ fontSize: 30, color: colors.success }}>{naira(youGet)}</T>
          </Card>
          <Card style={{ gap: 12 }}>
            <Step n={1}>Accept the order</Step>
            <Step n={2}>{data.kind === "dropship" ? `Pack it with ${data.shop}'s label. Don't put your own name inside.` : "Pack it and get it ready."}</Step>
            <Step n={3}>A rider comes to collect it. You don&apos;t pay for delivery.</Step>
          </Card>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>The shop pays first. We keep the money safe and send it to you after delivery.</T>
        </>
      ) : null}

      {stage === "label" && data.kind === "dropship" ? (
        <>
          <ShopLabel order={data} big={way === "phone"} />
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>The customer thinks it came from {data.shop}. That&apos;s how the shop keeps buying from you.</T>
          <T weight="extrabold" style={{ fontSize: 22, marginTop: 6 }}>How do you want the label?</T>
          {LABEL_WAYS.map((option) => {
            const on = way === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setWay(option.key);
                  if (option.key === "share") void shareLabel(data);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, padding: 14, borderRadius: radii.card, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface }}
              >
                <AppIcon name={option.icon} size={22} />
                <View style={{ flex: 1 }}>
                  <T weight="extrabold" style={{ fontSize: 16 }}>{option.label}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{option.hint}</T>
                </View>
              </Pressable>
            );
          })}
          <Card style={{ gap: 6 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>What goes inside</T>
            {data.items.map((item, index) => (
              <View key={`${item.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Thumb uri={item.image} size={40} />
                <T style={{ flex: 1, fontSize: 15 }}>{item.name}{item.variant ? ` (${item.variant})` : ""}</T>
                <T weight="extrabold" style={{ fontSize: 16 }}>×{item.quantity}</T>
              </View>
            ))}
            {data.mixed ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>The shop&apos;s order has other things too. Send only these.</T> : null}
            {data.notes ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>Note: {data.notes}</T> : null}
          </Card>
        </>
      ) : null}

      {stage === "label" && data.kind === "wholesale" ? (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Thumb uri={data.product.image} size={56} />
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{itemsTitle(data)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{naira(data.unitPrice)} each</T>
            </View>
          </Card>
          <Card style={{ gap: 4 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>Send to</T>
            <T weight="bold" style={{ fontSize: 16, lineHeight: 22 }} selectable>{data.address || "No address yet. Message the shop."}</T>
            {data.notes ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>Note: {data.notes}</T> : null}
          </Card>
        </>
      ) : null}

      {stage === "rider" ? (
        <>
          <Card style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="check" size={34} color={colors.success} strokeWidth={2.6} />
            </View>
            <T weight="extrabold" style={{ fontSize: 22, textAlign: "center" }}>It&apos;s packed</T>
            <T style={{ fontSize: 15, lineHeight: 22, textAlign: "center", color: colors.inkSoft }}>A rider comes to your shop to collect it. We&apos;ll message you before they arrive. Hand them the parcel, then tap the button below.</T>
          </Card>
          {data.kind === "dropship" ? <ShopLabel order={data} /> : null}
          {moreOpen ? (
            <View style={{ gap: 6 }}>
              <T weight="bold" style={{ fontSize: 15 }}>Rider&apos;s code (optional)</T>
              <Field value={riderCode} onChangeText={setRiderCode} placeholder="If the rider gives you one" autoCapitalize="characters" accessibilityLabel="Rider's code" />
            </View>
          ) : (
            <LinkButton title="The rider gave me a code (optional)" color={colors.inkSoft} onPress={() => setMoreOpen(true)} />
          )}
        </>
      ) : null}

      {stage === "with-rider" || stage === "finished" ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{itemsTitle(data)}</T>
          <KeyValue first label="You get" value={naira(youGet)} />
          <KeyValue label="Where it is" value={supplierOrderStage(data.status)} />
          {data.trackingCode ? <KeyValue label="Rider's code" value={data.trackingCode} /> : null}
        </Card>
      ) : null}

      {data.sellerUserId ? <LinkButton title={`Message ${data.shop}`} onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.sellerUserId!, name: data.shop } })} /> : null}
    </Screen>
  );
}
