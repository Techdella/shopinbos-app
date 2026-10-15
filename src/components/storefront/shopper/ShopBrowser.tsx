"use client";

// The shop page layouts a seller picks in the builder (shop-browse.ts): a filters column with a phone drawer, category
// tiles above the products, one product row per category, or a sticky bar of category chips. Shared by both storefront
// renderers: each passes its own product card and colours. Filtering runs over the products already on the page.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import {
  activeShopFilters,
  browseShop,
  clearShopFilters,
  filterShopProducts,
  inStock,
  onSale,
  priceBounds,
  SHOP_SORT_LABELS,
  SHOP_SORTS,
  shopGroups,
  shopQueryParams,
  shopTags,
  withGroup,
  withoutFilter,
  type ActiveFilter,
  type BrowseCollection,
  type BrowseProduct,
  type ShopGroup,
  type ShopLayoutOptions,
  type ShopQuery,
  type ShopSort,
} from "./shop-browse";

export interface ShopPalette {
  ink: string;
  muted: string;
  border: string;
  /** Page background (the drawer and sticky bar sit on it). */
  paper: string;
  /** Raised panels: selected rows, tile backgrounds. */
  raised: string;
  accent: string;
  ctaBg: string;
  ctaText: string;
  headingFont: string;
  buttonRadius: number;
  cardRadius: number;
}

export interface ShopBrowserProps<P extends BrowseProduct> {
  products: P[];
  collections: BrowseCollection[];
  options: ShopLayoutOptions;
  query: ShopQuery;
  onQuery: (next: ShopQuery, how?: "push" | "replace") => void;
  /** The heading when no category is picked ("Shop all"). */
  title: string;
  /** The renderer's own section heading. */
  renderTitle?: (id: string, text: string, action?: React.ReactNode) => React.ReactNode;
  renderTile: (product: P, index: number) => React.ReactNode;
  palette: ShopPalette;
  formatPrice: (amount: number) => string;
  /** Builder preview: the phone filter panel opens in place instead of over the screen. */
  editor?: boolean;
  /** The renderer's page-width wrapper class. */
  wrapClassName?: string;
}

