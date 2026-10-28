import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import type { Markup } from "@shared/supplier-markup";
import { AppIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { PillButton, T } from "@/components/ui";
import { MarkupSheet } from "@/components/seller/MarkupPicker";
import { fetchMarkup, groupSkipped, quickAddMany, undoQuickAdd, type QuickAddResult } from "@/lib/quick-add";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// One-tap and bulk "Add to my shop" on Find products, starter packs and anywhere else a seller picks supplier
// products (src/lib/marketplace/quick-add.server.ts):
//   - the first add asks the seller's markup once (MarkupSheet), then adds with it; after that every add is one tap;
//   - one product: a toast "Added at ₦15,000" with Undo and Edit price (the product in Products), or why it wasn't
//     added with "See steps" (the Dropship agreement) on the product;
//   - many: a sheet with the progress ("Adding 24 · 12 of 24") and the summary: added, already in the shop, and
//     the rest grouped by why ("8 need a Dropship agreement with Kano Leather", "3 out of stock").

export type QuickToast =
  | { kind: "added"; count: number; price: number | null; name: string | null; storeProductIds: string[]; undone?: boolean }
  | { kind: "already"; storeProductId: string }
  | { kind: "skipped"; text: string; productSlug: string | null };

export interface QuickAddOptions {
  /** After products went in (or came out again on Undo), so the screen can show "In your shop". */
  onChange?: (added: string[], removed: string[]) => void;
  /** The product's slug for "See steps", by supplier product id. */
  slugOf?: (supplierProductId: string) => string | null;
}

/** The words for one skipped group, in the seller's language (the server's own words are English). */
export function useSkipText() {
  const t = useT("m_find");
  return useCallback((code: string, count: number, name: string | null) => t.dynamic(`skip.${code}`, t("skip.other", { count }), { count: String(count), name: name ?? "" }), [t]);
}

export function useQuickAdd({ onChange, slugOf }: QuickAddOptions = {}) {
  const t = useT("m_find");
  const skipText = useSkipText();
  const [markup, setMarkup] = useState<{ markup: Markup; asked: boolean } | null>(null);
  const [asking, setAsking] = useState<null | ((markup: Markup) => void)>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<QuickToast | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; result: QuickAddResult | null; error: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    fetchMarkup().then((found) => live && setMarkup(found)).catch(() => null);
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const show = useCallback((next: QuickToast | null, ms = 7000) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    if (next) timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  /** Runs `then` with the markup, asking for it first the very first time. */
  const withMarkup = useCallback(
    (then: (markup: Markup | null, chosen: boolean) => void) => {
      if (markup && !markup.asked) {
        setAsking(() => (picked: Markup) => {
          setMarkup({ markup: picked, asked: true });
          setAsking(null);
          then(picked, true);
        });
        return;
      }
      then(null, false);
    },
    [markup],
  );

  /** One tap: add this supplier product at its one-tap price. */
  const addOne = useCallback(
    (supplierProductId: string) => {
      withMarkup(async (picked) => {
        setBusy(supplierProductId);
        try {
          const result = await quickAddMany([supplierProductId], picked, () => undefined);
          const added = result.added[0];
          if (added) {
            onChange?.([supplierProductId], []);
            show({ kind: "added", count: 1, price: added.retailPrice, name: added.name, storeProductIds: [added.storeProductId] });
          } else if (result.already[0]) {
            onChange?.([supplierProductId], []);
            show({ kind: "already", storeProductId: result.already[0].storeProductId });
          } else if (result.skipped[0]) {
            const skip = result.skipped[0];
            show({ kind: "skipped", text: skipText(skip.code, 1, skip.supplierName), productSlug: slugOf?.(supplierProductId) ?? null }, 9000);
          }
        } catch (error) {
          show({ kind: "skipped", text: error instanceof Error ? error.message : t("quick.failed"), productSlug: null }, 9000);
        } finally {
          setBusy(null);
        }
      });
    },
    [withMarkup, onChange, show, skipText, slugOf, t],
  );

  /** Many at once: the progress sheet, then the summary. */
  const addMany = useCallback(
    (ids: string[], after?: () => void) => {
      if (!ids.length) return;
      withMarkup(async (picked) => {
        setBulk({ done: 0, total: ids.length, result: null, error: null });
        try {
          const result = await quickAddMany(ids, picked, (done, total) => setBulk((now) => (now ? { ...now, done, total } : now)));
          onChange?.([...result.added, ...result.already].map((item) => item.supplierProductId), []);
          setBulk({ done: ids.length, total: ids.length, result, error: null });
          after?.();
        } catch (error) {
          setBulk((now) => ({ done: now?.done ?? 0, total: ids.length, result: null, error: error instanceof Error ? error.message : t("quick.failed") }));
        }
      });
    },
    [withMarkup, onChange, t],
  );

  async function undo(storeProductIds: string[], supplierIds: string[]) {
    try {
      await undoQuickAdd(storeProductIds);
      onChange?.([], supplierIds);
      show({ kind: "added", count: storeProductIds.length, price: null, name: null, storeProductIds, undone: true }, 3500);
    } catch (error) {
      show({ kind: "skipped", text: error instanceof Error ? error.message : t("quick.failed"), productSlug: null });
    }
  }

  const toastView = toast ? (
    <View testID="quick-toast" accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.ink, borderRadius: 18, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, minHeight: 52 }}>
      <AppIcon name={toast.kind === "skipped" ? "help" : "check"} size={18} color={toast.kind === "skipped" ? "#FFD7C2" : "#9BE3B5"} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="bold" style={{ color: "#FFFFFF", fontSize: 14, lineHeight: 19 }} numberOfLines={3}>
          {toast.kind === "added"
            ? toast.undone
              ? t("quick.undone", { count: toast.count })
              : toast.count === 1 && toast.price !== null
                ? t("quick.addedAt", { price: naira(toast.price) })
                : t("quick.addedMany", { count: toast.count })
            : toast.kind === "already"
              ? t("quick.already")
              : toast.text}
        </T>
        {toast.kind === "added" && !toast.undone ? <T style={{ color: "rgba(255,255,255,0.72)", fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>{t("quick.draftNote")}</T> : null}
      </View>
      {toast.kind === "added" && !toast.undone ? (
        <>
          <ToastButton label={t("quick.undo")} onPress={() => void undo(toast.storeProductIds, [])} />
          {toast.count === 1 ? <ToastButton label={t("quick.edit")} onPress={() => router.push({ pathname: "/product/[id]", params: { id: toast.storeProductIds[0] } } as never)} /> : null}
        </>
      ) : toast.kind === "already" ? (
        <ToastButton label={t("quick.edit")} onPress={() => router.push({ pathname: "/product/[id]", params: { id: toast.storeProductId } } as never)} />
      ) : toast.kind === "skipped" && toast.productSlug ? (
        <ToastButton label={t("quick.seeSteps")} onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: toast.productSlug! } })} />
      ) : null}
    </View>
  ) : null;

  const groups = bulk?.result ? groupSkipped(bulk.result.skipped) : [];
  const ui = (
    <>
      <MarkupSheet visible={Boolean(asking)} initial={markup?.markup ?? null} onClose={() => setAsking(null)} onSave={(picked) => asking?.(picked)} />
      <Sheet visible={Boolean(bulk)} onClose={() => (bulk?.result || bulk?.error ? setBulk(null) : undefined)} title={bulk?.result ? (bulk.result.added.length ? t("bulk.doneTitle", { count: bulk.result.added.length }) : t("bulk.nothingAdded")) : t("bulk.title", { count: bulk?.total ?? 0 })} testID="bulk-sheet">
        {bulk && !bulk.result && !bulk.error ? (
          <View style={{ gap: 10 }}>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.track, overflow: "hidden" }}>
              <View style={{ width: `${bulk.total ? Math.max(6, Math.round((bulk.done / bulk.total) * 100)) : 6}%`, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
            </View>
            <T weight="bold" style={{ fontSize: 15 }}>{t("bulk.progress", { done: bulk.done, total: bulk.total })}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("bulk.wait")}</T>
          </View>
        ) : null}
        {bulk?.error ? (
          <View style={{ gap: 10 }}>
            <T style={{ color: colors.danger, fontSize: 15, lineHeight: 21 }}>{bulk.error}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("bulk.retryNote")}</T>
          </View>
        ) : null}
        {bulk?.result ? (
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 10 }}>
            <Line icon="check" tone={colors.success} text={t("bulk.added", { count: bulk.result.added.length })} />
            {bulk.result.already.length ? <Line icon="check" tone={colors.inkSoft} text={t("bulk.already", { count: bulk.result.already.length })} /> : null}
            {groups.map((group) => (
              <View key={group.key} style={{ gap: 6 }}>
                <Line icon="help" tone={colors.warnInk} text={skipText(group.code, group.count, group.supplierName)} />
                {group.code.startsWith("AGREEMENT") && slugOf?.(group.firstId) ? (
                  <PillButton size="sm" tone="white" title={t("quick.seeSteps")} style={{ alignSelf: "flex-start", marginLeft: 30 }} onPress={() => { setBulk(null); router.push({ pathname: "/find/[slug]", params: { slug: slugOf(group.firstId)! } }); }} />
                ) : null}
              </View>
            ))}
            {bulk.result.left !== null ? <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("bulk.left", { count: bulk.result.left })}</T> : null}
          </ScrollView>
        ) : null}
        {bulk?.result ? (
          <View style={{ gap: 8 }}>
            {bulk.result.added.length ? (
              <PillButton tone="white" title={t("bulk.undoAll", { count: bulk.result.added.length })} onPress={() => { const result = bulk.result!; setBulk(null); void undo(result.added.map((item) => item.storeProductId), result.added.map((item) => item.supplierProductId)); }} />
            ) : null}
            <PillButton testID="bulk-done" title={t("bulk.seeMine")} onPress={() => { setBulk(null); router.push("/find/mine"); }} />
          </View>
        ) : bulk?.error ? (
          <PillButton title={t("bulk.close")} onPress={() => setBulk(null)} />
        ) : null}
      </Sheet>
    </>
  );

  return { markup, addOne, addMany, busy, toast: toastView, ui, bulkOpen: Boolean(bulk) };
}

function ToastButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={4} style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.75 : 1 })}>
      <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 14 }}>{label}</T>
    </Pressable>
  );
}

function Line({ icon, tone, text }: { icon: "check" | "help"; tone: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ width: 20, paddingTop: 1 }}><AppIcon name={icon} size={18} color={tone} /></View>
      <T style={{ flex: 1, fontSize: 15, lineHeight: 21, fontFamily: fonts.semibold }}>{text}</T>
    </View>
  );
}
