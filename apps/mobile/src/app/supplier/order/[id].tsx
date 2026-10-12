import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { naira } from "@shared/onboarding";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { KeyValue, Thumb, TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { ORDER_ACTION_LABEL, orderStage, timeAgo } from "@/lib/partner-pure";
import { fetchSupplierOrder, moveSupplierOrder, type DropshipOrder, type OrderAction, type SupplierOrder } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// One supplier order. Dropship: the packing slip (what goes in the parcel) and the shipping label (the shop's name
// as sender, the buyer as recipient), then Accept / Decline → Handed to rider → Mark delivered. Wholesale: the
// order, its delivery address and Accept / Decline → packed → handed over → delivered.

function labelText(order: DropshipOrder) {
  return [
    `To: ${order.label.to}`,
    order.label.phone ? `Phone: ${order.label.phone}` : null,
    ...order.label.address,
    `From: ${order.label.from}`,
    `Order ${order.ref}`,
    order.label.collect > 0 ? `Collect ${naira(order.label.collect)} on delivery` : null,
  ].filter(Boolean).join("\n");
}

export default function SupplierOrderScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const orderKind = kind === "wholesale" ? "wholesale" : "dropship";
  const order = useLoad(() => fetchSupplierOrder(orderKind, String(id)), `${orderKind}:${id}`);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState("");
  const [copied, setCopied] = useState(false);
  const data = order.data;

  async function run(current: SupplierOrder, action: OrderAction) {
    setBusy(action);
    setError(null);
    try {
      order.setData(await moveSupplierOrder(current.kind, current.id, action, action === "handed_over" ? tracking : undefined));
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Couldn't update this order. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function act(current: SupplierOrder, action: OrderAction) {
    if (action !== "decline") return void run(current, action);
    Alert.alert("Decline this order?", "The shop is told you can't fill it.", [
      { text: "Keep it", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => void run(current, action) },
    ]);
  }

  async function copyLabel(current: DropshipOrder) {
    await Clipboard.setStringAsync(labelText(current));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const stage = data ? orderStage(data.status) : null;

  return (
    <Screen
      title={data ? `Order ${data.ref}` : "Order"}
      sub={data ? `${data.kind === "dropship" ? "Dropship" : "Wholesale"} · for ${data.shop} · ${timeAgo(data.createdAt)}` : undefined}
      refreshing={order.refreshing}
      onRefresh={() => void order.refresh()}
      footer={
        data && data.next.length ? (
          <View style={{ gap: 8 }}>
            {data.next.includes("handed_over") ? (
              <Field value={tracking} onChangeText={setTracking} placeholder="Tracking or rider code (optional)" autoCapitalize="characters" accessibilityLabel="Tracking code" style={{ height: 48 }} />
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {data.next.map((action) => (
                <PillButton
                  key={action}
                  title={ORDER_ACTION_LABEL[action]}
                  tone={action === "decline" ? "white" : "ink"}
                  size="md"
                  style={{ flex: action === "decline" ? 0.7 : 1 }}
                  busy={busy === action}
                  disabled={Boolean(busy)}
                  onPress={() => act(data, action)}
                />
              ))}
            </View>
          </View>
        ) : null
      }
    >
      {order.loading && !data ? <LoadingBlock /> : null}
      {order.error && !data ? <ErrorState message={order.error} onRetry={() => void order.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/supplier/orders") }} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {data?.rejectReason ? <Notice tone="info">{`You declined this order: ${data.rejectReason}`}</Notice> : null}

      {data && stage ? (
        <>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <TonePill tone={stage.tone} label={stage.label} />
            {data.trackingCode ? <TonePill tone="muted" label={`Tracking ${data.trackingCode}`} /> : null}
          </View>

          {data.kind === "dropship" ? (
            <>
              {data.mixed ? <Notice tone="info">{data.shop}&apos;s order has other products too. Pack and send only the items below.</Notice> : null}
              <SectionTitle>Packing slip</SectionTitle>
              <Card style={{ gap: 12 }}>
                {data.items.map((item, index) => (
                  <View key={`${item.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Thumb uri={item.image} />
                    <View style={{ flex: 1 }}>
                      <T weight="extrabold" numberOfLines={2}>{item.name}</T>
                      {item.variant ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{item.variant}</T> : null}
                    </View>
                    <T weight="extrabold" style={{ fontSize: 16 }}>× {item.quantity}</T>
                  </View>
                ))}
                <T style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 19 }}>
                  It ships as {data.shop}&apos;s parcel, so leave your own invoices and branding out.{data.notes ? `\nNote from the order: ${data.notes}` : ""}
                </T>
              </Card>

              <SectionTitle>Shipping label</SectionTitle>
              <Card style={{ gap: 4 }}>
                <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>TO</T>
                <T weight="extrabold" style={{ fontSize: 17 }} selectable>{data.label.to}</T>
                {data.label.address.map((line) => <T key={line} style={{ fontSize: 15 }} selectable>{line}</T>)}
                {data.label.phone ? (
                  <T weight="bold" style={{ fontSize: 15, color: colors.forest, marginTop: 4 }} onPress={() => void Linking.openURL(`tel:${data.label.phone}`)} accessibilityRole="link">
                    {data.label.phone}
                  </T>
                ) : null}
                <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 10 }} />
                <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>FROM</T>
                <T weight="bold">{data.label.from}</T>
                <T style={{ color: colors.inkSoft }}>Order {data.ref}</T>
                {data.label.collect > 0 ? <TonePill tone="accent" label={`Rider collects ${naira(data.label.collect)}`} style={{ marginTop: 8 }} /> : null}
                <PillButton title={copied ? "Copied" : "Copy label details"} tone="white" size="sm" style={{ marginTop: 10, alignSelf: "flex-start" }} onPress={() => void copyLabel(data)} />
              </Card>

              <Card style={{ paddingVertical: 4 }}>
                <KeyValue first label="You get" value={naira(data.yourTotal)} />
              </Card>
            </>
          ) : (
            <>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Thumb uri={data.product.image} size={56} />
                <View style={{ flex: 1 }}>
                  <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{data.product.name}</T>
                  <T style={{ color: colors.inkSoft }}>{data.quantity.toLocaleString("en-NG")} units at {naira(data.unitPrice)}</T>
                </View>
              </Card>
              <Card style={{ paddingVertical: 4 }}>
                <KeyValue first label="Total" value={naira(data.total)} />
                <KeyValue label="Shop" value={data.shop} />
                <KeyValue label="Ordered by" value={data.sellerName} />
              </Card>
              <View>
                <Label>Deliver to</Label>
                <Card>
                  <T selectable style={{ lineHeight: 21 }}>{data.address || "No address given. Message the shop."}</T>
                  {data.notes ? <T style={{ color: colors.inkSoft, marginTop: 8 }}>Note: {data.notes}</T> : null}
                </Card>
              </View>
            </>
          )}

          {data.sellerUserId ? (
            <PillButton title={`Message ${data.shop}`} tone="white" size="md" onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.sellerUserId!, name: data.shop } })} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
