import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Seg } from "@/components/design";
import { FilterBar, FilterGroup, FilterSheet } from "@/components/FilterBar";
import { Badge, EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Notice, PillButton, T } from "@/components/ui";
import { CUSTOMER_FILTERS, CUSTOMER_SORTS, fetchCustomers, hasMore, joinPages, money, type CustomerFilter, type CustomerRow, type CustomerSort } from "@/lib/customers";
import { friendlyDay } from "@/lib/friendly";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Customers (web /home/customers): everyone who has ordered, grouped like the web (by email, else phone, else
// name), with search, the web's filter chips in one sideways row (the order in the Filters sheet), and "Show more"
// paging. A tap opens the customer.

const BADGE_COLORS = {
  vip: { bg: "#FDF0D5", fg: "#8A5A00" },
  repeat: { bg: colors.successTint, fg: colors.success },
  new: { bg: colors.mintTint, fg: colors.forest },
} as const;

function CustomerCard({ customer, currency }: { customer: CustomerRow; currency: string }) {
  const t = useT("m_customers", "customers", "m_ui");
  const contact = customer.phone || customer.email;
  const colorsFor = BADGE_COLORS[customer.badge];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("open", { name: customer.name })}
      onPress={() => router.push({ pathname: "/customers/[key]", params: { key: customer.key } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Initials name={customer.name} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T weight="extrabold" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{customer.name}</T>
            <T weight="extrabold" style={{ fontSize: 16 }}>{money(customer.spent, currency)}</T>
          </View>
          {contact ? <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{contact}</T> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge label={t(`badge.${customer.badge}`)} bg={colorsFor.bg} fg={colorsFor.fg} />
            {/* One line of text; a no-break space keeps the "·" with the words before it, so a wrapped line never starts with it. */}
            <T style={{ color: colors.inkSoft, fontSize: 14, flexShrink: 1 }}>{`${t("row.orders", { count: customer.orders })}\u00A0· ${t("lastOrder", { when: friendlyDay(customer.lastAt, new Date(), t) })}`}</T>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function Customers() {
  const t = useT("m_customers", "customers", "m_ui");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<CustomerFilter>("all");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [sheet, setSheet] = useState(false);
  const [more, setMore] = useState(false);
  const [moreNote, setMoreNote] = useState<string | null>(null);

  // Search after a short pause in typing, so each letter doesn't start a new load.
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 400);
    return () => clearTimeout(timer);
  }, [typed]);

  // Coming back to the list (or pulling to refresh) reloads every page already shown, so the place isn't lost.
  const key = `${q}|${show}|${sort}`;
  const pages = useRef({ key, count: 1 });
  if (pages.current.key !== key) pages.current = { key, count: 1 };
  const list = useLoad(async () => {
    let shown = await fetchCustomers({ q, show, sort, page: 1 });
    for (let page = 2; page <= pages.current.count && page <= shown.pages; page++) shown = joinPages(shown, await fetchCustomers({ q, show, sort, page }));
    return shown;
  }, key);
  const data = list.data;
  const stats = data?.stats;
  const filtering = Boolean(q) || show !== "all";

  async function loadMore() {
    if (!data) return;
    setMore(true);
    setMoreNote(null);
    try {
      const next = await fetchCustomers({ q, show, sort, page: data.page + 1 });
      list.setData((shown) => joinPages(shown, next));
      pages.current.count = next.page;
    } catch (error) {
      setMoreNote(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setMore(false);
    }
  }

  const clear = () => {
    setTyped("");
    setQ("");
    setShow("all");
  };

  return (
    <Screen
      title={t("title")}
      sub={stats?.customers ? t("sub", { count: stats.customers, repeat: stats.returning }) : t("subEmpty")}
      refreshing={list.refreshing}
      onRefresh={() => void list.refresh()}
    >
      {stats?.customers || filtering ? (
        <>
          <Field value={typed} onChangeText={setTyped} placeholder={t("search")} returnKeyType="search" onSubmitEditing={() => setQ(typed.trim())} accessibilityLabel={t("search")} autoCapitalize="none" autoCorrect={false} style={{ height: 48 }} />
          <FilterBar testID="customers-filters" onMore={() => setSheet(true)} moreLabel={t("filters.title")} moreCount={sort !== "recent" ? 1 : 0}>
            {CUSTOMER_FILTERS.map((option) => (
              <Seg key={option} label={t(`filter.${option}`)} count={stats?.counts[option] || undefined} on={show === option} onPress={() => setShow(option)} />
            ))}
          </FilterBar>
          <FilterSheet visible={sheet} onClose={() => setSheet(false)} title={t("filters.title")} doneLabel={t("filters.done")} clearLabel={t("filters.clear")} onClear={() => { setShow("all"); setSort("recent"); }}>
            <FilterGroup label={t("sort.label")}>
              {CUSTOMER_SORTS.map((option) => <Chip key={option} label={t(`sort.${option}`)} on={sort === option} onPress={() => setSort(option)} />)}
            </FilterGroup>
          </FilterSheet>
        </>
      ) : null}

      {list.loading && !data ? <LoadingBlock /> : null}
      {list.error && !data ? <ErrorState message={list.error} onRetry={() => void list.reload()} /> : null}

      {data && !stats?.customers ? (
        <EmptyState icon="users" title={t("empty")} action={<PillButton title={t("recordSale")} size="md" onPress={() => router.push("/record-sale")} />}>
          {t("emptySub")}
        </EmptyState>
      ) : null}
      {data && stats?.customers && !data.items.length ? (
        <EmptyState icon="search" title={t("noMatch")} action={<PillButton title={t("clear")} size="sm" tone="white" onPress={clear} />}>
          {t("noMatchSub")}
        </EmptyState>
      ) : null}

      {data?.items.map((customer) => <CustomerCard key={customer.key} customer={customer} currency={data.currency} />)}

      {data && data.items.length ? <T style={{ color: colors.inkSoft, fontSize: 14, textAlign: "center" }}>{t("showing", { shown: data.items.length, total: data.total })}</T> : null}
      {moreNote ? <Notice>{moreNote}</Notice> : null}
      {hasMore(data) ? <PillButton title={t("more")} size="md" tone="white" busy={more} onPress={() => void loadMore()} /> : null}
    </Screen>
  );
}
