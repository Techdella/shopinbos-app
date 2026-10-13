import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { EmptyState } from "@/components/kit";
import { Chip, Notice, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { fetchOrders, TONE_COLORS, type OrderRow } from "@/lib/dashboard";
import { router, useFocusEffect } from "expo-router";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { colors } from "@/theme";
import { PushPromptCard } from "@/components/PushPromptCard";

const FILTERS = [
  { key: "", label: "All" },
  { key: "paid", label: "To send" },
  { key: "awaiting_payment", label: "Not paid" },
  { key: "shipped", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

export default function Orders() {
  const [filter, setFilter] = useState("");
  const [orders, setOrders] = useState<(OrderRow & { createdAt: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders((await fetchOrders(filter || undefined)).map((order) => ({ ...order.row, createdAt: order.createdAt })));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Your orders didn't load. Pull down to try again.");
    }
  }, [filter]);

  // Reload when coming back from an order or a recorded sale.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <TabScreen title="Orders" refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {FILTERS.map((item) => <Chip key={item.key} label={item.label} on={filter === item.key} onPress={() => setFilter(item.key)} />)}
      </View>
      {error && <Notice>{error}</Notice>}
      {orders?.length ? <View style={{ marginBottom: 14 }}><PushPromptCard who="seller" /></View> : null}
      {orders && !orders.length && (
        filter ? (
          <EmptyState icon="bag" title="Nothing here right now">Tap &quot;All&quot; to see every order.</EmptyState>
        ) : (
          <EmptyState icon="bag" title="No orders yet" action={<PillButton title="Record a sale" size="md" onPress={() => router.push("/record-sale")} />}>
            When someone buys from your shop, the order shows here. Sold on WhatsApp or in person? Record the sale.
          </EmptyState>
        )
      )}
      <View style={{ gap: 10 }}>
        {orders?.map((order) => (
          <Pressable key={order.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12 }}>
            {order.image ? (
              <Image source={{ uri: order.image }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                <T weight="extrabold">{order.buyer.charAt(0).toUpperCase()}</T>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{order.buyer}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{order.summary} · {capitalise(friendlyDay(order.createdAt))}</T>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: TONE_COLORS[order.stage.tone].bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <T weight="bold" style={{ fontSize: 14, color: TONE_COLORS[order.stage.tone].fg }}>{order.stage.label}</T>
                </View>
                <View style={{ backgroundColor: TONE_COLORS[order.payment.tone].bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <T weight="bold" style={{ fontSize: 14, color: TONE_COLORS[order.payment.tone].fg }}>{order.payment.label}</T>
                </View>
              </View>
            </View>
            <T weight="extrabold" style={{ fontSize: 15 }}>{naira(order.total)}</T>
          </Pressable>
        ))}
      </View>
    </TabScreen>
  );
}
