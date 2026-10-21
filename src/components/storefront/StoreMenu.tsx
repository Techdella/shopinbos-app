"use client";

import { useEffect, useId, useRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { MENU_PAGE_LABELS, contentRefName, type MenuItem, type MenuStyle, type MobileMenuStyle } from "@/lib/storefront/menu";
import { readLogoDisplay, storeLogoView } from "@shared/store-logo";
import { StoreBrandMark } from "./StoreBrandMark";

// The store's main menu on the page, shared by every theme: the bar on computers (five looks, dropdowns for sub-items)
// and the ☰ button on phones, which opens the same menu as a side drawer, a full-screen menu or a bottom sheet.

/** A menu item ready to show: where it goes and whether it's the page shoppers are on. */
export interface ShownMenuItem {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  current?: boolean;
  newTab?: boolean;
  image?: string | null;
  children: ShownMenuItem[];
}

export interface MenuContext {
  /** Pages the store has (home always counts). */
  hasPage: (page: string) => boolean;
  pageLabel?: (page: string) => string | undefined;
  pageHref?: (page: string) => string | undefined;
  goPage: (page: string) => void;
  categories: Array<{ slug: string; name: string; imageUrl?: string | null }>;
  categoryHref?: (slug: string) => string | undefined;
  goCategory: (slug: string) => void;
  products?: Array<{ id: string; name: string; images?: string[] }>;
  productHref?: (id: string) => string | undefined;
  goProduct?: (id: string) => void;
  /** A path on the store ("/blog", "/blog/a-post") as a link, for content (CMS) menu items. */
  storeHref?: (path: string) => string | undefined;
  /** The page shoppers are on. */
  current?: string;
  /** "Shop" with no sub-items of its own lists the store's categories (on by default). */
  categoriesUnderShop?: boolean;
}

/** Turns the saved menu into links, dropping pages, categories and products the store doesn't have. */
export function resolveMenu(menu: MenuItem[], ctx: MenuContext): ShownMenuItem[] {
  // The seller's (or Rex's) own picture for an item wins over the category's or product's.
  const one = (item: MenuItem): ShownMenuItem | null => {
    const shown = base(item);
    return shown && item.image ? { ...shown, image: item.image } : shown;
  };
  const base = (item: MenuItem): ShownMenuItem | null => {
    const custom = item.label.trim();
    if (item.kind === "page") {
      const page = item.ref ?? "";
      if (page !== "home" && !ctx.hasPage(page)) return null;
      const label = custom || ctx.pageLabel?.(page) || MENU_PAGE_LABELS[page];
      if (!label) return null;
      return { id: item.id, label, href: ctx.pageHref?.(page), onSelect: () => ctx.goPage(page), current: ctx.current === page, children: [] };
    }
    if (item.kind === "category") {
      const category = ctx.categories.find((entry) => entry.slug === item.ref);
      if (!category) return null;
      return { id: item.id, label: custom || category.name, href: ctx.categoryHref?.(category.slug), onSelect: () => ctx.goCategory(category.slug), image: category.imageUrl ?? null, children: [] };
    }
    if (item.kind === "product") {
      const product = ctx.products?.find((entry) => entry.id === item.ref);
      if (!product) return null;
      const href = ctx.productHref?.(product.id);
      return { id: item.id, label: custom || product.name, href, onSelect: ctx.goProduct ? () => ctx.goProduct!(product.id) : undefined, image: product.images?.[0] ?? null, children: [] };
    }
    if (item.kind === "content") {
      if (!item.ref) return null;
      return { id: item.id, label: custom || contentRefName(item.ref), href: ctx.storeHref?.(`/${item.ref}`), current: ctx.current === item.ref, children: [] };
    }
    if (!item.url || !custom) return null;
    return { id: item.id, label: custom, href: item.url, newTab: item.newTab, children: [] };
  };
  const shown: ShownMenuItem[] = [];
  for (const item of menu) {
    const top = one(item);
    if (!top) continue;
    top.children = (item.children ?? []).map(one).filter((entry): entry is ShownMenuItem => Boolean(entry));
    if (!top.children.length && item.kind === "page" && item.ref === "products" && ctx.categoriesUnderShop !== false && ctx.categories.length) {
      top.children = ctx.categories.map((category) => ({ id: `${item.id}:${category.slug}`, label: category.name, href: ctx.categoryHref?.(category.slug), onSelect: () => ctx.goCategory(category.slug), image: category.imageUrl ?? null, children: [] }));
    }
    shown.push(top);
  }
  return shown;
}

export interface MenuColors {
  ink: string;
  muted: string;
  accent: string;
  accentText: string;
  /** Dropdowns, drawer and sheet. */
  panel: string;
  panelInk: string;
  border: string;
  /** The menu's own colours: a band behind the menu on computers (the words use `ink`, set in the menu's colours). */
  bar?: string;
  /** Set when the menu has its own text colour, so the bar colours its words instead of the header. */
  ownText?: boolean;
}

/** Ordinary clicks switch page in place; Ctrl/⌘/Shift/middle clicks and new-tab links keep the browser's behaviour. */
function follow(item: ShownMenuItem, after?: () => void) {
  return (event: React.MouseEvent<HTMLElement>) => {
    if (item.newTab || !item.onSelect) {
      after?.();
      return;
    }
    if (item.href && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    event.preventDefault();
    after?.();
    item.onSelect();
  };
}

function MenuLink({ item, className, style, onDone, children }: { item: ShownMenuItem; className?: string; style?: React.CSSProperties; onDone?: () => void; children?: React.ReactNode }) {
  return (
    <a
      href={item.href ?? "#"}
      onClick={follow(item, onDone)}
      target={item.newTab ? "_blank" : undefined}
      rel={item.newTab ? "noopener noreferrer" : undefined}
      aria-current={item.current ? "page" : undefined}
      className={className}
      style={{ color: "inherit", cursor: "pointer", textDecoration: "none", ...style }}
    >
      {children ?? item.label}
    </a>
  );
}

function topStyle(style: MenuStyle, colors: MenuColors, current: boolean, open: boolean): { className: string; style: React.CSSProperties } {
  switch (style) {
    case "underline":
      return { className: "smenu-underline relative inline-flex items-center gap-1 px-1 py-2", style: { ["--smenu-line" as string]: colors.accent, ...(current || open ? { ["--smenu-scale" as string]: "1" } : null) } };
    case "pills":
      return { className: "inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 transition-colors", style: current ? { background: colors.ink, color: colors.panel } : open ? { background: `color-mix(in srgb, ${colors.ink} 8%, transparent)` } : {} };
    case "caps":
      return { className: "inline-flex items-center gap-1 px-1 py-2 text-[11.5px] font-semibold uppercase tracking-[0.16em]", style: current ? { color: colors.accent } : {} };
    default:
      return { className: "inline-flex items-center gap-1 px-1 py-2", style: current ? { textDecoration: "underline", textUnderlineOffset: 6 } : {} };
  }
}

/** The menu bar on computers. `className` hides it on phones (each theme has its own breakpoint class). */
export function StoreMenuBar({ items, style, colors, className, font, label = "Main" }: { items: ShownMenuItem[]; style: MenuStyle; colors: MenuColors; className?: string; font?: React.CSSProperties; label?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  // Opened by pointing at it: the click that usually follows shouldn't close it again.
  const hovered = useRef<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const baseId = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const mega = style === "mega";
  const close = () => setOpen(null);
  return (
    <nav
      ref={ref}
      aria-label={label}
      className={className}
      style={{
        alignItems: "center",
        gap: style === "pills" ? 4 : style === "caps" ? 22 : 24,
        ...font,
        ...(colors.ownText ? { color: colors.ink } : null),
        ...(colors.bar ? { background: colors.bar, borderRadius: 999, padding: "4px 14px" } : null),
      }}
    >
      <style>{`.smenu-underline::after{content:"";position:absolute;left:4px;right:4px;bottom:2px;height:2px;border-radius:2px;background:var(--smenu-line);transform:scaleX(var(--smenu-scale,0));transform-origin:left;transition:transform .2s}.smenu-underline:hover::after{transform:scaleX(1)}@media (prefers-reduced-motion:reduce){.smenu-underline::after{transition:none}}`}</style>
      {items.map((item) => {
        const look = topStyle(style, colors, Boolean(item.current), open === item.id);
        if (!item.children.length) return <MenuLink key={item.id} item={item} className={look.className} style={look.style} />;
        const panelId = `${baseId}-${item.id}`;
        const isOpen = open === item.id;
        return (
          <div
            key={item.id}
            className={mega ? "" : "relative"}
            onMouseEnter={(event) => {
              if (window.matchMedia?.("(hover: hover)").matches && event.buttons === 0) {
                hovered.current = item.id;
                setOpen(item.id);
              }
            }}
            onMouseLeave={() => {
              if (window.matchMedia?.("(hover: hover)").matches) {
                hovered.current = null;
                setOpen((value) => (value === item.id ? null : value));
              }
            }}
          >
            <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => {
                const keep = hovered.current === item.id;
                hovered.current = null;
                setOpen(isOpen && !keep ? null : item.id);
              }} className={`${look.className} border-0 bg-transparent`} style={{ color: "inherit", cursor: "pointer", font: "inherit", textTransform: "inherit", letterSpacing: "inherit", ...look.style }}>
              {item.label} <Icon name="chevDown" size={14} />
            </button>
            {isOpen ? (
              mega ? (
                <div id={panelId} className="absolute inset-x-0 top-full z-40 border-b border-t shadow-[0_24px_48px_rgba(0,0,0,.12)]" style={{ background: colors.panel, color: colors.panelInk, borderColor: colors.border }}>
                  <div className="mx-auto grid max-w-[1240px] gap-6 px-8 py-7" style={{ gridTemplateColumns: "minmax(180px,240px) 1fr" }}>
                    <div>
                      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: colors.muted }}>{item.label}</p>
                      {item.href || item.onSelect ? (
                        <MenuLink item={item} onDone={close} className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-semibold underline-offset-4 hover:underline">
                          See all <Icon name="arrow" size={14} />
                        </MenuLink>
                      ) : null}
                    </div>
                    <ul className="m-0 grid list-none gap-3 p-0" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <MenuLink item={child} onDone={close} className="group grid gap-2 text-[14.5px] font-medium">
                            {child.image ? (
                              <span className="block aspect-[4/3] overflow-hidden rounded-[10px]" style={{ background: colors.border }}>
                                <img src={child.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              </span>
                            ) : null}
                            <span className="underline-offset-4 group-hover:underline">{child.label}</span>
                          </MenuLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <ul id={panelId} className="absolute left-1/2 top-full z-40 m-0 mt-1 min-w-[220px] -translate-x-1/2 list-none rounded-[12px] border p-1.5 shadow-xl" style={{ background: colors.panel, color: colors.panelInk, borderColor: colors.border, textTransform: "none", letterSpacing: "normal" }}>
                  {item.href || item.onSelect ? (
                    <li>
                      <MenuLink item={{ ...item, current: false }} onDone={close} className="block rounded-[8px] px-3 py-2 text-[14px] font-semibold hover:bg-black/5">
                        {item.label === MENU_PAGE_LABELS.products ? "All products" : `All of ${item.label}`}
                      </MenuLink>
                    </li>
                  ) : null}
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <MenuLink item={child} onDone={close} className="block rounded-[8px] px-3 py-2 text-[14px] hover:bg-black/5" />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** The ☰ button on phones and the menu it opens. Off-page (a portal), so a blurred sticky header can't clip it. */
export function StoreMenuButton({
  items,
  style,
  colors,
  storeName,
  className,
  font,
  headingFont,
  interactive = true,
  extra,
  brand,
}: {
  items: ShownMenuItem[];
  style: MobileMenuStyle;
  colors: MenuColors;
  storeName: string;
  className?: string;
  font?: React.CSSProperties;
  headingFont?: string;
  /** Builder previews show the button without opening anything. */
  interactive?: boolean;
  /** Links under the menu (track an order, account). */
  extra?: ShownMenuItem[];
  /**
   * The store, for its logo at the top of the menu: shown the way the header shows it (Brand kit "logoDisplay":
   * logo, logo and name, icon…); the name alone when the header shows only the name or there is no logo.
   */
  brand?: { store: { logoUrl?: string | null; brandSettings?: unknown }; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      buttonRef.current?.focus();
    };
  }, [open]);
  if (!items.length && !extra?.length) return null;
  const close = () => setOpen(false);
  const big = style === "fullscreen";
  const panelPosition: React.CSSProperties =
    style === "fullscreen"
      ? { inset: 0 }
      : style === "sheet"
        ? { left: 0, right: 0, bottom: 0, maxHeight: "86dvh", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: "env(safe-area-inset-bottom)" }
        : { top: 0, bottom: 0, left: 0, width: "min(86vw, 360px)" };
  const animation = style === "fullscreen" ? "smenu-fade" : style === "sheet" ? "smenu-rise" : "smenu-slide";
  const row = big ? "flex min-h-[56px] w-full items-center justify-between gap-3 py-2 text-[26px] font-semibold tracking-[-0.01em]" : "flex min-h-[50px] w-full items-center justify-between gap-3 py-2 text-[16.5px] font-medium";

  const panel = open ? (
    <div className="fixed inset-0 z-[90]" role="presentation" style={{ fontFamily: font?.fontFamily }}>
      <style>{`@keyframes smenu-slide{from{transform:translateX(-100%)}to{transform:none}}@keyframes smenu-rise{from{transform:translateY(100%)}to{transform:none}}@keyframes smenu-fade{from{opacity:0}to{opacity:1}}@keyframes smenu-dim{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){.smenu-anim{animation:none!important}}`}</style>
      {big ? null : <button type="button" aria-label="Close menu" tabIndex={-1} onClick={close} className="smenu-anim absolute inset-0 border-0" style={{ background: "rgba(0,0,0,.45)", animation: "smenu-dim .2s ease" }} />}
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="smenu-anim absolute flex flex-col overflow-hidden shadow-2xl" style={{ ...panelPosition, background: colors.panel, color: colors.panelInk, animation: `${animation} .25s ease` }}>
        {style === "sheet" ? <span aria-hidden className="mx-auto mt-2.5 block h-1 w-10 shrink-0 rounded-full" style={{ background: colors.border }} /> : null}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4">
          {brand && storeLogoView(brand.store).image ? (
            // The header shows a logo: so does the menu, in the version that reads on the panel's colour (StoreLogo).
            <p id={titleId} className="m-0 min-w-0" style={{ fontFamily: headingFont }}>
              <StoreBrandMark store={brand.store} name={brand.name || storeName} display={{ ...readLogoDisplay(brand.store.brandSettings), size: "small" }} background={colors.panel} nameClassName="text-[15px] font-semibold" />
            </p>
          ) : (
            <p id={titleId} className="m-0 truncate text-[15px] font-semibold" style={{ fontFamily: headingFont }}>{style === "sheet" ? "Menu" : storeName}</p>
          )}
          <button ref={closeRef} type="button" onClick={close} aria-label="Close menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border" style={{ borderColor: colors.border, background: "transparent", color: "inherit", cursor: "pointer" }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <nav aria-label="Menu" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          <ul className="m-0 list-none p-0">
            {items.map((item) => {
              const isOpen = expanded === item.id;
              return (
                <li key={item.id} className="border-b" style={{ borderColor: colors.border }}>
                  {item.children.length ? (
                    <>
                      <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : item.id)} className={`${row} border-0 bg-transparent text-left`} style={{ color: "inherit", cursor: "pointer", fontFamily: big ? headingFont : undefined }}>
                        <span>{item.label}</span>
                        <span className="transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : undefined }}><Icon name="chevDown" size={big ? 22 : 18} /></span>
                      </button>
                      {isOpen ? (
                        <ul className="m-0 list-none pb-3 pl-3 pt-0">
                          {item.href || item.onSelect ? (
                            <li><MenuLink item={item} onDone={close} className="flex min-h-[44px] items-center text-[15px] font-semibold">{item.label === MENU_PAGE_LABELS.products ? "All products" : `All of ${item.label}`}</MenuLink></li>
                          ) : null}
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <MenuLink item={child} onDone={close} className="flex min-h-[44px] items-center gap-3 text-[15px]" style={{ color: colors.muted }}>
                                {child.image && style === "sheet" ? <img src={child.image} alt="" className="h-9 w-9 shrink-0 rounded-[8px] object-cover" /> : null}
                                <span>{child.label}</span>
                              </MenuLink>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <MenuLink item={item} onDone={close} className={row} style={{ fontFamily: big ? headingFont : undefined, ...(item.current ? { color: colors.accent } : null) }}>
                      <span>{item.label}</span>
                      {big ? null : <Icon name="chevRight" size={16} />}
                    </MenuLink>
                  )}
                </li>
              );
            })}
          </ul>
          {extra?.length ? (
            <ul className="m-0 mt-4 grid list-none gap-1 p-0">
              {extra.map((item) => (
                <li key={item.id}>
                  <MenuLink item={item} onDone={close} className="flex min-h-[44px] items-center text-[14.5px]" style={{ color: colors.muted }} />
                </li>
              ))}
            </ul>
          ) : null}
        </nav>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={interactive ? () => setOpen(true) : undefined}
        className={className}
        style={{ display: undefined, placeItems: "center", width: 40, height: 40, borderRadius: 999, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}
      >
        <Icon name="menu" size={21} />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
