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
import { useT } from "@/lib/i18n";

// Labels are m_orders keys.
const FILTERS = [
  { key: "", label: "list.filter.all" },
  { key: "paid", label: "list.filter.toSend" },
  { key: "awaiting_payment", label: "list.filter.notPaid" },
  { key: "shipped", label: "list.filter.onTheWay" },
  { key: "delivered", label: "list.filter.delivered" },
] as const;

export default function Orders() {
  const t = useT("m_orders", "m_ui", "nav");
  const [filter, setFilter] = useState("");
  const [orders, setOrders] = useState<(OrderRow & { createdAt: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders((await fetchOrders(filter || undefined)).map((order) => ({ ...order.row, createdAt: order.createdAt })));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("list.loadFailed"));
    }
  }, [filter]);

  // Reload when coming back from an order or a recorded sale.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <TabScreen title={t("tab.orders")} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {FILTERS.map((item) => <Chip key={item.key} label={t(item.label)} on={filter === item.key} onPress={() => setFilter(item.key)} />)}
      </View>
      {error && <Notice>{error}</Notice>}
      {orders?.length ? <View style={{ marginBottom: 14 }}><PushPromptCard who="seller" /></View> : null}
      {orders && !orders.length && (
        filter ? (
          <EmptyState icon="bag" title={t("list.nothingTitle")}>{t("list.nothingBody")}</EmptyState>
        ) : (
          <EmptyState icon="bag" title={t("list.emptyTitle")} action={<PillButton title={t("list.recordSale")} size="md" onPress={() => router.push("/record-sale")} />}>
            {t("list.emptyBody")}
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
              <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{order.summary} · {capitalise(friendlyDay(order.createdAt, new Date(), t))}</T>
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
