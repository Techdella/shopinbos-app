import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Seg, Sub } from "@/components/design";
import { FilterBar, FilterGroup, FilterSheet } from "@/components/FilterBar";
import { EmptyState } from "@/components/kit";
import { Thumb } from "@/components/seller/bits";
import { Chip, Field, Notice, PillButton } from "@/components/ui";
import { NO_ORDER_FILTERS, ORDER_PAYS, filterOrders, orderFilterCount, type OrderFilters } from "@/lib/order-filters-pure";
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
// in time) puts its order under Needs action. The Filters sheet adds the web's "Unpaid" and "To send" and a search by
// customer, item or order number (web /home/orders).

type Listed = OrderRow & { createdAt: string; status: string };

export default function Orders() {
  const t = useT("m_orders", "m_ui", "nav");
  const [group, setGroup] = useState<OrderGroup>("need");
  const [orders, setOrders] = useState<Listed[] | null>(null);
  const [problems, setProblems] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<OrderFilters>(NO_ORDER_FILTERS);
  const [sheet, setSheet] = useState(false);

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
    for (const order of filterOrders(orders ?? [], filters)) out[orderGroup(order.status, problems.has(order.id))].push(order);
    return out;
  }, [orders, problems, filters]);
  const shown = grouped[group];
  const set = (patch: Partial<OrderFilters>) => setFilters((now) => ({ ...now, ...patch }));

  return (
    <TabScreen title={t("tab.orders")} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <FilterBar testID="orders-filters" onMore={() => setSheet(true)} moreLabel={t("filters.title")} moreCount={orderFilterCount(filters)}>
        {ORDER_GROUPS.map((key) => (
          <Seg key={key} label={t(`list.group.${key}`)} count={orders ? grouped[key].length : undefined} on={group === key} onPress={() => setGroup(key)} />
        ))}
        {/* Stock bought from suppliers (price requests, wholesale orders, Pay) lives on its own screen. */}
        <Seg label={t("list.wholesale")} on={false} onPress={() => router.push("/wholesale")} />
      </FilterBar>
      <FilterSheet visible={sheet} onClose={() => setSheet(false)} title={t("filters.title")} doneLabel={t("filters.done")} clearLabel={t("filters.clear")} onClear={() => setFilters(NO_ORDER_FILTERS)}>
        <Field value={filters.q} onChangeText={(q) => set({ q })} placeholder={t("filters.search")} accessibilityLabel={t("filters.search")} returnKeyType="search" autoCorrect={false} style={{ height: 48 }} />
        <FilterGroup label={t("filters.pay")}>
          {ORDER_PAYS.map((pay) => (
            <Chip key={pay} label={t(`filters.pay.${pay}`)} on={filters.pay === pay} onPress={() => set({ pay })} />
          ))}
        </FilterGroup>
      </FilterSheet>
      {error && <Notice>{error}</Notice>}
      {orders?.length ? <PushPromptCard who="seller" /> : null}
      {orders && !orders.length ? (
        <EmptyState icon="bag" title={t("list.emptyTitle")} action={<PillButton title={t("list.recordSale")} size="md" onPress={() => router.push("/record-sale")} />}>
          {t("list.emptyBody")}
        </EmptyState>
      ) : null}
      {orders?.length && !shown.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 12 }}>
          <Sub>{t("list.nothingTitle")}</Sub>
          {orderFilterCount(filters) ? <PillButton title={t("filters.clear")} size="sm" tone="white" onPress={() => setFilters(NO_ORDER_FILTERS)} /> : null}
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
