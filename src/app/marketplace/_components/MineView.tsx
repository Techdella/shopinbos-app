"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { removeSupplierProductsAction, repriceSupplierProductsAction } from "@/app/actions/quick-add";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { naira } from "@/lib/marketplace/find";
import { markupLabel, readMarkup, type Markup } from "@shared/supplier-markup";
import type { MySupplierProduct } from "@/lib/marketplace/quick-add.server";
import { Dialog, MarkupChoices, MarkupEditor } from "./QuickAddKit";

// My supplier products (web; the phone's app/find/mine.tsx): every supplier product in the shop with search and
// Dropship / Wholesale / Needs a look; tick many (or all shown), then "Change price" — cost + 20/30/50% or a ₦ amount
// rounded to nice prices, or the suppliers' suggested prices (any that would go below a supplier's lowest price or
// lose money keep theirs, and are named) — or "Remove". Your markup for new adds is edited at the top.

type Show = "all" | "dropship" | "wholesale" | "attention";
type Pick = { kind: "percent"; value: number } | { kind: "amount"; text: string };

export function MineView({ products, markup: initial }: { products: MySupplierProduct[]; markup: Markup }) {
  const t = useT("marketplace");
  const router = useRouter();
  const [markup, setMarkup] = useState(initial);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"price" | "remove" | "markup" | null>(null);
  const [mode, setMode] = useState<"markup" | "suggested">("markup");
  const [pick, setPick] = useState<Pick>(() => (initial.kind === "amount" ? { kind: "amount", text: String(initial.value) } : { kind: "percent", value: initial.value }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((product) => {
      if (show === "dropship" && !product.dropship) return false;
      if (show === "wholesale" && product.dropship) return false;
      if (show === "attention" && !product.unavailable) return false;
      const text = `${product.name} ${product.supplierName}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [products, q, show]);
  const attention = products.filter((product) => product.unavailable).length;
  const everyShown = shown.length > 0 && shown.every((product) => picked.includes(product.id));
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((item) => item !== id) : [...now, id]));
  const chosen = pick.kind === "percent" ? readMarkup(pick) : readMarkup({ kind: "amount", value: pick.text });

  async function apply() {
    setBusy(true);
    const result = await repriceSupplierProductsAction(picked, mode === "suggested" ? { suggested: true } : { markup: chosen! });
    setBusy(false);
    if (!result.ok) return setNote({ ok: false, text: result.error });
    setDialog(null);
    setPicked([]);
    if (mode === "markup" && chosen) setMarkup(chosen);
    setNote({ ok: true, text: result.skipped.length ? t("mine.repricedSome", { count: result.updated, skipped: result.skipped.length, first: result.skipped[0].name }) : t("mine.repriced", { count: result.updated }) });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await removeSupplierProductsAction(picked);
    setBusy(false);
    if (!result.ok) return setNote({ ok: false, text: result.error });
    setDialog(null);
    setPicked([]);
    setNote({ ok: true, text: t("mine.removed", { count: result.removed }) });
    router.refresh();
  }

  const tab = (value: Show, label: string, count?: number) => (
    <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)} className={cx("inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-bold", show === value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
      {label}
      {count ? <span className={cx("rounded-full px-1.5 text-[12px]", show === value ? "bg-white/20" : "bg-app-canvas")}>{count}</span> : null}
    </button>
  );

  return (
    <div className="grid gap-4">
      <section id="markup" className="flex flex-wrap items-center gap-3 rounded-[18px] border border-app-line bg-white px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E2F6F1] text-[#0C4A44]"><Icon name="percent" size={17} /></span>
        <span className="min-w-0 flex-1 text-[14.5px]">
          <strong className="font-extrabold">{t("mine.markupLine", { markup: markupLabel(markup, naira) })}</strong>
          <span className="block text-[13px] text-app-ink-soft">{t("mine.markupSub")}</span>
        </span>
        <button type="button" onClick={() => setDialog("markup")} className="inline-flex min-h-[40px] items-center rounded-full border border-app-line px-4 text-[14px] font-bold hover:border-app-line-strong">{t("packs.changeMarkup")}</button>
      </section>

      {note ? <p role="status" className={cx("m-0 rounded-[16px] px-4 py-3 text-[14px] font-bold", note.ok ? "bg-app-success-tint text-app-success" : "bg-app-danger-tint text-app-danger")}>{note.text}</p> : null}

      {products.length ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="flex min-h-[46px] w-full items-center gap-2 rounded-full border border-app-line bg-white pl-4 pr-2 md:w-[320px]">
              <Icon name="search" size={16} className="text-app-ink-soft" />
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("mine.search")} aria-label={t("mine.search")} className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none" />
            </label>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {tab("all", t("find.all"))}
              {tab("dropship", t("filter.dropship"))}
              {tab("wholesale", t("filter.wholesale"))}
              {attention ? tab("attention", t("mine.attention"), attention) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-[20px] border border-app-line bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b border-app-line px-4 py-3">
              <label className="inline-flex min-h-[32px] items-center gap-2 text-[14px] font-bold">
                <input type="checkbox" checked={everyShown} onChange={() => setPicked(everyShown ? [] : [...new Set([...picked, ...shown.map((product) => product.id)])])} className="h-5 w-5 accent-[#16141F]" aria-label={t("select.all", { count: shown.length })} />
                {t("select.count", { count: picked.length })}
              </label>
              <span className="text-[13px] text-app-ink-soft">{t("mine.count", { count: shown.length })}</span>
              <span className="ml-auto flex gap-2">
                <button type="button" data-testid="mine-price" disabled={!picked.length} onClick={() => setDialog("price")} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-app-accent px-4 text-[14px] font-extrabold text-app-ink disabled:opacity-50"><Icon name="tag" size={15} /> {t("mine.changePrice", { count: picked.length })}</button>
                <button type="button" disabled={!picked.length} onClick={() => setDialog("remove")} className="inline-flex min-h-[42px] items-center rounded-full border border-app-line px-4 text-[14px] font-bold disabled:opacity-50">{t("mine.remove")}</button>
              </span>
            </div>
            <ul className="m-0 list-none p-0">
              {shown.map((product) => {
                const on = picked.includes(product.id);
                const keep = product.price - product.cost;
                return (
                  <li key={product.id} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 76px" }} className={cx("flex items-center gap-3 border-b border-app-line px-4 py-2.5 last:border-b-0", on && "bg-app-canvas")}>
                    <input type="checkbox" checked={on} onChange={() => toggle(product.id)} aria-label={product.name} className="h-5 w-5 shrink-0 accent-[#16141F]" />
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-[10px] bg-app-canvas object-cover" />
                    ) : (
                      <span className="h-12 w-12 shrink-0 rounded-[10px] bg-app-canvas" />
                    )}
                    <span className="min-w-0 flex-1">
                      <Link href={`/products/${product.id}`} className="block truncate text-[14.5px] font-bold text-app-ink no-underline hover:underline">{product.name}</Link>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">
                        {product.supplierName} · {product.dropship ? t("filter.dropship") : t("filter.wholesale")} · {product.status === "draft" ? t("mine.draft") : t("mine.live")}
                        {product.unavailable ? <span className="font-bold text-app-danger"> · {t("mine.unavailable")}</span> : null}
                      </span>
                    </span>
                    <span className="hidden text-right text-[13px] text-app-ink-soft sm:block">{t("packs.youPay", { cost: naira(product.cost) })}</span>
                    <span className="w-[124px] text-right">
                      <span className="block text-[15px] font-extrabold">{naira(product.price)}</span>
                      <span className={cx("block text-[12px] font-bold", keep > 0 ? "text-app-success" : "text-app-danger")}>{t("mine.keep", { amount: naira(keep) })}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : (
        <div className="rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <h2 className="m-0 text-[17px] font-extrabold">{t("mine.emptyTitle")}</h2>
          <p className="mx-auto mb-0 mt-2 max-w-[420px] text-[14.5px] text-app-ink-soft">{t("mine.emptyBody")}</p>
          <Link href="/marketplace" className="mt-4 inline-flex min-h-[42px] items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline">{t("mine.find")}</Link>
        </div>
      )}

      <Dialog open={dialog === "price"} onClose={() => setDialog(null)} title={t("mine.priceTitle", { count: picked.length })} labelId="mine-price">
        <div className="flex gap-2">
          {(["markup", "suggested"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={cx("inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold", mode === value ? "border-app-ink bg-app-ink text-white" : "border-app-line")}>
              {value === "markup" ? t("mine.useMarkup") : t("mine.useSuggested")}
            </button>
          ))}
        </div>
        {mode === "markup" ? <MarkupChoices value={pick} onChange={setPick} /> : <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] leading-[1.5]"><strong className="block">{t("mine.suggestedTitle")}</strong>{t("mine.suggestedSub")}</p>}
        <button type="button" data-testid="mine-apply" disabled={busy || (mode === "markup" && !chosen)} onClick={() => void apply()} className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-app-ink px-5 text-[15px] font-bold text-white disabled:opacity-60">{busy ? t("quick.saving") : t("mine.apply", { count: picked.length })}</button>
      </Dialog>
      <Dialog open={dialog === "remove"} onClose={() => setDialog(null)} title={t("mine.removeTitle", { count: picked.length })} labelId="mine-remove">
        <p className="m-0 text-[14.5px] leading-[1.5] text-app-ink-soft">{t("mine.removeBody")}</p>
        <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-app-ink px-5 text-[15px] font-bold text-white disabled:opacity-60">{t("mine.removeConfirm", { count: picked.length })}</button>
      </Dialog>
      <Dialog open={dialog === "markup"} onClose={() => setDialog(null)} title={t("markup.question")} labelId="mine-markup">
        <p className="m-0 -mt-2 text-[14px] text-app-ink-soft">{t("markup.settingsSub")}</p>
        <MarkupEditor initial={markup} onSaved={(saved) => { setMarkup(saved); setDialog(null); }} />
      </Dialog>
    </div>
  );
}
