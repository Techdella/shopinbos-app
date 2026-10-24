import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AcceptCountdown } from "@/components/AcceptCountdown";
import { List, Row, Seg, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { OrderRow } from "@/components/SupplierOrderRow";
import { Pic } from "@/components/SupplierKit";
import { TabScreen } from "@/components/TabScreen";
import { LinkButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchQuoteRequests, fetchSupplierOrders, type QuoteRequest, type SupplierOrder } from "@/lib/supplier";
import { countWord, supplierOrderGroup, type SupplierOrderSegment } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";
import { FilterBar } from "@/components/FilterBar";

// Supplier Orders ("Simple app, end to end" supplier prototype): New, In progress, Sent and Prices, each with its
// count. Rows read "{shop} · {amount}" over "{Dropship|Wholesale} · {item} · {status}"; a new order also counts down
// the time left to accept it. Prices are the price (quote) requests shops sent.

const SEGMENTS: { key: SupplierOrderSegment; word: string }[] = [
  { key: "new", word: "orders.new" },
  { key: "pack", word: "orders.inProgress" },
  { key: "sent", word: "orders.sent" },
  { key: "prices", word: "orders.prices" },
];

export default function SupplierOrders() {
  const t = useT("m_supplier", "m_partner");
  const { view: asked } = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<SupplierOrderSegment>("new");
  useEffect(() => {
    if (asked === "new" || asked === "pack" || asked === "sent" || asked === "prices") setView(asked);
  }, [asked]);

  const loaded = useLoad(async () => {
    const [open, done, requests] = await Promise.all([fetchSupplierOrders("open"), fetchSupplierOrders("done").catch(() => null), fetchQuoteRequests().catch(() => [] as QuoteRequest[])]);
    const orders = [...open.dropship, ...open.wholesale] as SupplierOrder[];
    const sent = done ? ([...done.dropship, ...done.wholesale] as SupplierOrder[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
    return {
      fresh: orders.filter((order) => supplierOrderGroup(order) === "new").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      pack: orders.filter((order) => supplierOrderGroup(order) === "pack"),
      // An open order can already be with the rider (shipped): it counts as sent.
      sent: [...orders.filter((order) => supplierOrderGroup(order) === "sent"), ...sent],
      requests: requests.filter((quote) => quote.status === "pending"),
    };
  });
  const data = loaded.data;
  const counts: Record<SupplierOrderSegment, number> = { new: data?.fresh.length ?? 0, pack: data?.pack.length ?? 0, sent: data?.sent.length ?? 0, prices: data?.requests.length ?? 0 };
  const shown = data ? (view === "new" ? data.fresh : view === "pack" ? data.pack : view === "sent" ? data.sent : []) : [];

  return (
    <TabScreen title={t("orders.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      <FilterBar>
        {SEGMENTS.map((segment) => <Seg key={segment.key} label={t.dynamic(segment.word)} count={data ? counts[segment.key] : undefined} on={view === segment.key} onPress={() => setView(segment.key)} />)}
      </FilterBar>

      {loaded.loading && !data ? <LoadingBlock label={t("orders.loading")} /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      {data && view !== "prices" ? (
        shown.length ? (
          <List>
            {shown.map((order) => (
              <OrderRow key={`${order.kind}-${order.id}`} order={order} below={view === "new" && order.acceptBy ? <AcceptCountdown acceptBy={order.acceptBy} /> : undefined} />
            ))}
          </List>
        ) : (
          <EmptyCard text={t("orders.empty")} />
        )
      ) : null}

      {data && view === "prices" ? (
        <>
          {data.requests.length ? (
            <List>
              {data.requests.map((quote) => (
                <Row
                  key={quote.id}
                  lead={<Pic uri={quote.supplierProduct.images[0]} />}
                  title={t("orders.priceRow", { shop: quote.seller.name, pieces: countWord(quote.quantity, t) })}
                  sub={t("orders.priceRowSub", { product: quote.supplierProduct.name })}
                  onPress={() => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } })}
                />
              ))}
            </List>
          ) : (
            <EmptyCard text={t("orders.noPrices")} />
          )}
          <LinkButton title={t("orders.allPrices")} color={colors.inkSoft} onPress={() => router.push("/supplier/quotes")} />
        </>
      ) : null}
    </TabScreen>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
      <Sub>{text}</Sub>
    </View>
  );
}
