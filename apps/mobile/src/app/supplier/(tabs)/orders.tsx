import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AcceptCountdown } from "@/components/AcceptCountdown";
import { HelpButton } from "@/components/Help";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb } from "@/components/partner";
import { OrderRow, openOrder } from "@/components/SupplierOrderRow";
import { TabScreen } from "@/components/TabScreen";
import { Card, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchQuoteRequests, fetchSupplierOrders, moveSupplierOrder, type QuoteRequest, type SupplierOrder } from "@/lib/supplier";
import { countWord, orderKindLabel, supplierOrderGroup, waitingLabel, type SupplierOrderGroup } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Supplier orders (build spec 8A): New, To pack and Sent. A new order shows what you get and a big Accept button.
// Quote requests from shops ("A shop wants 50 pieces") sit at the top of New. Each new order counts down the time
// left to accept it ("Accept in 2h 14m"; amber in the last 30 minutes).

function orderTitle(order: SupplierOrder) {
  return order.kind === "dropship" ? order.items.map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
}

function NewOrderCard({ order, onAccepted }: { order: SupplierOrder; onAccepted: (order: SupplierOrder) => void }) {
  const t = useT("m_supplier", "m_partner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = order.kind === "dropship" ? order.label.address[order.label.address.length - 1] ?? order.label.to : order.address.split(",").pop()?.trim() || t("theShop");

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      onAccepted(await moveSupplierOrder(order.kind, order.id, "accept"));
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  function cant() {
    Alert.alert(t("cant.title"), t("cant.body"), [
      { text: t("keepIt"), style: "cancel" },
      { text: t("cant.confirm"), style: "destructive", onPress: () => void moveSupplierOrder(order.kind, order.id, "decline").then(onAccepted).catch((e) => setError(e instanceof Error ? e.message : t("error.short"))) },
    ]);
  }

  return (
    <Card style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => openOrder(order)} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Thumb uri={order.kind === "dropship" ? order.items[0]?.image : order.product.image} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{orderTitle(order)}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={1}>{t("orders.forTo", { kind: orderKindLabel(order.kind, t), shop: order.shop, area })}</T>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T weight="extrabold" style={{ fontSize: 18, color: colors.success }}>{t("orders.youGet", { amount: naira(order.kind === "dropship" ? order.yourTotal : order.total) })}</T>
        {order.acceptBy ? null : <T style={{ color: colors.accentInk, fontSize: 15 }}>{waitingLabel(order.createdAt, undefined, t)}</T>}
      </View>
      <AcceptCountdown acceptBy={order.acceptBy} />
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title={t("accept")} busy={busy} onPress={() => void accept()} />
      <LinkButton title={t("orders.iCant")} color={colors.inkSoft} onPress={cant} />
    </Card>
  );
}

function QuoteRequestRow({ quote }: { quote: QuoteRequest }) {
  const t = useT("m_supplier");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } })}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.peach, borderRadius: radii.card, padding: 14, opacity: pressed ? 0.85 : 1 })}
    >
      <Thumb uri={quote.supplierProduct.images[0]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{t("wants", { shop: quote.seller.name, pieces: countWord(quote.quantity, t) })}</T>
        <T style={{ color: colors.accentInk, fontSize: 15 }} numberOfLines={1}>{t("orders.quoteRequest", { product: quote.supplierProduct.name })}</T>
      </View>
    </Pressable>
  );
}

export default function SupplierOrders() {
  const t = useT("m_supplier");
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
    <TabScreen title={t("orders.title")} action={<HelpButton />} refreshing={loader.refreshing} onRefresh={() => void loader.refresh()}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "new", label: fresh.length + requests.length ? t("orders.newCount", { count: fresh.length + requests.length }) : t("orders.new") },
          { value: "pack", label: toPack.length ? t("orders.packCount", { count: toPack.length }) : t("orders.pack") },
          { value: "sent", label: t("orders.sent") },
        ]}
      />
      <View style={{ marginTop: 14, gap: 10 }}>
        {loader.loading && !loader.data ? <LoadingBlock label={t("orders.loading")} /> : null}
        {loader.error && !loader.data ? <ErrorState message={loader.error} onRetry={() => void loader.reload()} /> : null}
        {view === "new" && open.data ? (
          <>
            {requests.map((quote) => <QuoteRequestRow key={quote.id} quote={quote} />)}
            {fresh.map((order) => <NewOrderCard key={order.id} order={order} onAccepted={accepted} />)}
            {!fresh.length && !requests.length ? (
              <EmptyState icon="bag" title={t("orders.noNew")}>{t("orders.noNewBody")}</EmptyState>
            ) : null}
          </>
        ) : null}
        {view === "pack" && open.data ? (
          toPack.length ? (
            <>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("orders.whiteLabel")}</T>
              {toPack.map((order) => <OrderRow key={order.id} order={order} />)}
            </>
          ) : (
            <EmptyState icon="box" title={t("orders.nothingToPack")}>{t("orders.nothingToPackBody")}</EmptyState>
          )
        ) : null}
        {view === "sent" && sent.data ? (
          done.length ? done.map((order) => <OrderRow key={order.id} order={order} />) : <EmptyState icon="truck" title={t("orders.nothingSent")}>{t("orders.nothingSentBody")}</EmptyState>
        ) : null}
      </View>
    </TabScreen>
  );
}
