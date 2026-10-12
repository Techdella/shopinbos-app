import { useState } from "react";
import { View } from "react-native";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { OrderRow } from "@/components/SupplierOrderRow";
import { TabScreen } from "@/components/TabScreen";
import { Segmented, T } from "@/components/ui";
import { fetchSupplierOrders } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Supplier orders: dropship orders (pack with the shop's label, hand to the rider) and wholesale orders.
// Open = still to accept, pack or hand over; Done = with the rider, delivered or cancelled.

export default function SupplierOrders() {
  const [view, setView] = useState<"open" | "done">("open");
  const orders = useLoad(() => fetchSupplierOrders(view), view);
  const data = orders.data;

  return (
    <TabScreen title="Orders" refreshing={orders.refreshing} onRefresh={() => void orders.refresh()}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "open", label: data && view === "open" ? `To do ${data.counts.dropship + data.counts.wholesale}` : "To do" },
          { value: "done", label: "Sent" },
        ]}
      />
      <View style={{ marginTop: 14, gap: 10 }}>
        {orders.loading ? <LoadingBlock label="Loading orders…" /> : null}
        {orders.error && !data ? <ErrorState message={orders.error} onRetry={() => void orders.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/supplier/orders") }} /> : null}
        {data && !orders.loading ? (
          <>
            <SectionTitle>Dropship</SectionTitle>
            <T style={{ color: colors.inkSoft, marginTop: -4, lineHeight: 19 }}>Shops sold these. Pack each one with the shop&apos;s label, then hand it to the rider.</T>
            {data.dropship.length ? (
              data.dropship.map((order) => <OrderRow key={order.id} order={order} />)
            ) : (
              <EmptyState icon="bag" title={view === "open" ? "Nothing to pack" : "Nothing sent yet"}>
                {view === "open" ? "When a shop sells one of your products, it shows up here." : "Orders you've handed to a rider show up here."}
              </EmptyState>
            )}
            <SectionTitle style={{ marginTop: 14 }}>Wholesale</SectionTitle>
            {data.wholesale.length ? (
              data.wholesale.map((order) => <OrderRow key={order.id} order={order} />)
            ) : (
              <EmptyState icon="box" title={view === "open" ? "No wholesale orders waiting" : "No sent wholesale orders"}>
                Shops order in bulk at your wholesale price. Accept, pack and send them from here.
              </EmptyState>
            )}
          </>
        ) : null}
      </View>
    </TabScreen>
  );
}
