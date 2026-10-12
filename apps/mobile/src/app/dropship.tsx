import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Notice, PillButton, T } from "@/components/ui";
import { fetchDropship, filterDropship, setPaused, type DropshipFilter, type DropshipItem } from "@/lib/dropship";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Sell without stock (web /home/dropship): products suppliers send straight to buyers, with Cost / Sell / You keep,
// the supplier's stock, and Pause / Sell again. Prices are edited on the web product page.

const FILTERS: { key: DropshipFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "selling", label: "Selling" },
  { key: "paused", label: "Paused" },
  { key: "attention", label: "Almost finished" },
];

function stockBadge(stock: number) {
  if (stock <= 0) return { label: "Finished at the supplier", bg: colors.dangerTint, fg: colors.danger };
  if (stock < 5) return { label: `${stock} left at supplier`, bg: "#FDF0D5", fg: "#8A5A00" };
  return { label: `Supplier has ${stock}`, bg: colors.successTint, fg: colors.success };
}

function DropshipCard({ item, onToggle, busy }: { item: DropshipItem; onToggle: () => void; busy: boolean }) {
  const stock = stockBadge(item.stock);
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
            Cost <T weight="extrabold" style={{ fontSize: 14 }}>{naira(item.sale.supplierGets)}</T>  ·  Sell <T weight="extrabold" style={{ fontSize: 14 }}>{naira(item.sale.shopperPays)}</T>
          </T>
          <T weight="extrabold" style={{ fontSize: 14, color: item.sale.keep > 0 ? colors.success : colors.danger }}>
            {item.sale.keep > 0 ? `You keep ${naira(item.sale.keep)} · ${item.sale.keepPct}%` : `You lose ${naira(-item.sale.keep)}. Raise the price`}
          </T>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
            <Badge label={item.paused ? "Paused" : item.live ? "Selling" : "Not published"} bg={item.live ? colors.mintTint : colors.canvas} fg={item.live ? colors.forest : colors.inkSoft} />
            <Badge label={stock.label} bg={stock.bg} fg={stock.fg} />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        <PillButton title="Price" tone="white" size="sm" style={{ flex: 1 }} onPress={() => void openWeb(`/products/${item.product.id}`)} />
        <PillButton title={item.paused ? "Sell again" : "Pause"} tone="white" size="sm" busy={busy} style={{ flex: 1 }} onPress={onToggle} />
        <PillButton title="Message" tone="white" size="sm" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/partners/[id]", params: { id: item.supplier.userId, name: item.supplier.name } })} />
      </View>
    </Card>
  );
}

export default function DropshipScreen() {
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
      setError(e instanceof Error ? e.message : "That didn't change. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Sell without stock" sub="You don't buy these. When a customer pays, the supplier sends it with your shop's name on it." refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading ? <LoadingBlock /> : null}
      {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {loaded.data && items.length === 0 ? (
        <EmptyState icon="truck" title="Nothing here yet" action={<PillButton title="Find products to sell" size="md" onPress={() => router.push("/find")} />}>
          Pick products from suppliers and put them in your shop. You pay nothing until a customer pays you. Your money is safe here until delivery.
        </EmptyState>
      ) : null}
      {items.length > 0 ? (
        <>
          {attention > 0 ? <Notice tone="info">{`${attention} almost finished at the supplier. Pause them so customers don't order what can't be sent.`}</Notice> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {FILTERS.map((entry) => <Chip key={entry.key} label={entry.label} on={filter === entry.key} onPress={() => setFilter(entry.key)} />)}
          </View>
          {shown.length === 0 ? <T style={{ color: colors.inkSoft, textAlign: "center", paddingVertical: 20 }}>Nothing here right now. Tap &quot;All&quot; to see everything.</T> : null}
          {shown.map((item) => <DropshipCard key={item.id} item={item} busy={busy === item.id} onToggle={() => void toggle(item)} />)}
          <PillButton title="Find more products" onPress={() => router.push("/find")} />
        </>
      ) : null}
    </Screen>
  );
}
