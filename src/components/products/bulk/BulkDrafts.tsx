"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { categoriesOf, fieldFromKobo, filterItems, koboFromField, readiness, type BulkFilter, type BulkItem } from "@shared/bulk-products";
import { bulkApi, type BulkSession } from "./client";

// The draft list of "Add many with Peggy" on the web. Only the rows on screen are drawn (200+ products stay fast).
// Desktop: a grid like a spreadsheet: name, price, stock and category typed in place, Enter or ↓ to the next row,
// ↑ back. Phones: two fields a row. Filter chips (no price, no name, by category), select many and set a price,
// stock or category for all of them, join them as one product, or remove them.

const COLS = ["name", "price", "stock", "category"] as const;
type Col = (typeof COLS)[number];
type BulkAction = "price" | "stock" | "category";

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export function BulkDrafts({ session, money, onAct, onPublishSome }: { session: BulkSession; money: (kobo: number) => string; onAct: (run: () => Promise<BulkSession | null>) => Promise<void>; onPublishSome: (ids: string[]) => void }) {
  const t = useT("bulkAdd", "common");
  const wide = useWide();
  const [filter, setFilter] = useState<BulkFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | null>(null);
  const [actionValue, setActionValue] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const rowHeight = wide ? 60 : 92;
  const viewHeight = wide ? 470 : 560;

  const shown = useMemo(() => filterItems(session.items, filter), [session.items, filter]);
  const categories = useMemo(() => categoriesOf(session.items), [session.items]);
  // A filter emptied by an action (all "No price" just got a price) goes back to All.
  useEffect(() => {
    if (filter !== "all" && session.items.length && !shown.length) setFilter("all");
  }, [filter, session.items.length, shown.length]);
  const counts = useMemo(() => ({ needsPrice: filterItems(session.items, "needsPrice").length, needsName: filterItems(session.items, "needsName").length, ready: filterItems(session.items, "ready").length, published: filterItems(session.items, "published").length }), [session.items]);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const last = Math.min(shown.length, Math.ceil((scrollTop + viewHeight) / rowHeight) + 6);

  const save = (item: BulkItem, col: Col, raw: string) => {
    const value = raw.trim();
    let patch: Record<string, unknown> | null = null;
    if (col === "name" && value !== item.name) patch = { name: value };
    if (col === "category" && value !== item.category) patch = { category: value };
    if (col === "price") {
      const kobo = koboFromField(value);
      if (kobo !== item.priceKobo && (kobo || !value)) patch = { priceKobo: kobo };
    }
    if (col === "stock") {
      const stock = value ? Number(value.replace(/\D/g, "")) : null;
      if (stock !== item.stock && (stock === null || Number.isFinite(stock))) patch = { stock };
    }
    if (patch) void onAct(() => bulkApi.items(session.id, { op: "edit", id: item.id, patch }));
  };

  function focusCell(row: number, col: number) {
    if (row < 0 || row >= shown.length || !box.current) return;
    const top = row * rowHeight;
    if (top < box.current.scrollTop) box.current.scrollTop = top;
    else if (top + rowHeight > box.current.scrollTop + viewHeight) box.current.scrollTop = top + rowHeight - viewHeight;
    requestAnimationFrame(() => requestAnimationFrame(() => (box.current?.querySelector(`[data-cell="${row}:${col}"]`) as HTMLInputElement | null)?.focus()));
  }

  const toggle = (id: string) =>
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ids = [...selected].filter((id) => session.items.some((item) => item.id === id && !item.productId));

  function applyAction() {
    if (!action || !ids.length) return;
    const patch = action === "price" ? { priceKobo: koboFromField(actionValue) } : action === "stock" ? { stock: Number(actionValue.replace(/\D/g, "")) || 0 } : { category: actionValue.trim() };
    if (action === "price" && !patch.priceKobo) return;
    void onAct(() => bulkApi.items(session.id, { op: "bulk", ids, patch }));
    setAction(null);
    setActionValue("");
  }

  const chip = (key: BulkFilter, label: string, count?: number) => (
    <button key={key} type="button" onClick={() => { setFilter(key); setScrollTop(0); if (box.current) box.current.scrollTop = 0; }} aria-pressed={filter === key} className={cx("inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold", filter === key ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink")}>
      {label}
      {count !== undefined && <span className={cx("text-[12px]", filter === key ? "text-white/70" : "text-app-ink-soft")}>{count}</span>}
    </button>
  );

  return (
    <section className="flex flex-col overflow-hidden rounded-[22px] border border-app-line bg-white" aria-label={t("list.title")} data-testid="bulk-drafts">
      <div className="flex gap-2 overflow-x-auto border-b border-app-line px-3 py-2.5 [scrollbar-width:none]">
        {chip("all", t("filter.all"), session.items.length)}
        {chip("needsPrice", t("filter.needsPrice"), counts.needsPrice)}
        {chip("needsName", t("filter.needsName"), counts.needsName)}
        {chip("ready", t("filter.ready"), counts.ready)}
        {counts.published > 0 && chip("published", t("filter.published"), counts.published)}
        {categories.map((category) => chip(`cat:${category.name}`, category.name, category.count))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-app-line px-3 py-2 text-[13px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={shown.length > 0 && shown.every((item) => selected.has(item.id))} onChange={(event) => setSelected(event.target.checked ? new Set(shown.filter((item) => !item.productId).map((item) => item.id)) : new Set())} />
          {selected.size ? t("select.count", { count: selected.size }) : t("select.all")}
        </label>
        {ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="bulk-actions">
            {(["price", "stock", "category"] as const).map((key) => (
              <button key={key} type="button" onClick={() => { setAction(key); setActionValue(""); }} className={cx("min-h-[32px] rounded-full px-3 font-bold", action === key ? "bg-app-ink text-white" : "border border-app-line")}>{t(`bulk.${key}`)}</button>
            ))}
            {ids.length > 1 && <button type="button" onClick={() => { void onAct(() => bulkApi.items(session.id, { op: "join", ids, kind: "angles" })); setSelected(new Set()); }} className="min-h-[32px] rounded-full border border-app-line px-3 font-bold">{t("bulk.join")}</button>}
            <button type="button" onClick={() => onPublishSome(ids.filter((id) => readiness(session.items.find((item) => item.id === id)!) === "ready"))} className="min-h-[32px] rounded-full border border-app-line px-3 font-bold">{t("publish.button", { count: ids.filter((id) => readiness(session.items.find((item) => item.id === id)!) === "ready").length })}</button>
            <button type="button" onClick={() => { void onAct(() => bulkApi.items(session.id, { op: "remove", ids })); setSelected(new Set()); }} className="min-h-[32px] rounded-full px-3 font-bold text-app-danger">{t("bulk.remove")}</button>
            <button type="button" onClick={() => { setSelected(new Set()); setAction(null); }} className="min-h-[32px] px-2 text-app-ink-soft">{t("select.cancel")}</button>
          </div>
        )}
        {action && ids.length > 0 && (
          <form className="flex w-full items-center gap-2" onSubmit={(event) => { event.preventDefault(); applyAction(); }}>
            <label className="text-app-ink-soft" htmlFor="bulk-action-value">{t(`bulk.${action}For`, { count: ids.length })}</label>
            <input id="bulk-action-value" autoFocus value={actionValue} onChange={(event) => setActionValue(event.target.value)} inputMode={action === "category" ? "text" : "numeric"} placeholder={action === "price" ? "15000" : action === "stock" ? "10" : t("item.category")} className="min-h-[36px] w-40 rounded-[10px] border border-app-line px-3" />
            <button type="submit" className="min-h-[36px] rounded-full bg-app-ink px-4 font-bold text-white">{t("bulk.apply")}</button>
          </form>
        )}
      </div>

      {wide && (
        <div className="grid grid-cols-[28px_48px_34px_minmax(0,1fr)_104px_52px_96px_36px] gap-2 border-b border-app-line bg-app-canvas px-3 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-app-ink-soft" role="row">
          <span />
          <span>{t("grid.photo")}</span>
          <span>#</span>
          <span>{t("item.name")}</span>
          <span>{t("item.price")}</span>
          <span>{t("item.stock")}</span>
          <span>{t("item.category")}</span>
          <span />
        </div>
      )}

      <div ref={box} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} className="relative overflow-y-auto" style={{ height: Math.min(viewHeight, Math.max(rowHeight * 3, shown.length * rowHeight)) }} role="grid" aria-rowcount={shown.length}>
        {!shown.length && <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">{t("empty.none")}</p>}
        <div style={{ height: shown.length * rowHeight, position: "relative" }}>
          {shown.slice(first, last).map((item, offset) => {
            const row = first + offset;
            const state = readiness(item);
            const locked = Boolean(item.productId);
            const cell = (col: Col, value: string, extra: string, props: Record<string, unknown> = {}) => (
              <input
                key={`${item.id}:${col}:${value}`}
                data-cell={`${row}:${COLS.indexOf(col)}`}
                defaultValue={value}
                disabled={locked}
                aria-label={`${t(`item.${col}`)} ${item.number}`}
                onBlur={(event) => save(item, col, event.currentTarget.value)}
                onKeyDown={(event) => {
                  const c = COLS.indexOf(col);
                  if (event.key === "Enter" || event.key === "ArrowDown") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    focusCell(row + 1, c);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    focusCell(row - 1, c);
                  }
                }}
                className={cx("min-h-[38px] w-full min-w-0 rounded-[10px] border border-transparent bg-transparent px-2 text-[14px] outline-none hover:border-app-line focus:border-app-line-strong focus:bg-white disabled:text-app-ink-soft", extra)}
                {...props}
              />
            );
            // Desktop: an icon with its words as the tooltip (the column is narrow); phones: the words.
            const mark = state === "published" ? <span title={t("item.published")} aria-label={t("item.published")}><Icon name="check" size={16} className="text-app-forest" /></span> : state === "drafting" ? <span title={t("item.reading")} aria-label={t("item.reading")}><Icon name="clock" size={16} className="text-app-ink-soft" /></span> : item.publishError ? <span title={t("item.failed")} aria-label={t("item.failed")}><Icon name="warn" size={16} className="text-app-danger" /></span> : state === "ready" ? <Icon name="checkCircle" size={16} className="text-app-forest" /> : null;
            const badge = state === "published" ? <span className="rounded-full bg-app-mint px-2 py-0.5 text-[11.5px] font-bold">{t("item.published")}</span> : state === "drafting" ? <span className="text-[11.5px] text-app-ink-soft">{t("item.reading")}</span> : item.publishError ? <span className="text-[11.5px] font-bold text-app-danger">{t("item.failed")}</span> : state === "ready" ? <Icon name="checkCircle" size={16} className="text-app-forest" /> : null;
            const photo = (
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.photos[0] ? <img src={item.photos[0]} alt="" loading="lazy" className="h-11 w-11 rounded-[10px] bg-app-canvas object-cover" /> : <span className="block h-11 w-11 rounded-[10px] bg-app-canvas" />}
                {item.photos.length > 1 && <span className="absolute -bottom-1 -right-1 rounded-full bg-app-ink px-1.5 text-[10.5px] font-bold text-white">{item.photos.length}</span>}
              </span>
            );
            const hint = item.hintLowKobo && !item.priceKobo ? t("item.hint", { low: money(item.hintLowKobo), high: money(item.hintHighKobo ?? item.hintLowKobo) }) : "";
            return wide ? (
              <div key={item.id} role="row" className={cx("absolute inset-x-0 grid grid-cols-[28px_48px_34px_minmax(0,1fr)_104px_52px_96px_36px] items-center gap-2 border-b border-app-line-soft px-3", selected.has(item.id) && "bg-app-mint/40")} style={{ top: row * rowHeight, height: rowHeight }}>
                <input type="checkbox" className="h-4 w-4" checked={selected.has(item.id)} disabled={locked} onChange={() => toggle(item.id)} aria-label={`${t("select.start")} ${item.number}`} />
                {photo}
                <span className="text-[13px] font-bold text-app-ink-soft">{item.number}</span>
                {cell("name", item.name, "font-bold", { placeholder: t("item.unnamed", { n: item.number }) })}
                {cell("price", fieldFromKobo(item.priceKobo), "", { inputMode: "numeric", placeholder: hint ? `~${money(item.hintLowKobo!)}` : "₦", title: hint })}
                {cell("stock", item.stock === null ? "" : String(item.stock), "", { inputMode: "numeric", placeholder: "–" })}
                {cell("category", item.category, "text-app-ink-soft")}
                <span className="flex justify-end">{mark}</span>
              </div>
            ) : (
              <div key={item.id} className={cx("absolute inset-x-0 flex items-center gap-2.5 border-b border-app-line-soft px-3", selected.has(item.id) && "bg-app-mint/40")} style={{ top: row * rowHeight, height: rowHeight }}>
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={selected.has(item.id)} disabled={locked} onChange={() => toggle(item.id)} aria-label={`${t("select.start")} ${item.number}`} />
                {photo}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] font-bold text-app-ink-soft">{item.number}.</span>
                    {cell("name", item.name, "font-bold min-h-[34px]", { placeholder: t("item.unnamed", { n: item.number }) })}
                  </div>
                  <div className="flex items-center gap-2">
                    {cell("price", fieldFromKobo(item.priceKobo), "min-h-[34px] max-w-[130px] border-app-line bg-app-canvas", { inputMode: "numeric", placeholder: hint ? `~${money(item.hintLowKobo!)}` : t("item.price") })}
                    <span className="truncate text-[12px] text-app-ink-soft">{item.category}</span>
                    <span className="ml-auto shrink-0">{badge}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
