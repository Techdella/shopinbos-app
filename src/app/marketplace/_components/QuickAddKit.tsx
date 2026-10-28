"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { quickAddProducts, saveMarkupAction, undoQuickAddAction } from "@/app/actions/quick-add";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { MARKUP_PERCENT_CHOICES, markupExample, readMarkup, type Markup } from "@shared/supplier-markup";
import type { QuickAddResult } from "@/lib/marketplace/quick-add-core";
import { naira } from "@/lib/marketplace/find";

// One-tap and bulk "Add to my shop" on the web (the phone's components/seller/QuickAdd.tsx, same server rules):
// the markup question the first time (MarkupDialog), a toast with Undo and Edit price after one, and for many a
// dialog with the progress and what didn't go in and why ("8 need a Dropship agreement with Kano Leather").

export type MarkupState = { markup: Markup; asked: boolean };
type Pick = { kind: "percent"; value: number } | { kind: "amount"; text: string };
const pickOf = (markup: Markup | null): Pick => (markup?.kind === "amount" ? { kind: "amount", text: String(markup.value) } : { kind: "percent", value: markup?.value ?? 30 });
const markupOf = (pick: Pick) => (pick.kind === "percent" ? readMarkup(pick) : readMarkup({ kind: "amount", value: pick.text }));

