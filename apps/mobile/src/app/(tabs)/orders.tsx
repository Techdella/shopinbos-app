import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Seg, Sub } from "@/components/design";
import { EmptyState } from "@/components/kit";
import { Thumb } from "@/components/seller/bits";
import { Notice, PillButton } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { fetchOrders, type OrderRow } from "@/lib/dashboard";
import { fetchDeliveryHub } from "@/lib/delivery";
import { ORDER_GROUPS, orderGroup, type OrderGroup } from "@/lib/delivery-pure";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { PushPromptCard } from "@/components/PushPromptCard";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Orders ("Seller app" prototype `on.orders`): three chips with counts (Needs action, On the way, Done) over one
// card of rows: picture, "customer · total", "item · where it is". A delivery a partner declined (or didn't take
// in time) puts its order under Needs action.

type Listed = OrderRow & { createdAt: string; status: string };

export default function Orders() {
  const t = useT("m_orders", "m_ui", "nav");
  const [group, setGroup] = useState<OrderGroup>("need");
  const [orders, setOrders] = useState<Listed[] | null>(null);
  const [problems, setProblems] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, hub] = await Promise.all([fetchOrders(), fetchDeliveryHub().catch(() => null)]);
      setOrders(list.map((order) => ({ ...order.row, createdAt: order.createdAt, status: order.status ?? "paid" })));
      setProblems(new Map((hub?.exceptions ?? []).flatMap((entry) => (entry.order ? [[entry.order.id, entry.job.partner.displayName] as [string, string]] : []))));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("list.loadFailed"));
    }
  }, [t]);

  // Reload when coming back from an order or a recorded sale.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const grouped = useMemo(() => {
    const out: Record<OrderGroup, Listed[]> = { need: [], way: [], done: [] };
    for (const order of orders ?? []) out[orderGroup(order.status, problems.has(order.id))].push(order);
    return out;
  }, [orders, problems]);
  const shown = grouped[group];

  return (
    <TabScreen title={t("tab.orders")} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }} style={{ marginHorizontal: -20, flexGrow: 0 }}>
        {ORDER_GROUPS.map((key) => (
          <Seg key={key} label={`${t(`list.group.${key}`)} ${orders ? grouped[key].length : ""}`.trim()} on={group === key} onPress={() => setGroup(key)} />
        ))}
      </ScrollView>
      {error && <Notice>{error}</Notice>}
      {orders?.length ? <PushPromptCard who="seller" /> : null}
      {orders && !orders.length ? (
        <EmptyState icon="bag" title={t("list.emptyTitle")} action={<PillButton title={t("list.recordSale")} size="md" onPress={() => router.push("/record-sale")} />}>
          {t("list.emptyBody")}
        </EmptyState>
      ) : null}
      {orders?.length && !shown.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <Sub>{t("list.nothingTitle")}</Sub>
        </View>
      ) : null}
      {shown.length ? (
        <List>
          {shown.map((order) => {
            const declinedBy = problems.get(order.id);
            const where = declinedBy ? t("list.partnerProblem", { name: declinedBy }) : order.stage.label;
            return (
              <Row
                key={order.id}
                lead={<Thumb uri={order.image} fallback={order.buyer} />}
                title={`${order.buyer} · ${naira(order.total)}`}
                sub={`${order.summary} · ${where} · ${capitalise(friendlyDay(order.createdAt, new Date(), t))}`}
                onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
              />
            );
          })}
        </List>
      ) : null}
    </TabScreen>
  );
}
