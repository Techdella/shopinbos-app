import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { markupLabel, type Markup } from "@shared/supplier-markup";
import { Choice, Seg } from "@/components/design";
import { FilterBar } from "@/components/FilterBar";
import { AppIcon } from "@/components/icons";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { ListScreen, Tick } from "@/components/seller/FindKit";
import { MarkupPicker, markupOfPick, markupPickOf, type MarkupPick } from "@/components/seller/MarkupPicker";
import { Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { fetchMine, fixMine, removeMine, repriceMine, type MySupplierProduct } from "@/lib/quick-add";
import { noticeDay } from "@shared/price-notice";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// My supplier products (GET/POST /api/mobile/marketplace/mine): every supplier product in the shop, virtualised so
// 200 scroll smoothly, with search and Dropship / Wholesale / Needs a look. Tick many (or Select all), then "Change
// price" — cost + 20/30/50% or a ₦ amount, rounded to nice prices, or the suppliers' suggested prices; any that would
// go below a supplier's lowest price or lose money are left as they are and listed — or "Remove" (taken out of the
// shop like any removed product). The markup picked here becomes the seller's markup for new adds too.
// A supplier's price rise on notice shows on its row ("You'll pay ₦X from Mon 3 Nov"); a product Shopinbos paused
// because the new price would lose money says so, with "Raise to ₦X" (one tap: POST { action: "fix", id }).

type Show = "all" | "dropship" | "wholesale" | "attention";

function MineRow({ product, picked, onPick }: { product: MySupplierProduct; picked: boolean; onPick: () => void }) {
  const t = useT("m_find");
  const tm = useT("marketplace");
  const keep = product.price - product.cost;
  return (
    <Pressable
      testID={`mine-${product.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={t("mine.rowLabel", { name: product.name, price: naira(product.price), cost: naira(product.cost) })}
      onPress={onPick}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 10, borderWidth: picked ? 2.5 : 0, borderColor: colors.ink, opacity: pressed ? 0.85 : 1 })}
    >
      <View>
        {product.image ? <Image source={{ uri: product.image }} style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: colors.lilac }} contentFit="cover" recyclingKey={product.id} /> : <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: colors.lilac }} />}
        <View style={{ position: "absolute", top: -6, left: -6 }}><Tick on={picked} size={24} /></View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T weight="bold" numberOfLines={2} style={{ fontSize: 14.5, lineHeight: 19 }}>{product.name}</T>
        <T numberOfLines={1} style={{ color: colors.inkSoft, fontSize: 12.5 }}>{[product.supplierName, product.dropship ? t("card.dropship") : t("card.wholesale")].filter(Boolean).join(" · ")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {product.status === "draft" ? <Badge label={t("mine.draft")} /> : <Badge label={t("mine.live")} bg={colors.successTint} fg={colors.success} />}
          {product.unavailable ? <Badge label={t("mine.unavailable")} bg={colors.dangerTint} fg={colors.danger} /> : null}
          {product.pausedForPrice ? <Badge label={tm("notice.pausedShort")} bg={colors.dangerTint} fg={colors.danger} /> : null}
        </View>
        {product.priceChange ? <T weight="bold" style={{ color: colors.warnInk, fontSize: 12 }}>{tm("notice.rowLine", { cost: naira(product.priceChange.cost), date: noticeDay(product.priceChange.at) })}</T> : null}

      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <T weight="extrabold" style={{ fontSize: 15 }}>{naira(product.price)}</T>
        <T style={{ color: colors.inkSoft, fontSize: 12 }}>{t("packs.youPay", { cost: naira(product.cost) })}</T>
        <T weight="bold" style={{ color: keep > 0 ? colors.success : colors.danger, fontSize: 12 }}>{t("mine.keep", { amount: naira(keep) })}</T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("mine.edit", { name: product.name })} hitSlop={8} onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } } as never)} style={{ width: 32, height: 44, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name="chevron" size={18} color={colors.inkSoft} />
      </Pressable>
    </Pressable>
  );
}

export default function MySupplierProducts() {
  const t = useT("m_find");
  const loaded = useLoad(() => fetchMine());
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [sheet, setSheet] = useState<"price" | "remove" | null>(null);
  const [mode, setMode] = useState<"markup" | "suggested">("markup");
  const [pick, setPick] = useState<MarkupPick | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const tm = useT("marketplace");

  async function fix(product: MySupplierProduct) {
    setFixing(product.id);
    try {
      const result = await fixMine(product.id);
      setNote({ tone: "success", text: tm("notice.fixed", { name: product.name, price: naira(result.price) }) });
      await loaded.refresh();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("quick.failed") });
    } finally {
      setFixing(null);
    }
  }

  const all = useMemo(() => loaded.data?.products ?? [], [loaded.data]);
  const saved: Markup | null = loaded.data?.markup ?? null;
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((product) => {
      if (show === "dropship" && !product.dropship) return false;
      if (show === "wholesale" && product.dropship) return false;
      if (show === "attention" && !product.unavailable) return false;
      const text = `${product.name} ${product.supplierName}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [all, q, show]);
  const attention = all.filter((product) => product.unavailable).length;
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((item) => item !== id) : [...now, id]));
  const everyShown = shown.length > 0 && shown.every((product) => picked.includes(product.id));
  const chosen = pick ?? markupPickOf(saved);
  const markup = markupOfPick(chosen);

  async function applyPrice() {
    setBusy(true);
    try {
      const result = await repriceMine(picked, mode === "suggested" ? { suggested: true } : { markup: markup! });
      setSheet(null);
      setPicked([]);
      setNote({ tone: result.skipped.length ? "info" : "success", text: result.skipped.length ? t("mine.repricedSome", { count: result.updated.length, skipped: result.skipped.length, first: result.skipped[0].name }) : t("mine.repriced", { count: result.updated.length }) });
      await loaded.refresh();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("quick.failed") });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const result = await removeMine(picked);
      setSheet(null);
      setPicked([]);
      setNote({ tone: "success", text: t("mine.removed", { count: result.removed }) });
      await loaded.refresh();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("quick.failed") });
    } finally {
      setBusy(false);
    }
  }

  const footer = picked.length ? (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <PillButton testID="mine-price" tone="accent" icon="tag" title={t("mine.changePrice", { count: picked.length })} style={{ flex: 1 }} onPress={() => setSheet("price")} />
      <PillButton testID="mine-remove" tone="white" title={t("mine.remove")} onPress={() => setSheet("remove")} />
    </View>
  ) : undefined;

  return (
    <ListScreen<MySupplierProduct>
      title={t("mine.title")}
      refreshing={loaded.refreshing}
      onRefresh={() => void loaded.refresh()}
      footer={footer}
      data={shown}
      keyExtractor={(product) => product.id}
      ListHeaderComponent={
        <View style={{ gap: 12, paddingBottom: 4 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32 }}>{t("mine.heading")}</T>
          {loaded.data ? (
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("mine.count", { count: all.length })}</T>
              {saved ? <Badge label={t("packs.markup", { markup: markupLabel(saved, naira) })} bg={colors.mintTint} fg={colors.forest} /> : null}
              <LinkButton title={t("packs.changeMarkup")} onPress={() => router.push("/find/markup")} />
            </View>
          ) : null}
          {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
          {/* Paused because the supplier's new price would lose money: the one-tap fix, full width (shared/price-notice.ts). */}
          {all.some((product) => product.pausedForPrice) ? (
            <View style={{ gap: 10, backgroundColor: colors.dangerTint, borderRadius: 20, padding: 14 }}>
              <T weight="extrabold" style={{ fontSize: 16, lineHeight: 21, color: colors.danger }}>{tm("notice.pausedTitle", { count: all.filter((product) => product.pausedForPrice).length })}</T>
              <T style={{ fontSize: 14, lineHeight: 20 }}>{tm("notice.pausedBody")}</T>
              {all.filter((product) => product.pausedForPrice).map((product) => (
                <View key={product.id} style={{ gap: 8, backgroundColor: colors.surface, borderRadius: 16, padding: 12 }}>
                  <T weight="bold" style={{ fontSize: 15 }} numberOfLines={2}>{product.name}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{tm("notice.pausedLine", { price: naira(product.price), cost: naira(product.cost) })}</T>
                  {product.fixPrice ? (
                    <PillButton testID={`fix-${product.id}`} size="md" busy={fixing === product.id} disabled={Boolean(fixing)} title={tm("notice.raiseTo", { price: naira(product.fixPrice) })} onPress={() => void fix(product)} />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
          {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
          {loaded.data && !all.length ? (
            <EmptyState icon="tag" title={t("mine.emptyTitle")} action={<PillButton title={t("mine.find")} size="md" onPress={() => router.push("/find")} />}>{t("mine.emptyBody")}</EmptyState>
          ) : null}
          {all.length ? (
            <>
              <Field value={q} onChangeText={setQ} placeholder={t("mine.search")} accessibilityLabel={t("mine.search")} style={{ height: 48 }} />
              <FilterBar>
                <Seg label={t("all")} on={show === "all"} onPress={() => setShow("all")} />
                <Seg label={t("card.dropship")} on={show === "dropship"} onPress={() => setShow("dropship")} />
                <Seg label={t("card.wholesale")} on={show === "wholesale"} onPress={() => setShow("wholesale")} />
                {attention ? <Seg label={t("mine.attention")} count={attention} on={show === "attention"} onPress={() => setShow("attention")} /> : null}
              </FilterBar>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T weight="bold" style={{ fontSize: 14 }}>{t("select.count", { count: picked.length })}</T>
                <LinkButton testID="mine-select-all" title={everyShown ? t("select.none") : t("select.all", { count: shown.length })} onPress={() => setPicked(everyShown ? [] : [...new Set([...picked, ...shown.map((product) => product.id)])])} />
              </View>
            </>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <MineRow product={item} picked={picked.includes(item.id)} onPick={() => toggle(item.id)} />}
      ListFooterComponent={
        <>
          <Sheet visible={sheet === "price"} onClose={() => setSheet(null)} title={t("mine.priceTitle", { count: picked.length })} testID="mine-price-sheet">
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Seg label={t("mine.useMarkup")} on={mode === "markup"} onPress={() => setMode("markup")} />
              <Seg label={t("mine.useSuggested")} on={mode === "suggested"} onPress={() => setMode("suggested")} />
            </View>
            {mode === "markup" ? <MarkupPicker value={chosen} onChange={setPick} /> : <Choice title={t("mine.suggestedTitle")} sub={t("mine.suggestedSub")} on onPress={() => undefined} />}
            <PillButton testID="mine-apply" busy={busy} disabled={mode === "markup" && !markup} title={t("mine.apply", { count: picked.length })} onPress={() => void applyPrice()} />
          </Sheet>
          <Sheet visible={sheet === "remove"} onClose={() => setSheet(null)} title={t("mine.removeTitle", { count: picked.length })}>
            <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("mine.removeBody")}</T>
            <PillButton testID="mine-remove-confirm" busy={busy} title={t("mine.removeConfirm", { count: picked.length })} onPress={() => void remove()} />
          </Sheet>
        </>
      }
    />
  );
}
