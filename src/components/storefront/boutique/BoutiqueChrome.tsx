"use client";

import type React from "react";
import { Icon } from "@/components/ui/Icon";
import type { StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { StoreFooterBadges, useStoreFooterBadges } from "@/components/storefront/shopper/StoreFooterBadges";
import { StoreLogo } from "@/components/storefront/StoreLogo";
import type { BoutiqueLook } from "./look";
import { StoreBrandMark } from "../StoreBrandMark";
import { brandTagline, footerSummaryForShoppers, isPlaceholderCopy, shopperCopy } from "@shared/placeholder-copy";
import { englishText, type EditorText } from "../editor-text";
import { StoreMenuBar, StoreMenuButton, type MenuColors, type ShownMenuItem } from "../StoreMenu";
import type { MenuStyle, MobileMenuStyle } from "@/lib/storefront/menu";

export interface ChromeStore {
  name: string;
  logoUrl?: string | null;
  city?: string | null;
  country?: string | null;
  /** The footer's line about the store falls back to this when the seller hasn't written one. */
  description?: string | null;
  /** For the logo icon, how the header shows the brand and the dark-background logo (Brand kit). */
  brandSettings?: unknown;
}

/** A store page (lives at its own address: /about, /shop). `href` makes it a real link on the live store: new tab, sharing, crawlers. */
export type ChromeLink = { key: string; label: string; onSelect?: () => void; current?: boolean; href?: string; newTab?: boolean };

/** Menu items (the seller's footer links) as footer links. Sub-items are not shown in the footer. */
export function chromeLinksFromMenu(items: ShownMenuItem[]): ChromeLink[] {
  return items.map((item) => ({ key: item.id, label: item.label, onSelect: item.onSelect, current: item.current, href: item.href, newTab: item.newTab }));
}

/** Ordinary clicks switch page in place; Ctrl/⌘/Shift/middle clicks keep the browser's own link behaviour. */
function pageLinkClick(link: ChromeLink) {
  return (event: React.MouseEvent<HTMLElement>) => {
    // Own links (no page to switch to) and new-tab links keep the browser's behaviour.
    if (!link.onSelect || link.newTab) return;
    if (link.href && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    event.preventDefault();
    link.onSelect();
  };
}
/** A plain link to another route (legal pages, policies). */
export type ChromeHref = { key: string; label: string; href: string };

/** The bar on the live store. Seller guidance saved by older templates never shows (shopperCopy). */
export function AnnouncementBar({ text: raw, look }: { text: string | null; look: BoutiqueLook }) {
  const text = shopperCopy(raw);
  if (!text) return null;
  return (
    <div className="px-4 py-2.5 text-center font-medium" style={look.announcement} role="region" aria-label="Store announcement">
      {text}
    </div>
  );
}

/** The colour behind the header: the ink bar for "Bold", else the theme's header colour. */
export function headerBackground(look: BoutiqueLook, bold: boolean) {
  return bold ? look.tokens.ink : look.headerBg;
}

function Logo({ store, logoText, look, onHome, centred, bold }: { store: ChromeStore; logoText: string; look: BoutiqueLook; onHome: () => void; centred?: boolean; bold?: boolean }) {
  return (
    <button type="button" onClick={onHome} className={`flex min-w-0 items-center gap-2.5 border-0 bg-transparent p-0 ${centred ? "justify-center" : ""}`} style={{ color: "inherit", cursor: "pointer" }} aria-label={`${store.name} home`}>
      <StoreBrandMark
        store={store}
        background={headerBackground(look, Boolean(bold))}
        under={look.tokens.paperBg}
        dark={bold || look.dark}
        name={logoText}
        nameClassName={bold ? "text-[24px] leading-none @3xl:text-[28px]" : "text-[22px] leading-none @3xl:text-[24px]"}
        nameStyle={{ fontFamily: look.logoFont, ...look.logoStyle, ...(bold ? { fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.02em", fontStyle: "normal" } : null) }}
      />
    </button>
  );
}

export function BoutiqueHeader({
  store,
  logoText,
  look,
  menu,
  menuStyle = "classic",
  mobileMenu = "drawer",
  mobileItems,
  mobileExtra,
  interactive = true,
  onHome,
  onSearch,
  onWishlist,
  onBag,
  cartCount,
  wishlistCount,
  cartLabel,
  centred,
  bold = false,
}: {
  store: ChromeStore;
  logoText: string;
  look: BoutiqueLook;
  /** The main menu, resolved (StoreMenu resolveMenu). */
  menu: ShownMenuItem[];
  menuStyle?: MenuStyle;
  mobileMenu?: MobileMenuStyle;
  /** The phone menu's own items, resolved; absent: the phone shows the main menu. */
  mobileItems?: ShownMenuItem[];
  /** Links under the phone menu (track an order). */
  mobileExtra?: ShownMenuItem[];
  /** Builder previews: the ☰ button shows but doesn't open. */
  interactive?: boolean;
  onHome: () => void;
  onSearch?: () => void;
  onWishlist?: () => void;
  onBag?: () => void;
  cartCount: number;
  wishlistCount: number;
  cartLabel: string;
  centred: boolean;
  /** "Bold" header: an inverted bar (ink background) with a heavy uppercase shop name. */
  bold?: boolean;
}) {
  const t = look.tokens;
  const menuColors: MenuColors = { ink: bold ? t.paperBg : t.ink, muted: t.muted, accent: t.accent, accentText: look.onAccent, panel: look.dark ? look.raised : "#fff", panelInk: t.ink, border: t.border };
  const nav = <StoreMenuBar items={menu} style={menuStyle} colors={menuColors} className="bq-nav-desktop" font={look.navStyle} />;
  const burger = (
    <StoreMenuButton
      items={mobileItems ?? menu}
      extra={mobileExtra}
      style={mobileMenu}
      colors={{ ...menuColors, ink: t.ink }}
      storeName={store.name}
      brand={{ store, name: logoText }}
      className="bq-only-narrow bq-burger"
      font={{ fontFamily: "inherit" }}
      headingFont={look.logoFont}
      interactive={interactive}
    />
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
          style={bold ? { borderColor: t.paperBg, color: t.ink, background: t.paperBg, cursor: "pointer" } : { borderColor: t.border, color: t.ink, background: look.dark ? "transparent" : "#fff", cursor: "pointer" }}
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
    <header className="sticky top-0 z-30 border-b" style={bold ? { background: t.ink, borderColor: t.ink, color: t.paperBg } : { background: look.headerBg, borderColor: t.border, backdropFilter: "blur(10px)", color: t.ink }}>
      {centred ? (
        <div className="bq-wrap grid min-h-[68px] py-1.5 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 items-center">{burger}{nav}</div>
          <Logo store={store} logoText={logoText} look={look} onHome={onHome} centred bold={bold} />
          {tools}
        </div>
      ) : (
        <div className="bq-wrap flex min-h-[68px] py-1.5 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1">
            {burger}
            <Logo store={store} logoText={logoText} look={look} onHome={onHome} bold={bold} />
          </div>
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
  showLogo = true,
  editor = false,
  say = englishText,
}: {
  store: ChromeStore;
  look: BoutiqueLook;
  shopper: StorefrontShopperInfo;
  links: ChromeLink[];
  summary?: string;
  onTrackOrder?: () => void;
  /** The store's published legal pages, shown in the bottom row. */
  legalLinks?: ChromeHref[];
  /** The footer's "Show logo" setting: the logo (its dark-background version on a dark footer) in place of the name. */
  showLogo?: boolean;
  /** In the builder: an empty or placeholder summary shows as a dashed "edit me" hint instead. */
  editor?: boolean;
  /** The builder's words for that hint (English when absent). */
  say?: EditorText;
}) {
  const t = look.tokens;
  const shown = editor ? (summary ?? "").trim() : footerSummaryForShoppers(summary, { name: store.name, description: store.description, tagline: brandTagline(store.brandSettings) });
  const summaryHint = editor && (!shown || isPlaceholderCopy(shown, store.name));
  const place = [store.city, store.country].filter(Boolean).join(", ");
  const whatsapp = shopper.whatsappNumber ? `WhatsApp +${shopper.whatsappNumber}` : null;
  const line = [place, whatsapp].filter(Boolean).join(" · ");
  const storeBadges = useStoreFooterBadges();
  return (
    <footer className="bq-footer border-t" style={{ borderColor: t.border, background: look.footerBg, color: t.ink }}>
      <div className="bq-wrap grid gap-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-[420px]">
            {showLogo ? (
              <StoreLogo store={store} background={look.footerBg} under={t.paperBg} dark={look.dark} alt={store.name} className="block h-14 w-auto max-w-[220px] rounded-[8px]" fallback={<div className="text-[22px]" style={{ fontFamily: look.logoFont, ...look.logoStyle }}>{store.name}</div>} />
            ) : (
              <div className="text-[22px]" style={{ fontFamily: look.logoFont, ...look.logoStyle }}>{store.name}</div>
            )}
            {line ? <p className="mt-2 text-[13.5px]" style={{ color: t.muted }}>{shopper.whatsappNumber ? <a href={`https://wa.me/${shopper.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{line}</a> : line}</p> : null}
            {summaryHint ? (
              <p className="mt-2 rounded-[8px] border border-dashed px-2.5 py-1.5 text-[12.5px] leading-5" style={{ borderColor: t.border, color: t.muted }}>
                {shown ? <><span style={{ opacity: 0.6 }}>{shown}</span><br />{say("Shoppers won't see this placeholder. Write your own line in the footer settings.")}</> : say("Add a line about your store in the footer settings. Until then shoppers see your store description.")}
              </p>
            ) : shown ? <p className="mt-2 text-[13.5px] leading-6" style={{ color: t.muted }}>{shown}</p> : null}
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              {links.map((link) => (
                <li key={link.key}>
                  <a href={link.href ?? "#"} onClick={pageLinkClick(link)} target={link.newTab ? "_blank" : undefined} rel={link.newTab ? "noopener noreferrer" : undefined} className="border-0 bg-transparent p-0 underline-offset-4 hover:underline" style={{ color: t.ink, cursor: "pointer" }}>
                    {link.label}
                  </a>
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
          {/* On the storefront: the seller's payment logos and "Built with Shopinbos"; in the builder, the plain labels. */}
          {storeBadges ? null : shopper.paymentLabels.length ? <span>{shopper.paymentLabels.join(" · ")}</span> : null}
        </div>
        <StoreFooterBadges muted={t.muted} border={t.border} ink={t.ink} className="-mt-2" />
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