export function Dialog({ open, onClose, title, children, labelId }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby={labelId}
      className="m-auto w-[calc(100%-32px)] max-w-[460px] rounded-[22px] border border-app-line bg-white p-0 text-app-ink backdrop:bg-black/40"
    >
      <div className="grid gap-4 p-6">
        <div className="flex items-start gap-3">
          <h2 id={labelId} className="m-0 min-w-0 flex-1 text-[20px] font-extrabold leading-tight tracking-[-0.3px]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-app-line hover:border-app-line-strong"><Icon name="x" size={16} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** 20%, 30%, 50% or a ₦ amount, with "A ₦10,000 product sells at ₦13,000". */
export function MarkupChoices({ value, onChange }: { value: Pick; onChange: (next: Pick) => void }) {
  const t = useT("marketplace");
  const markup = markupOf(value);
  const example = markup ? markupExample(markup) : null;
  const option = (key: string, label: string, on: boolean, select: () => void, sub?: string) => (
    <button key={key} type="button" role="radio" aria-checked={on} onClick={select} className={`flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border px-4 text-left ${on ? "border-2 border-app-ink" : "border-app-line hover:border-app-line-strong"}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{label}</span>
        {sub ? <span className="block text-[13px] text-app-ink-soft">{sub}</span> : null}
      </span>
      <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${on ? "border-app-ink bg-app-ink text-white" : "border-app-line-strong"}`}>{on ? <Icon name="check" size={13} strokeWidth={3} /> : null}</span>
    </button>
  );
  return (
    <div className="grid gap-2" role="radiogroup">
      {MARKUP_PERCENT_CHOICES.map((percent) => option(String(percent), t("markup.percent", { percent }), value.kind === "percent" && value.value === percent, () => onChange({ kind: "percent", value: percent }), percent === 30 ? t("markup.popular") : undefined))}
      {option("amount", t("markup.amount"), value.kind === "amount", () => onChange({ kind: "amount", text: value.kind === "amount" ? value.text : "2000" }), t("markup.amountSub"))}
      {value.kind === "amount" ? (
        <label className="flex min-h-[52px] items-center gap-2 rounded-[16px] border-2 border-app-ink px-4">
          <span className="text-[18px] font-extrabold">₦</span>
          <input inputMode="numeric" aria-label={t("markup.amountLabel")} value={value.text} onChange={(event) => onChange({ kind: "amount", text: event.target.value.replace(/[^\d]/g, "").slice(0, 7) })} className="min-w-0 flex-1 border-0 bg-transparent text-[18px] font-extrabold outline-none" />
        </label>
      ) : null}
      <p className="m-0 rounded-[14px] bg-[#E2F6F1] px-4 py-3 text-[13.5px] leading-[1.5] text-[#0C4A44]">
        <strong className="block font-extrabold">{example ? t("markup.example", { cost: naira(example.cost), price: naira(example.price) }) : t("markup.amountMin")}</strong>
        {t("markup.rounding")}
      </p>
    </div>
  );
}

/** The markup picker with Save (Settings and My supplier products). */
export function MarkupEditor({ initial, onSaved }: { initial: Markup; onSaved?: (markup: Markup) => void }) {
  const t = useT("marketplace");
  const [pick, setPick] = useState<Pick>(() => pickOf(initial));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const markup = markupOf(pick);
  async function save() {
    if (!markup) return;
    setBusy(true);
    const result = await saveMarkupAction(markup);
    setBusy(false);
    setNote(result.ok ? { ok: true, text: t("markup.saved") } : { ok: false, text: result.error });
    if (result.ok) onSaved?.(result.markup);
  }
  return (
    <div className="grid gap-3">
      <MarkupChoices value={pick} onChange={setPick} />
      {note ? <p role="status" className={`m-0 text-[14px] font-bold ${note.ok ? "text-app-success" : "text-app-danger"}`}>{note.text}</p> : null}
      <button type="button" onClick={() => void save()} disabled={!markup || busy} className="inline-flex min-h-[46px] items-center justify-center rounded-full bg-app-ink px-5 text-[14.5px] font-bold text-white hover:bg-black disabled:opacity-60">{busy ? t("quick.saving") : t("markup.save")}</button>
    </div>
  );
}

type Toast = { kind: "added"; price: number | null; count: number; storeProductIds: string[]; undone?: boolean } | { kind: "already"; storeProductId: string } | { kind: "skipped"; text: string; href: string | null };

/** Words for a group of skipped products, in the seller's language. */
export function useSkipWords() {
  const t = useT("marketplace");
  return useCallback((code: string, count: number, name: string | null) => t.dynamic(`quick.skip.${code}`, t("quick.skip.other", { count }), { count: String(count), name: name ?? "" }), [t]);
}

export function groupSkips(skipped: QuickAddResult["skipped"]) {
  const groups: Array<{ key: string; code: string; name: string | null; count: number; firstId: string }> = [];
  for (const item of skipped) {
    const perSupplier = item.code.startsWith("AGREEMENT") || item.code === "TOO_FAR";
    const key = perSupplier ? `${item.code}:${item.supplierId}` : item.code;
    const found = groups.find((group) => group.key === key);
    if (found) found.count += 1;
    else groups.push({ key, code: item.code, name: perSupplier ? item.supplierName : null, count: 1, firstId: item.supplierProductId });
  }
  return groups;
}

export function useWebQuickAdd({ initial, onChange }: { initial: MarkupState; onChange?: (added: string[], removed: string[]) => void }) {
  const t = useT("marketplace");
  const skipWords = useSkipWords();
  const [markup, setMarkup] = useState<MarkupState>(initial);
  const [asking, setAsking] = useState<null | ((markup: Markup) => void)>(null);
  const [pick, setPick] = useState<Pick>(() => pickOf(initial.markup));
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; result: (QuickAddResult & { markup: Markup }) | null; error: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: Toast | null, ms = 8000) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    if (next) timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const withMarkup = (then: (picked: Markup | null) => void) => {
    if (!markup.asked) {
      setAsking(() => (picked: Markup) => {
        setMarkup({ markup: picked, asked: true });
        setAsking(null);
        then(picked);
      });
      return;
    }
    then(null);
  };

  async function run(ids: string[], picked: Markup | null, onProgress: (done: number) => void) {
    const total: QuickAddResult & { markup: Markup } = { added: [], already: [], skipped: [], left: null, markup: picked ?? markup.markup };
    for (let at = 0; at < ids.length; at += 60) {
      const result = await quickAddProducts({ ids: ids.slice(at, at + 60), ...(at === 0 && picked ? { markup: picked } : {}) });
      if (!result.ok) throw new Error(result.error);
      total.added.push(...result.result.added);
      total.already.push(...result.result.already);
      total.skipped.push(...result.result.skipped);
      total.left = result.result.left;
      onProgress(Math.min(ids.length, at + 60));
    }
    return total;
  }

  function addOne(id: string, href: string) {
    withMarkup(async (picked) => {
      setBusy(id);
      try {
        const result = await run([id], picked, () => undefined);
        if (result.added[0]) {
          onChange?.([id], []);
          show({ kind: "added", price: result.added[0].retailPrice, count: 1, storeProductIds: [result.added[0].storeProductId] });
        } else if (result.already[0]) {
          onChange?.([id], []);
          show({ kind: "already", storeProductId: result.already[0].storeProductId });
        } else if (result.skipped[0]) {
          const skip = result.skipped[0];
          show({ kind: "skipped", text: skipWords(skip.code, 1, skip.supplierName), href: skip.code.startsWith("AGREEMENT") ? `${href}#before-you-list` : null }, 10000);
        }
      } catch (error) {
        show({ kind: "skipped", text: error instanceof Error ? error.message : t("quick.failed"), href: null });
      } finally {
        setBusy(null);
      }
    });
  }

  function addMany(ids: string[], after?: () => void) {
    if (!ids.length) return;
    withMarkup(async (picked) => {
      setBulk({ done: 0, total: ids.length, result: null, error: null });
      try {
        const result = await run(ids, picked, (done) => setBulk((now) => (now ? { ...now, done } : now)));
        onChange?.([...result.added, ...result.already].map((item) => item.supplierProductId), []);
        setBulk({ done: ids.length, total: ids.length, result, error: null });
        after?.();
      } catch (error) {
        setBulk((now) => ({ done: now?.done ?? 0, total: ids.length, result: null, error: error instanceof Error ? error.message : t("quick.failed") }));
      }
    });
  }

  async function undo(storeProductIds: string[], supplierIds: string[]) {
    const result = await undoQuickAddAction(storeProductIds);
    if (!result.ok) return show({ kind: "skipped", text: result.error, href: null });
    onChange?.([], supplierIds);
    show({ kind: "added", price: null, count: storeProductIds.length, storeProductIds, undone: true }, 3500);
  }

  const toastView = toast ? (
    <div role="status" data-testid="quick-toast" className="fixed bottom-5 left-1/2 z-50 flex w-[min(560px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-[18px] bg-app-ink py-2 pl-4 pr-2 text-white shadow-lg">
      <Icon name={toast.kind === "skipped" ? "info" : "check"} size={18} className={toast.kind === "skipped" ? "text-[#FFD7C2]" : "text-[#9BE3B5]"} />
      <span className="min-w-0 flex-1 text-[14px] font-bold leading-[1.4]">
        {toast.kind === "added" ? (toast.undone ? t("quick.undone") : toast.price !== null ? t("quick.addedAt", { price: naira(toast.price) }) : t("quick.addedMany", { count: toast.count })) : toast.kind === "already" ? t("quick.already") : toast.text}
        {toast.kind === "added" && !toast.undone ? <span className="block text-[12.5px] font-semibold text-white/70">{t("quick.draftNote")}</span> : null}
      </span>
      {toast.kind === "added" && !toast.undone ? (
        <>
          <button type="button" onClick={() => void undo(toast.storeProductIds, [])} className="min-h-[40px] rounded-full bg-white/15 px-3.5 text-[14px] font-extrabold hover:bg-white/25">{t("quick.undo")}</button>
          {toast.count === 1 ? <Link href={`/products/${toast.storeProductIds[0]}`} className="inline-flex min-h-[40px] items-center rounded-full bg-white/15 px-3.5 text-[14px] font-extrabold text-white no-underline hover:bg-white/25">{t("quick.edit")}</Link> : null}
        </>
      ) : toast.kind === "already" ? (
        <Link href={`/products/${toast.storeProductId}`} className="inline-flex min-h-[40px] items-center rounded-full bg-white/15 px-3.5 text-[14px] font-extrabold text-white no-underline">{t("quick.edit")}</Link>
      ) : toast.kind === "skipped" && toast.href ? (
        <Link href={toast.href} className="inline-flex min-h-[40px] items-center rounded-full bg-white/15 px-3.5 text-[14px] font-extrabold text-white no-underline">{t("quick.seeSteps")}</Link>
      ) : null}
    </div>
  ) : null;

  const groups = bulk?.result ? groupSkips(bulk.result.skipped) : [];
  const ui = (
    <>
      <Dialog open={Boolean(asking)} onClose={() => setAsking(null)} title={t("markup.question")} labelId="markup-question">
        <p className="m-0 -mt-2 text-[14.5px] leading-[1.5] text-app-ink-soft">{t("markup.questionSub")}</p>
        <MarkupChoices value={pick} onChange={setPick} />
        <button type="button" data-testid="markup-save" disabled={!markupOf(pick)} onClick={() => { const picked = markupOf(pick); if (picked) asking?.(picked); }} className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-app-ink px-5 text-[15px] font-bold text-white hover:bg-black disabled:opacity-60">{t("markup.saveAdd")}</button>
        <p className="m-0 text-center text-[13px] text-app-ink-soft">{t("markup.later")}</p>
      </Dialog>
      {toastView}
      <Dialog open={Boolean(bulk)} onClose={() => (bulk?.result || bulk?.error ? setBulk(null) : undefined)} title={bulk?.result ? (bulk.result.added.length ? t("quick.bulkDone", { count: bulk.result.added.length }) : t("quick.bulkNothing")) : t("quick.bulkTitle", { count: bulk?.total ?? 0 })} labelId="bulk-add">
        {bulk && !bulk.result && !bulk.error ? (
          <div className="grid gap-2" aria-live="polite">
            <div className="h-3 overflow-hidden rounded-full bg-app-canvas"><div className="h-3 rounded-full bg-app-accent transition-[width]" style={{ width: `${Math.max(6, Math.round((bulk.done / Math.max(1, bulk.total)) * 100))}%` }} /></div>
            <p className="m-0 text-[15px] font-bold">{t("quick.bulkProgress", { done: bulk.done, total: bulk.total })}</p>
            <p className="m-0 text-[14px] text-app-ink-soft">{t("quick.bulkWait")}</p>
          </div>
        ) : null}
        {bulk?.error ? <p role="alert" className="m-0 text-[14.5px] text-app-danger">{bulk.error} {t("quick.bulkRetry")}</p> : null}
        {bulk?.result ? (
          <ul className="m-0 grid max-h-[340px] list-none gap-2.5 overflow-auto p-0">
            <li className="flex items-start gap-2.5 text-[14.5px] font-semibold"><Icon name="check" size={17} className="mt-0.5 shrink-0 text-app-success" /> {t("quick.bulkAdded", { count: bulk.result.added.length })}</li>
            {bulk.result.already.length ? <li className="flex items-start gap-2.5 text-[14.5px] font-semibold text-app-ink-soft"><Icon name="check" size={17} className="mt-0.5 shrink-0" /> {t("quick.bulkAlready", { count: bulk.result.already.length })}</li> : null}
            {groups.map((group) => (
              <li key={group.key} className="flex items-start gap-2.5 text-[14.5px] font-semibold">
                <Icon name="info" size={17} className="mt-0.5 shrink-0 text-[#8A5A08]" />
                <span className="min-w-0 flex-1">
                  {skipWords(group.code, group.count, group.name)}
                  {group.code.startsWith("AGREEMENT") ? <> · <Link href={`/marketplace/product/${encodeURIComponent(group.firstId)}#before-you-list`} className="font-extrabold text-app-accent-ink">{t("quick.seeSteps")}</Link></> : null}
                  {group.code === "PLAN_LIMIT" ? <> · <Link href="/home/settings?tab=Billing" className="font-extrabold text-app-accent-ink">{t("quick.plans")}</Link></> : null}
                </span>
              </li>
            ))}
            {bulk.result.left !== null ? <li className="text-[13.5px] text-app-ink-soft">{t("quick.bulkLeft", { count: bulk.result.left })}</li> : null}
          </ul>
        ) : null}
        {bulk?.result ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/marketplace/mine" data-testid="bulk-done" className="inline-flex min-h-[46px] flex-1 items-center justify-center rounded-full bg-app-ink px-5 text-[14.5px] font-bold text-white no-underline">{t("quick.seeMine")}</Link>
            {bulk.result.added.length ? <button type="button" onClick={() => { const result = bulk.result!; setBulk(null); void undo(result.added.map((item) => item.storeProductId), result.added.map((item) => item.supplierProductId)); }} className="inline-flex min-h-[46px] items-center rounded-full border border-app-line px-5 text-[14.5px] font-bold">{t("quick.undoAll", { count: bulk.result.added.length })}</button> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );

  return { markup, addOne, addMany, busy, ui };
}
