import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { HelpButton } from "@/components/Help";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb } from "@/components/partner";
import { OrderRow, openOrder } from "@/components/SupplierOrderRow";
import { TabScreen } from "@/components/TabScreen";
import { Card, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { fetchQuoteRequests, fetchSupplierOrders, moveSupplierOrder, type QuoteRequest, type SupplierOrder } from "@/lib/supplier";
import { countWord, supplierOrderGroup, waitingLabel, type SupplierOrderGroup } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Supplier orders (build spec 8A): New, To pack and Sent. A new order shows what you get and a big Accept button.
// Bulk requests from shops ("A shop wants 50 pieces") sit at the top of New.

function orderTitle(order: SupplierOrder) {
  return order.kind === "dropship" ? order.items.map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
}

function NewOrderCard({ order, onAccepted }: { order: SupplierOrder; onAccepted: (order: SupplierOrder) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = order.kind === "dropship" ? order.label.address[order.label.address.length - 1] ?? order.label.to : order.address.split(",").pop()?.trim() || "the shop";

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      onAccepted(await moveSupplierOrder(order.kind, order.id, "accept"));
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function cant() {
    Alert.alert("Can't do this one?", "We tell the shop, so they can get it from someone else.", [
      { text: "Keep it", style: "cancel" },
      { text: "I can't do it", style: "destructive", onPress: () => void moveSupplierOrder(order.kind, order.id, "decline").then(onAccepted).catch((e) => setError(e instanceof Error ? e.message : "That didn't go through. Try again.")) },
    ]);
  }

  return (
    <Card style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => openOrder(order)} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Thumb uri={order.kind === "dropship" ? order.items[0]?.image : order.product.image} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{orderTitle(order)}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={1}>For {order.shop} · to {area}</T>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T weight="extrabold" style={{ fontSize: 18, color: colors.success }}>You get {naira(order.kind === "dropship" ? order.yourTotal : order.total)}</T>
        <T style={{ color: colors.accentInk, fontSize: 15 }}>{waitingLabel(order.createdAt)}</T>
      </View>
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title="Accept" busy={busy} onPress={() => void accept()} />
      <LinkButton title="I can't" color={colors.inkSoft} onPress={cant} />
    </Card>
  );
}

function BulkRequestRow({ quote }: { quote: QuoteRequest }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } })}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.peach, borderRadius: radii.card, padding: 14, opacity: pressed ? 0.85 : 1 })}
    >
      <Thumb uri={quote.supplierProduct.images[0]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{quote.seller.name} wants {countWord(quote.quantity)}</T>
        <T style={{ color: colors.accentInk, fontSize: 15 }} numberOfLines={1}>{quote.supplierProduct.name} · Tell them your price</T>
      </View>
    </Pressable>
  );
}

export default function SupplierOrders() {
  const [view, setView] = useState<SupplierOrderGroup>("new");
  const open = useLoad(async () => {
    const [orders, requests] = await Promise.all([fetchSupplierOrders("open"), fetchQuoteRequests().catch(() => [] as QuoteRequest[])]);
    return { orders: [...orders.dropship, ...orders.wholesale] as SupplierOrder[], requests: requests.filter((quote) => quote.status === "pending") };
  });
  const sent = useLoad(() => (view === "sent" ? fetchSupplierOrders("done") : Promise.resolve(null)), view);
  const all = open.data?.orders ?? [];
  const fresh = all.filter((order) => supplierOrderGroup(order) === "new");
  const toPack = all.filter((order) => supplierOrderGroup(order) === "pack");
  const done = sent.data ? [...sent.data.dropship, ...sent.data.wholesale].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const requests = open.data?.requests ?? [];

  function accepted(order: SupplierOrder) {
    open.setData((current) => (current ? { ...current, orders: current.orders.map((item) => (item.id === order.id ? order : item)) } : current));
    if (supplierOrderGroup(order) === "pack") openOrder(order);
  }

  const loader = view === "sent" ? sent : open;

  return (
    <TabScreen title="Orders" action={<HelpButton />} refreshing={loader.refreshing} onRefresh={() => void loader.refresh()}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "new", label: fresh.length + requests.length ? `New ${fresh.length + requests.length}` : "New" },
          { value: "pack", label: toPack.length ? `To pack ${toPack.length}` : "To pack" },
          { value: "sent", label: "Sent" },
        ]}
      />
      <View style={{ marginTop: 14, gap: 10 }}>
        {loader.loading && !loader.data ? <LoadingBlock label="Loading orders…" /> : null}
        {loader.error && !loader.data ? <ErrorState message={loader.error} onRetry={() => void loader.reload()} /> : null}
        {view === "new" && open.data ? (
          <>
            {requests.map((quote) => <BulkRequestRow key={quote.id} quote={quote} />)}
            {fresh.map((order) => <NewOrderCard key={order.id} order={order} onAccepted={accepted} />)}
            {!fresh.length && !requests.length ? (
              <EmptyState icon="bag" title="No new orders">When a shop sells your product, the order shows here. Accept it, pack it, and a rider collects it.</EmptyState>
            ) : null}
          </>
        ) : null}
        {view === "pack" && open.data ? (
          toPack.length ? (
            <>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>Pack each one with the shop&apos;s label. Don&apos;t put your own name inside.</T>
              {toPack.map((order) => <OrderRow key={order.id} order={order} />)}
            </>
          ) : (
            <EmptyState icon="box" title="Nothing to pack">Orders you accept show here until a rider collects them.</EmptyState>
          )
        ) : null}
        {view === "sent" && sent.data ? (
          done.length ? done.map((order) => <OrderRow key={order.id} order={order} />) : <EmptyState icon="truck" title="Nothing sent yet">Orders you&apos;ve given to a rider show here.</EmptyState>
        ) : null}
      </View>
    </TabScreen>
  );
}
