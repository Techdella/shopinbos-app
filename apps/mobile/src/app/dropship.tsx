import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { ButtonRow, Card, Chip, Notice, PillButton, T } from "@/components/ui";
import { fetchDropship, filterDropship, setPaused, type DropshipFilter, type DropshipItem } from "@/lib/dropship";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Dropship (web /home/dropship): products suppliers send straight to buyers, with Cost / Sell / You keep,
// the supplier's stock, and Pause / Sell again. Price opens the product editor (app/product/[id].tsx).

// Labels are m_products keys.
const FILTERS: { key: DropshipFilter; label: "dropship.filter.all" | "dropship.filter.selling" | "dropship.filter.paused" | "dropship.filter.attention" }[] = [
  { key: "all", label: "dropship.filter.all" },
  { key: "selling", label: "dropship.filter.selling" },
  { key: "paused", label: "dropship.filter.paused" },
  { key: "attention", label: "dropship.filter.attention" },
];

type Words = ReturnType<typeof useT<["m_products"]>>;

function stockBadge(stock: number, t: Words) {
  if (stock <= 0) return { label: t("dropship.stockOut"), bg: colors.dangerTint, fg: colors.danger };
  if (stock < 5) return { label: t("dropship.stockLow", { count: stock }), bg: "#FDF0D5", fg: "#8A5A00" };
  return { label: t("dropship.stockIn", { count: stock }), bg: colors.successTint, fg: colors.success };
}

function DropshipCard({ item, onToggle, busy }: { item: DropshipItem; onToggle: () => void; busy: boolean }) {
  const t = useT("m_products");
  const stock = stockBadge(item.stock, t);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", gap: 12, padding: 12 }}>
        <View style={{ width: 84, height: 84, borderRadius: 14, overflow: "hidden", backgroundColor: colors.canvas }}>
          {item.image ? <Image source={{ uri: item.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} /> : null}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={2}>{item.product.name}</T>
          <T style={{ fontSize: 14, color: colors.inkSoft }} numberOfLines={1}>{[item.supplier.name, item.supplier.city, item.ships].filter(Boolean).join(" · ")}</T>
          <T style={{ fontSize: 14 }}>
            {t("dropship.cost")} <T weight="extrabold" style={{ fontSize: 14 }}>{naira(item.sale.supplierGets)}</T>  ·  {t("dropship.sell")} <T weight="extrabold" style={{ fontSize: 14 }}>{naira(item.sale.shopperPays)}</T>
          </T>
          <T weight="extrabold" style={{ fontSize: 14, color: item.sale.keep > 0 ? colors.success : colors.danger }}>
            {item.sale.keep > 0 ? t("dropship.keep", { amount: naira(item.sale.keep), percent: item.sale.keepPct }) : t("dropship.lose", { amount: naira(-item.sale.keep) })}
          </T>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
            <Badge label={item.paused ? t("dropship.paused") : item.live ? t("dropship.selling") : t("dropship.notPublished")} bg={item.live ? colors.mintTint : colors.canvas} fg={item.live ? colors.forest : colors.inkSoft} />
            <Badge label={stock.label} bg={stock.bg} fg={stock.fg} />
          </View>
        </View>
      </View>
      <ButtonRow labels={[t("dropship.price"), item.paused ? t("dropship.sellAgain") : t("dropship.pause"), t("dropship.message")]} size="sm" gap={8} style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <PillButton title={t("dropship.price")} tone="white" size="sm" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.product.id } })} />
        <PillButton title={item.paused ? t("dropship.sellAgain") : t("dropship.pause")} tone="white" size="sm" busy={busy} style={{ flex: 1 }} onPress={onToggle} />
        <PillButton title={t("dropship.message")} tone="white" size="sm" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/partners/[id]", params: { id: item.supplier.userId, name: item.supplier.name } })} />
      </ButtonRow>
    </Card>
  );
}

export default function DropshipScreen() {
  const t = useT("m_products");
  const loaded = useLoad(fetchDropship);
  const [filter, setFilter] = useState<DropshipFilter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = loaded.data ?? [];
  const shown = filterDropship(items, filter);
  const attention = items.filter((item) => item.stock < 5).length;

  async function toggle(item: DropshipItem) {
    setBusy(item.id);
    setError(null);
    try {
      const result = await setPaused(item.id, !item.paused);
      loaded.setData((current) => (current ?? []).map((row) => (row.id === item.id ? { ...row, paused: result.status === "paused", live: result.status === "active" } : row)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dropship.changeFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={t("dropship.title")} sub={t("dropship.subShort")} tip={t("dropship.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading ? <LoadingBlock /> : null}
      {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {loaded.data && items.length === 0 ? (
        <EmptyState icon="truck" title={t("dropship.emptyTitle")} action={<PillButton title={t("dropship.findToSell")} size="md" onPress={() => router.push("/find")} />}>
          {t("dropship.emptyBody")}
        </EmptyState>
      ) : null}
      {items.length > 0 ? (
        <>
          {attention > 0 ? <Notice tone="info">{t("dropship.attention", { count: attention })}</Notice> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {FILTERS.map((entry) => <Chip key={entry.key} label={t(entry.label)} on={filter === entry.key} onPress={() => setFilter(entry.key)} />)}
          </View>
          {shown.length === 0 ? <T style={{ color: colors.inkSoft, textAlign: "center", paddingVertical: 20 }}>{t("dropship.nothing")}</T> : null}
          {shown.map((item) => <DropshipCard key={item.id} item={item} busy={busy === item.id} onToggle={() => void toggle(item)} />)}
          <PillButton title={t("dropship.findMore")} onPress={() => router.push("/find")} />
        </>
      ) : null}
    </Screen>
  );
}