const CSS = `
.sb{container-type:inline-size;container-name:sb;width:100%;min-width:0}
.sb *{box-sizing:border-box}
.sb-only-wide{display:none}
.sb-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-bottom:14px}
.sb-count{margin:0 auto 0 0;font-size:13.5px}
.sb-pill{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid var(--sb-border);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.sb-sort{display:flex;align-items:center;gap:8px;font-size:13.5px}
.sb-sort select{height:44px;max-width:62vw;border:1px solid var(--sb-border);border-radius:999px;background:transparent;color:inherit;padding:0 12px;font:inherit;font-size:14px}
.sb-sort option{color:#111;background:#fff}
.sb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}
.sb-chips-active{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.sb-chip{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:1px solid var(--sb-border);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.sb-link{border:0;background:none;padding:0 4px;color:inherit;font:inherit;font-size:13.5px;font-weight:600;text-decoration:underline;text-underline-offset:4px;cursor:pointer;min-height:36px}
.sb-panel{display:grid;gap:22px}
.sb-panel fieldset{border:0;margin:0;padding:0;min-width:0}
.sb-panel legend{padding:0;margin-bottom:10px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.sb-option{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 8px;border-radius:10px;font-size:14.5px;cursor:pointer}
.sb-option input{width:18px;height:18px;margin:0;accent-color:var(--sb-accent);flex:0 0 auto}
.sb-option[data-disabled]{opacity:.45;cursor:default}
.sb-option .sb-n{margin-left:auto;font-size:12.5px}
.sb-price{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sb-price label{display:grid;gap:4px;font-size:12.5px}
.sb-price input{width:100%;height:44px;border:1px solid var(--sb-border);border-radius:10px;background:transparent;color:inherit;padding:0 10px;font:inherit;font-size:15px}
.sb-split{display:grid;gap:20px}
.sb-tiles{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 6px;margin-bottom:18px;scrollbar-width:none}
.sb-tiles::-webkit-scrollbar,.sb-chiprow::-webkit-scrollbar,.sb-row::-webkit-scrollbar{display:none}
.sb-tile{flex:0 0 104px;display:flex;flex-direction:column;gap:7px;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;scroll-snap-align:start}
.sb-tile-media{position:relative;display:block;aspect-ratio:1/1;overflow:hidden;border-radius:var(--sb-card-radius);background:var(--sb-raised);outline:2px solid transparent;outline-offset:2px}
.sb-tile[aria-pressed="true"] .sb-tile-media{outline-color:var(--sb-ink)}
.sb-tile-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sb-tile-name{font-size:13.5px;font-weight:600;line-height:1.25}
.sb-tile-n{font-size:12px}
.sb-chipbar{position:sticky;z-index:20;margin:0 -16px 14px;padding:10px 16px;background:var(--sb-paper);border-bottom:1px solid var(--sb-border)}
.sb-chiprow{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.sb-gchip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 15px;border:1px solid var(--sb-border);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap}
.sb-gchip[aria-pressed="true"]{background:var(--sb-ink);border-color:var(--sb-ink);color:var(--sb-paper);font-weight:600}
.sb-rows{display:grid;gap:34px}
.sb-row-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.sb-row-head h3{margin:0 auto 0 0;font-size:19px;line-height:1.2;font-weight:600}
.sb-arrow{display:inline-grid;place-items:center;width:38px;height:38px;border:1px solid var(--sb-border);border-radius:999px;background:transparent;color:inherit;cursor:pointer}
.sb-row{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;padding:2px 2px 6px}
.sb-row > *{flex:0 0 44%;scroll-snap-align:start;min-width:0}
.sb-drawer{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end}
.sb-drawer-panel{position:relative;display:flex;flex-direction:column;width:100%;max-height:88vh;border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.25)}
.sb-drawer-body{overflow-y:auto;padding:16px 20px}
.sb-drawer-foot{display:flex;gap:10px;padding:12px 20px max(14px,env(safe-area-inset-bottom));border-top:1px solid var(--sb-border)}
.sb-inline-panel{border:1px solid var(--sb-border);border-radius:var(--sb-card-radius);margin-bottom:16px}
@media (prefers-reduced-motion: no-preference){
  .sb-drawer-panel{animation:sb-up .22s ease-out}
  @keyframes sb-up{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}
}
@media (prefers-reduced-motion: reduce){.sb-row{scroll-behavior:auto}}
@container sb (min-width: 760px){
  .sb-only-wide{display:block}
  .sb-only-narrow{display:none !important}
  .sb-grid{grid-template-columns:repeat(var(--sb-cols),minmax(0,1fr));gap:28px 16px}
  .sb-split[data-aside]{grid-template-columns:230px minmax(0,1fr);gap:36px;align-items:start}
  .sb-aside{position:sticky;top:96px;max-height:calc(100vh - 120px);overflow-y:auto;padding-right:4px}
  .sb-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:16px;overflow:visible}
  .sb-tile{flex:none}
  .sb-chipbar{position:static;margin:0 0 18px;padding:0;border:0;background:none}
  .sb-chiprow{flex-wrap:wrap}
  .sb-row > *{flex-basis:calc((100% - 36px) / 4)}
  .sb-row[data-cols="2"] > *{flex-basis:calc((100% - 12px) / 2)}
  .sb-row[data-cols="3"] > *{flex-basis:calc((100% - 24px) / 3)}
}
`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const FOCUSABLE = "input:not([disabled]), button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/** The phone filters: a sheet from the bottom that keeps focus inside, closes on Esc and gives focus back. */
function FilterDrawer({ title, palette, onClose, children, footer }: { title: string; palette: ShopPalette; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  const vars = paletteVars(palette);
  return createPortal(
    <div className="sb-drawer" role="presentation" style={vars}>
      <style>{CSS}</style>
      <button type="button" aria-label="Close filters" tabIndex={-1} onClick={onClose} style={{ position: "absolute", inset: 0, border: 0, background: "rgba(0,0,0,.45)", cursor: "default" }} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sb-drawer-panel" style={{ background: palette.paper, color: palette.ink }}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: palette.border }}>
          <h2 id={titleId} className="m-0 text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="sb-arrow" aria-label="Close filters">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="sb-drawer-body">{children}</div>
        <div className="sb-drawer-foot">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

function paletteVars(palette: ShopPalette): React.CSSProperties {
  return {
    "--sb-ink": palette.ink,
    "--sb-border": palette.border,
    "--sb-paper": palette.paper,
    "--sb-raised": palette.raised,
    "--sb-accent": palette.accent,
    "--sb-card-radius": `${palette.cardRadius}px`,
  } as React.CSSProperties;
}

/** One category's products in a row that scrolls sideways (arrows on computers; swipe, or the keyboard once focused). */
function CategoryRow<P extends BrowseProduct>({ group, products, columns, showCount, palette, onSeeAll, renderTile }: {
  group: ShopGroup;
  products: P[];
  columns: number;
  showCount: boolean;
  palette: ShopPalette;
  onSeeAll: () => void;
  renderTile: (product: P, index: number) => React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const scroll = (direction: number) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.9, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  return (
    <section aria-labelledby={headingId}>
      <div className="sb-row-head">
        <h3 id={headingId} style={{ fontFamily: palette.headingFont }}>
          {group.name}
          {showCount ? <span className="ml-2 text-[13px] font-normal" style={{ color: palette.muted }}>({group.count})</span> : null}
        </h3>
        <button type="button" className="sb-link" onClick={onSeeAll} aria-label={`See all ${group.name}`}>
          See all <span aria-hidden>→</span>
        </button>
        <span className="sb-only-wide">
          <span className="flex gap-2">
            <button type="button" className="sb-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${group.name} back`}><Icon name="arrowLeft" size={15} /></button>
            <button type="button" className="sb-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${group.name} forward`}><Icon name="chevRight" size={15} /></button>
          </span>
        </span>
      </div>
      {/* Focusable so arrow keys scroll it; labelled for screen readers. */}
      <div ref={rowRef} className="sb-row" data-cols={columns} role="region" aria-label={`${group.name} products`} tabIndex={0}>
        {products.map((product, index) => <div key={product.id}>{renderTile(product, index)}</div>)}
      </div>
    </section>
  );
}

export function ShopBrowser<P extends BrowseProduct>(props: ShopBrowserProps<P>) {
  const { products, collections, options, query, onQuery, palette } = props;
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stickyTop, setStickyTop] = useState(0);
  const layout = options.layout;
  const sort: ShopSort = query.sort || options.defaultSort;

  const groups = useMemo(() => shopGroups(products, collections, query), [products, collections, query]);
  const results = useMemo(() => browseShop(products, query, collections, options.defaultSort), [products, query, collections, options.defaultSort]);
  const withoutGroup = useMemo(() => filterShopProducts(products, query, collections, "group").length, [products, query, collections]);
  const wantsTags = options.filters.includes("tags");
  const tags = useMemo(() => (wantsTags ? shopTags(products, query, collections) : []), [wantsTags, products, query, collections]);
  const bounds = useMemo(() => priceBounds(products), [products]);
  const availability = useMemo(() => ({
    inStock: filterShopProducts(products, query, collections, "instock").filter(inStock).length,
    onSale: filterShopProducts(products, query, collections, "sale").filter(onSale).length,
    anyOnSale: products.some(onSale),
  }), [products, query, collections]);
  const active = activeShopFilters(query);
  const selected = groups.find((group) => (group.kind === "category" ? group.key === query.category : group.key === query.collection)) ?? null;

  // "Show more": a fresh page of results whenever the filters change.
  const pageSize = options.pageSize ?? Number.POSITIVE_INFINITY;
  const queryKey = `${shopQueryParams(query).toString()}|${query.q}`;
  const [shown, setShown] = useState({ key: queryKey, count: pageSize });
  const shownCount = shown.key === queryKey ? shown.count : pageSize;

  // The category bar sticks under the store's sticky header on phones (the builder preview has its own scrolling).
  const editor = Boolean(props.editor);
  useEffect(() => {
    if (layout !== "chips" || editor) return;
    const header = rootRef.current?.ownerDocument.querySelector("header");
    if (!header) return;
    const measure = () => {
      const position = window.getComputedStyle(header).position;
      setStickyTop(position === "sticky" || position === "fixed" ? header.getBoundingClientRect().height : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [layout, editor]);

  const pickGroup = (group: ShopGroup | null) => onQuery(withGroup(query, group), "push");
  const groupLabel = (filter: Extract<ActiveFilter, { id: "group" }>) => groups.find((group) => group.kind === filter.kind && group.key === filter.value)?.name ?? filter.value;
  const chipLabel = (filter: ActiveFilter): string => {
    if (filter.id === "group") return groupLabel(filter);
    if (filter.id === "price") {
      if (filter.min !== null && filter.max !== null) return `${props.formatPrice(filter.min)} – ${props.formatPrice(filter.max)}`;
      return filter.min !== null ? `From ${props.formatPrice(filter.min)}` : `Up to ${props.formatPrice(filter.max ?? 0)}`;
    }
    if (filter.id === "instock") return "In stock";
    if (filter.id === "sale") return "On sale";
    return filter.value;
  };
  const filterCount = active.length;
  const heading = selected?.name ?? (query.view === "all" ? "All products" : props.title);
  const headingId = `${uid}-title`;
  const muted = { color: palette.muted };

  const sortControl = (
    <label className="sb-sort" style={muted}>
      <span>Sort by</span>
      <select value={sort} onChange={(event) => onQuery({ ...query, sort: event.target.value as ShopSort }, "push")} style={{ color: palette.ink }}>
        {SHOP_SORTS.map((value) => <option key={value} value={value}>{SHOP_SORT_LABELS[value]}</option>)}
      </select>
    </label>
  );

  const hasPanel = layout === "filters" && options.filters.some((key) => (key === "category" ? groups.length > 0 : key === "tags" ? tags.length > 0 : key === "sale" ? availability.anyOnSale : key === "price" ? Boolean(bounds) : true));

  const toolbar = (
    <div className="sb-toolbar">
      {hasPanel ? (
        <button type="button" className="sb-pill sb-only-narrow" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}>
          <Icon name="filter" size={16} /> Filters{filterCount ? ` (${filterCount})` : ""}
        </button>
      ) : null}
      <p className="sb-count" style={muted} aria-live="polite">{results.length} {results.length === 1 ? "product" : "products"}</p>
      {sortControl}
    </div>
  );

  // Chips for the filters a shopper turned on. The tile and chip layouts already show the picked category.
  const removable = layout === "filters" ? active : active.filter((filter) => filter.id !== "group");
  const activeChips = removable.length ? (
    <div className="sb-chips-active" role="group" aria-label="Filters on">
      {removable.map((filter) => (
        <button key={filter.id} type="button" className="sb-chip" onClick={() => onQuery(withoutFilter(query, filter.id), "push")} aria-label={`Remove filter: ${chipLabel(filter)}`}>
          {chipLabel(filter)} <Icon name="x" size={13} />
        </button>
      ))}
      <button type="button" className="sb-link" onClick={() => onQuery(clearShopFilters(query), "push")}>Clear all</button>
    </div>
  ) : null;

  const panel = (prefix: string) => {
    const name = `${uid}-${prefix}`;
    const count = (n: number) => (options.showCounts ? <span className="sb-n" style={muted}>({n})</span> : null);
    const option = (key: string, label: string, n: number, checked: boolean, onChange: () => void, type: "radio" | "checkbox" = "checkbox") => {
      const disabled = n === 0 && !checked;
      return (
        <label key={key} className="sb-option" data-disabled={disabled ? "" : undefined} style={checked && type === "radio" ? { background: palette.raised, fontWeight: 600 } : undefined}>
          <input type={type} name={type === "radio" ? `${name}-group` : undefined} checked={checked} disabled={disabled} onChange={onChange} />
          <span className="min-w-0">{label}</span>
          {count(n)}
        </label>
      );
    };
    return (
      <form className="sb-panel" onSubmit={(event) => event.preventDefault()}>
        {options.filters.map((key) => {
          if (key === "category" && groups.length) {
            return (
              <fieldset key={key}>
                <legend>Category</legend>
                {option("all", "All products", withoutGroup, !selected, () => pickGroup(null), "radio")}
                {groups.map((group) => option(`${group.kind}-${group.key}`, group.name, group.count, selected === group, () => pickGroup(group), "radio"))}
              </fieldset>
            );
          }
          if (key === "price" && bounds) {
            const set = (field: "min" | "max", raw: string) => {
              const value = raw.trim() === "" ? null : Math.max(0, Math.round(Number(raw)));
              onQuery({ ...query, [field]: value === null || Number.isFinite(value) ? value : null }, "replace");
            };
            return (
              <fieldset key={key}>
                <legend>Price</legend>
                <div className="sb-price">
                  <label>
                    <span style={muted}>Min<span className="sr-only"> price</span></span>
                    <input type="number" inputMode="numeric" min={0} step="any" placeholder={String(bounds.min)} value={query.min ?? ""} onChange={(event) => set("min", event.target.value)} />
                  </label>
                  <label>
                    <span style={muted}>Max<span className="sr-only"> price</span></span>
                    <input type="number" inputMode="numeric" min={0} step="any" placeholder={String(bounds.max)} value={query.max ?? ""} onChange={(event) => set("max", event.target.value)} />
                  </label>
                </div>
              </fieldset>
            );
          }
          if (key === "instock") {
            return (
              <fieldset key={key}>
                <legend>Availability</legend>
                {option("instock", "In stock only", availability.inStock, query.inStock, () => onQuery({ ...query, inStock: !query.inStock }, "push"))}
              </fieldset>
            );
          }
          if (key === "sale" && availability.anyOnSale) {
            return (
              <fieldset key={key}>
                <legend>Deals</legend>
                {option("sale", "On sale", availability.onSale, query.onSale, () => onQuery({ ...query, onSale: !query.onSale }, "push"))}
              </fieldset>
            );
          }
          if (key === "tags" && tags.length) {
            return (
              <fieldset key={key}>
                <legend>Tags</legend>
                {tags.map((entry) => {
                  const on = query.tags.some((tag) => tag.toLowerCase() === entry.tag.toLowerCase());
                  return option(`tag-${entry.tag}`, entry.tag, entry.count, on, () => onQuery({ ...query, tags: on ? query.tags.filter((tag) => tag.toLowerCase() !== entry.tag.toLowerCase()) : [...query.tags, entry.tag] }, "push"));
                })}
              </fieldset>
            );
          }
          return null;
        })}
      </form>
    );
  };

  const visible = results.slice(0, shownCount);
  const grid = (
    <>
      {visible.length ? (
        <div className="sb-grid" style={{ "--sb-cols": options.columns } as React.CSSProperties}>
          {visible.map((product, index) => <div key={product.id} className="min-w-0">{props.renderTile(product, index)}</div>)}
        </div>
      ) : (
        <div className="py-10 text-center">
          <p className="m-0 text-[14.5px]" style={muted}>{products.length ? "No products match these filters." : "Products are on the way. Check back soon."}</p>
          {products.length && active.length ? (
            <button type="button" className="sb-pill mt-4" onClick={() => onQuery(clearShopFilters(query), "push")}>Clear filters</button>
          ) : null}
        </div>
      )}
      {visible.length < results.length ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <p className="m-0 text-[13px]" style={muted}>Showing {visible.length} of {results.length}</p>
          <button
            type="button"
            className="sb-pill"
            style={{ borderRadius: palette.buttonRadius }}
            onClick={(event) => {
              event.stopPropagation();
              setShown({ key: queryKey, count: shownCount + pageSize });
            }}
          >
            Show more
          </button>
        </div>
      ) : null}
    </>
  );

  const drawerFooter = (
    <>
      <button type="button" className="sb-pill" onClick={() => onQuery(clearShopFilters(query), "push")} disabled={!active.length}>Clear all</button>
      <button type="button" className="sb-pill" style={{ flex: 1, justifyContent: "center", background: palette.ctaBg, color: palette.ctaText, borderColor: palette.ctaBg, borderRadius: palette.buttonRadius }} onClick={() => setDrawerOpen(false)}>
        Show {results.length} {results.length === 1 ? "product" : "products"}
      </button>
    </>
  );
  const drawer = hasPanel && drawerOpen
    ? props.editor
      ? (
        <div className="sb-inline-panel sb-only-narrow" style={{ background: palette.paper }}>
          <div className="p-4">{panel("drawer")}</div>
          <div className="sb-drawer-foot">{drawerFooter}</div>
        </div>
      )
      : <FilterDrawer title="Filters" palette={palette} onClose={() => setDrawerOpen(false)} footer={drawerFooter}>{panel("drawer")}</FilterDrawer>
    : null;

  const titleNode = props.renderTitle ? props.renderTitle(headingId, heading) : (
    <h2 id={headingId} className="mb-5 text-[26px] font-semibold" style={{ fontFamily: palette.headingFont }}>{heading}</h2>
  );

  const groupCount = (group: ShopGroup) => (options.showCounts ? group.count : null);

  let body: React.ReactNode;
  if (layout === "filters") {
    body = (
      <div className="sb-split" data-aside={hasPanel ? "" : undefined}>
        {hasPanel ? <aside className="sb-aside sb-only-wide" aria-label="Filters">{panel("side")}</aside> : null}
        <div className="min-w-0">
          {toolbar}
          {drawer}
          {activeChips}
          {grid}
        </div>
      </div>
    );
  } else if (layout === "tiles") {
    const allImage = products.find((product) => product.images[0])?.images[0] ?? null;
    const tile = (key: string, name: string, image: string | null, n: number | null, pressed: boolean, onClick: () => void) => (
      <button key={key} type="button" className="sb-tile" aria-pressed={pressed} onClick={onClick}>
        <span className="sb-tile-media">
          {image ? <img src={image} alt="" width={240} height={240} loading="lazy" decoding="async" /> : <span className="absolute inset-0 grid place-items-center" style={muted}><Icon name="grid" size={22} /></span>}
        </span>
        <span className="sb-tile-name">{name}</span>
        {n !== null ? <span className="sb-tile-n" style={muted}>{n} {n === 1 ? "product" : "products"}</span> : null}
      </button>
    );
    body = (
      <>
        {groups.length ? (
          <div className="sb-tiles" role="group" aria-label="Shop by category">
            {tile("all", "All", allImage, options.showCounts ? withoutGroup : null, !selected, () => pickGroup(null))}
            {groups.map((group) => tile(`${group.kind}-${group.key}`, group.name, group.image, groupCount(group), selected === group, () => pickGroup(group)))}
          </div>
        ) : null}
        {toolbar}
        {activeChips}
        {grid}
      </>
    );
  } else if (layout === "chips") {
    const chip = (key: string, name: string, n: number | null, pressed: boolean, onClick: () => void) => (
      <button key={key} type="button" className="sb-gchip" aria-pressed={pressed} onClick={onClick}>
        {name}
        {n !== null ? <span style={{ opacity: 0.7, fontSize: 12.5 }}>{n}</span> : null}
      </button>
    );
    body = (
      <>
        {groups.length ? (
          <div className="sb-chipbar" style={{ top: stickyTop }}>
            <div className="sb-chiprow" role="group" aria-label="Categories">
              {chip("all", "All", options.showCounts ? withoutGroup : null, !selected, () => pickGroup(null))}
              {groups.map((group) => chip(`${group.kind}-${group.key}`, group.name, groupCount(group), selected === group, () => pickGroup(group)))}
            </div>
          </div>
        ) : null}
        {toolbar}
        {activeChips}
        {grid}
      </>
    );
  } else {
    // Category rows. A picked category (See all) or "Shop all" shows the grid, with a way back to the rows.
    const rows = [...groups].filter((group) => group.count > 0).sort((a, b) => b.count - a.count).slice(0, options.carouselRows);
    if (selected || query.view === "all" || !rows.length) {
      body = (
        <>
          {rows.length || selected ? (
            <button type="button" className="sb-link mb-3 inline-flex items-center gap-1" onClick={() => pickGroup(null)}>
              <Icon name="arrowLeft" size={14} /> All categories
            </button>
          ) : null}
          {toolbar}
          {activeChips}
          {grid}
        </>
      );
    } else {
      const sorted = (group: ShopGroup) => results.filter((product) => (group.kind === "category" ? product.category?.slug === group.key : collections.find((entry) => entry.id === group.key)?.productIds.includes(product.id))).slice(0, options.carouselProducts);
      body = (
        <>
          <div className="sb-toolbar">
            <p className="sb-count" style={muted}>{results.length} {results.length === 1 ? "product" : "products"} in {groups.length} {groups.length === 1 ? "category" : "categories"}</p>
            <button type="button" className="sb-pill" onClick={() => onQuery({ ...withGroup(query, null), view: "all" }, "push")}>
              Shop all <span aria-hidden>→</span>
            </button>
          </div>
          {activeChips}
          <div className="sb-rows">
            {rows.map((group) => (
              <CategoryRow
                key={`${group.kind}-${group.key}`}
                group={group}
                products={sorted(group)}
                columns={options.columns}
                showCount={options.showCounts}
                palette={palette}
                onSeeAll={() => pickGroup(group)}
                renderTile={props.renderTile}
              />
            ))}
          </div>
        </>
      );
    }
  }

  return (
    <section ref={rootRef} aria-labelledby={headingId} className={`sb ${props.wrapClassName ?? ""} py-8`} data-shop-layout={layout} style={{ ...paletteVars(palette), color: palette.ink }}>
      <style>{CSS}</style>
      {titleNode}
      {body}
    </section>
  );
}
