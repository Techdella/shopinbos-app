"use client";

import { useEffect, useId, useRef, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import type { StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import type { BoutiqueLook } from "./look";

export interface ChromeStore {
  name: string;
  logoUrl?: string | null;
  city?: string | null;
  country?: string | null;
}

export type ChromeLink = { key: string; label: string; onSelect: () => void; current?: boolean };
/** A plain link (legal pages live on their own URLs, not ?page=). */
export type ChromeHref = { key: string; label: string; href: string };

export function AnnouncementBar({ text, look }: { text: string | null; look: BoutiqueLook }) {
  if (!text) return null;
  return (
    <div className="px-4 py-2.5 text-center font-medium" style={look.announcement} role="region" aria-label="Store announcement">
      {text}
    </div>
  );
}

function Logo({ store, logoText, look, onHome, centred }: { store: ChromeStore; logoText: string; look: BoutiqueLook; onHome: () => void; centred?: boolean }) {
  return (
    <button type="button" onClick={onHome} className={`flex min-w-0 items-center gap-2.5 border-0 bg-transparent p-0 ${centred ? "justify-center" : ""}`} style={{ color: look.tokens.ink, cursor: "pointer" }} aria-label={`${store.name} home`}>
      {store.logoUrl ? <img src={store.logoUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-[8px] object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
      <span className="truncate text-[22px] leading-none @3xl:text-[24px]" style={{ fontFamily: look.logoFont, ...look.logoStyle }}>
        {logoText}
      </span>
    </button>
  );
}

function ShopMenu({ look, categories, onShopAll, onCategory }: { look: BoutiqueLook; categories: Array<{ slug: string; name: string }>; onShopAll: () => void; onCategory: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!categories.length) {
    return (
      <button type="button" onClick={onShopAll} className="border-0 bg-transparent px-1 py-2" style={{ color: "inherit", cursor: "pointer", ...look.navStyle }}>
        Shop
      </button>
    );
  }
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1 border-0 bg-transparent px-1 py-2" style={{ color: "inherit", cursor: "pointer", ...look.navStyle }}>
        Shop <Icon name="chevDown" size={14} />
      </button>
      {open ? (
        <ul id={menuId} className="absolute left-1/2 top-full z-40 mt-1 min-w-[200px] -translate-x-1/2 rounded-[12px] border p-1.5 shadow-xl" style={{ background: look.dark ? look.raised : "#fff", borderColor: look.tokens.border }}>
          <li>
            <button type="button" onClick={pick(onShopAll)} className="w-full rounded-[8px] px-3 py-2 text-left text-[14px] font-semibold" style={{ color: look.tokens.ink }}>
              All products
            </button>
          </li>
          {categories.map((category) => (
            <li key={category.slug}>
              <button type="button" onClick={pick(() => onCategory(category.slug))} className="w-full rounded-[8px] px-3 py-2 text-left text-[14px]" style={{ color: look.tokens.ink }}>
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function BoutiqueHeader({
  store,
  logoText,
  look,
  links,
  categories,
  onHome,
  onShopAll,
  onCategory,
  onSearch,
  onWishlist,
  onBag,
  cartCount,
  wishlistCount,
  cartLabel,
  centred,
}: {
  store: ChromeStore;
  logoText: string;
  look: BoutiqueLook;
  links: ChromeLink[];
  categories: Array<{ slug: string; name: string }>;
  onHome: () => void;
  onShopAll: () => void;
  onCategory: (slug: string) => void;
  onSearch?: () => void;
  onWishlist?: () => void;
  onBag?: () => void;
  cartCount: number;
  wishlistCount: number;
  cartLabel: string;
  centred: boolean;
}) {
  const t = look.tokens;
  const nav = (
    <nav aria-label="Main" className="bq-nav-desktop items-center gap-6">
      {links.map((link) =>
        link.key === "products" ? (
          <ShopMenu key={link.key} look={look} categories={categories} onShopAll={onShopAll} onCategory={onCategory} />
        ) : (
          <button
            key={link.key}
            type="button"
            onClick={link.onSelect}
            aria-current={link.current ? "page" : undefined}
            className="border-0 bg-transparent px-1 py-2"
            style={{ color: "inherit", cursor: "pointer", textDecoration: link.current ? "underline" : "none", textUnderlineOffset: 6, ...look.navStyle }}
          >
            {link.label}
          </button>
        ),
      )}
    </nav>
  );

  const tools = (
    <div className="flex items-center justify-end gap-1">
      {onSearch ? (
        <button type="button" className="bq-icon-btn" onClick={onSearch} aria-label="Search products" aria-haspopup="dialog">
          <Icon name="search" size={19} />
        </button>
      ) : null}
      {onWishlist ? (
        <button type="button" className="bq-icon-btn bq-only-wide" onClick={onWishlist} aria-label={`Wishlist, ${wishlistCount} saved`} aria-haspopup="dialog">
          <Icon name="heart" size={19} />
          {wishlistCount ? <span className="bq-count" aria-hidden>{wishlistCount}</span> : null}
        </button>
      ) : null}
      {onBag ? (
        <button
          type="button"
          onClick={onBag}
          className="ml-1 inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-semibold"
          style={{ borderColor: t.border, color: t.ink, background: look.dark ? "transparent" : "#fff", cursor: "pointer" }}
          aria-label={`${cartLabel}, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
        >
          <span className="bq-only-wide" aria-hidden>{cartLabel}</span>
          <Icon name="bag" size={17} className="bq-only-narrow" aria-hidden />
          <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold" style={{ background: look.countBg, color: look.onAccent }} aria-hidden>
            {cartCount}
          </span>
        </button>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b" style={{ background: look.headerBg, borderColor: t.border, backdropFilter: "blur(10px)", color: t.ink }}>
      {centred ? (
        <div className="bq-wrap grid h-[68px] grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0">{nav}</div>
          <Logo store={store} logoText={logoText} look={look} onHome={onHome} centred />
          {tools}
        </div>
      ) : (
        <div className="bq-wrap flex h-[68px] items-center justify-between gap-4">
          <Logo store={store} logoText={logoText} look={look} onHome={onHome} />
          {nav}
          {tools}
        </div>
      )}
    </header>
  );
}

export function BoutiqueFooter({
  store,
  look,
  shopper,
  links,
  summary,
  onTrackOrder,
  legalLinks = [],
}: {
  store: ChromeStore;
  look: BoutiqueLook;
  shopper: StorefrontShopperInfo;
  links: ChromeLink[];
  summary?: string;
  onTrackOrder?: () => void;
  /** The store's published legal pages, shown in the bottom row. */
  legalLinks?: ChromeHref[];
}) {
  const t = look.tokens;
  const place = [store.city, store.country].filter(Boolean).join(", ");
  const whatsapp = shopper.whatsappNumber ? `WhatsApp +${shopper.whatsappNumber}` : null;
  const line = [place, whatsapp].filter(Boolean).join(" · ");
  return (
    <footer className="border-t" style={{ borderColor: t.border, background: look.footerBg, color: t.ink }}>
      <div className="bq-wrap grid gap-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-[420px]">
            <div className="text-[22px]" style={{ fontFamily: look.logoFont, ...look.logoStyle }}>{store.name}</div>
            {line ? <p className="mt-2 text-[13.5px]" style={{ color: t.muted }}>{shopper.whatsappNumber ? <a href={`https://wa.me/${shopper.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{line}</a> : line}</p> : null}
            {summary ? <p className="mt-2 text-[13.5px] leading-6" style={{ color: t.muted }}>{summary}</p> : null}
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              {links.map((link) => (
                <li key={link.key}>
                  <button type="button" onClick={link.onSelect} className="border-0 bg-transparent p-0 underline-offset-4 hover:underline" style={{ color: t.ink, cursor: "pointer" }}>
                    {link.label}
                  </button>
                </li>
              ))}
              {onTrackOrder ? (
                <li>
                  <button type="button" onClick={onTrackOrder} className="border-0 bg-transparent p-0 underline-offset-4 hover:underline" style={{ color: t.ink, cursor: "pointer" }}>
                    Track an order
                  </button>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-[12.5px]" style={{ borderColor: t.border, color: t.muted }}>
          <span>© {new Date().getFullYear()} {store.name}</span>
          {legalLinks.length ? (
            <nav aria-label="Policies">
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {legalLinks.map((link) => (
                  <li key={link.key}>
                    <a href={link.href} className="inline-flex min-h-[32px] items-center underline-offset-4 hover:underline" style={{ color: t.muted }}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {shopper.paymentLabels.length ? <span>{shopper.paymentLabels.join(" · ")}</span> : null}
        </div>
      </div>
    </footer>
  );
}

export function SectionTitle({ look, children, id, action }: { look: BoutiqueLook; children: React.ReactNode; id?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 id={id} className="bq-h text-[26px] @3xl:text-[30px]" style={look.headingStyle}>
        {children}
      </h2>
      {action}
    </div>
  );
}
