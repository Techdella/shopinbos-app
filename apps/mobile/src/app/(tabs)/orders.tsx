import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Card, Chip, Notice, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { fetchOrders, TONE_COLORS, type OrderRow } from "@/lib/dashboard";
import { router, useFocusEffect } from "expo-router";
import { PillButton } from "@/components/ui";
import { colors } from "@/theme";

const FILTERS = [
  { key: "", label: "All" },
  { key: "paid", label: "To send" },
  { key: "awaiting_payment", label: "Not paid" },
  { key: "shipped", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

export default function Orders() {
  const [filter, setFilter] = useState("");
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders((await fetchOrders(filter || undefined)).map((order) => order.row));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load orders.");
    }
  }, [filter]);

  // Reload when coming back from an order or a recorded sale.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <TabScreen title="Orders" action={<PillButton title="Record sale" size="sm" onPress={() => router.push("/record-sale")} />} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {FILTERS.map((item) => <Chip key={item.key} label={item.label} on={filter === item.key} onPress={() => setFilter(item.key)} />)}
      </View>
      {error && <Notice>{error}</Notice>}
      {orders && !orders.length && <Card><T style={{ color: colors.inkSoft }}>No orders here yet.</T></Card>}
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
              <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{order.summary}</T>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: TONE_COLORS[order.stage.tone].bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <T weight="bold" style={{ fontSize: 11.5, color: TONE_COLORS[order.stage.tone].fg }}>{order.stage.label}</T>
                </View>
                <View style={{ backgroundColor: TONE_COLORS[order.payment.tone].bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <T weight="bold" style={{ fontSize: 11.5, color: TONE_COLORS[order.payment.tone].fg }}>{order.payment.label}</T>
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
