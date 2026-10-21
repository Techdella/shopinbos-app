"use client";

import { InlineTextEditor, inlineTargetFor, type InlineEdit } from "./InlineTextEditor";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { findStorefrontPage, storefrontPageHref } from "@shared/storefront-pages";
import { legalLinks, legalPagePath } from "@/lib/legal/pages";
import type { BoutiqueThemeId, StoreEditorSnapshot, TemplateSectionNode } from "@/lib/store-templates";
import {
  countdownParts,
  formatStoreMoney,
  lagosDayLabel,
  paydayLastDay,
  paydayWindow,
  readPaydaySettings,
  readShopperInfo,
  whatsappLink,
  type PaydaySettings,
} from "@/lib/storefront/shopper-info";
import { bestSellers, productCategories, relatedProducts, searchProducts, soldOutLabel, type ShopperProduct } from "../shopper/catalog";
import { ShopperBottomNav, type ShopperSheet } from "../shopper/ShopperBottomNav";
import { resolveMenu, type MenuContext } from "../StoreMenu";
import { menuStyleOf, mobileMenuStyleOf, readMenu } from "@/lib/storefront/menu";
import { readFooterMenu, readMobileMenu } from "@/lib/storefront/store-navigation";
import { AnnouncementBar, BoutiqueFooter, chromeLinksFromMenu, BoutiqueHeader, marketHeaderOf, SectionTitle, type ChromeHref, type ChromeLink } from "./BoutiqueChrome";
import { BoutiqueProductView, type BoutiqueProductDetail } from "./BoutiqueProductView";
import { pdpSettingsForSnapshot } from "./pdp/pdp-logic";
import { samplePdpProduct } from "./pdp/sample-product";
import { BOUTIQUE_FONT_CLASS, BQ_SERIF } from "./fonts";
import { BOUTIQUE_CSS, boutiqueLook, lookVars, navColors, pdpLayout, type BoutiqueLook } from "./look";
import { ProductTile } from "./ProductTile";
import { ShopBrowser } from "../shopper/ShopBrowser";
import { readShopLayoutOptions, withGroup, type ShopSort } from "../shopper/shop-browse";
import { useShopQuery } from "../shopper/useShopQuery";
import { GameSection } from "../gamification/GameSection";
import { HeroSlider, slideAlign } from "../HeroSlider";
import { readHeroSlides, readProductLimit, readSlideLink, readSlideTiming, type HeroSlide, type SlideLink } from "@/lib/store-templates/section-content";
import { themeStockImages } from "@/lib/store-templates/demo-photos";
import { isShopGridSection, readOptionalProductLimit, readProductCardOptions, readShopGridOptions } from "@/lib/store-templates/section-content";
import type { GameSectionKind } from "@/lib/gamification/logic";
import { isStoreBlock, StoreBlock, type BlockContext } from "./blocks/registry";
import { filterFaq } from "./blocks/block-logic";
import { faqAnswer, faqSectionStyle } from "./faq/faq-logic";
import { FaqList } from "./faq/FaqList";
import { LAYOUT_ROW_KIND, drawnSections, groupHiddenRows, isHiddenLayoutRow } from "./blocks/layout-logic";
import { HiddenLayoutRowDrops, LayoutRow, type LayoutRowEditing } from "./blocks/LayoutRow";
import { shopperCopy } from "@shared/placeholder-copy";
import { englishText, type EditorText } from "../editor-text";
import { CheckoutPreview } from "../checkout/CheckoutPreview";
import { checkoutNavLinks, readCheckoutPageSettings } from "../checkout/checkout-layout";
import { checkoutThemeFromLook } from "../checkout/checkout-theme";

export interface BoutiqueStore {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  city?: string | null;
  country?: string | null;
  currency: string;
  storeProducts: ShopperProduct[];
  shopper?: unknown;
  /** Public brand settings (legal page links for the footer). */
  brandSettings?: unknown;
}

export interface BoutiqueStorefrontProps {
  themeId: BoutiqueThemeId;
  store: BoutiqueStore;
  snapshot: StoreEditorSnapshot;
  storeBasePath?: string;
  mode: "live" | "editor";
  device: "desktop" | "mobile";
  currentPage: string;
  onNavigate: (page: string) => void;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string | null) => void;
  /** Builder only: click a heading, paragraph or label to type over it (InlineTextEditor). */
  onUpdateSectionCopy?: (sectionId: string, key: string, value: string) => void;
  cartCount: number;
  onOpenCart?: () => void;
  onAddToCart?: (productId: string) => void;
  visitorKey?: string;
  wishlistProductIds: string[];
  onToggleWishlist?: (productId: string) => void;
  /** ?q= from the URL opens search with this query. */
  initialQuery?: string;
  /** Theme gallery previews: sample products, no editor outlines or "add this" hints. */
  demo?: boolean;
  /** Builder only: picking and adding elements inside rows and columns (layout-row sections). */
  selectedElementId?: string | null;
  onSelectElement?: LayoutRowEditing["onSelectElement"];
  onAddToColumn?: LayoutRowEditing["onAddToColumn"];
  onMoveElement?: LayoutRowEditing["onMoveElement"];
  /** The builder's words for the hints drawn on its canvas (English when absent; never passed on the live store). */
  editorText?: EditorText;
}

const PAGE_LABELS: Record<string, string> = { home: "Home", products: "Shop", about: "About", contact: "Contact", faq: "FAQ", wishlist: "Wishlist" };

function copyOf(section: TemplateSectionNode | undefined): Record<string, unknown> {
  return (section?.blocks.find((entry) => entry.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function itemImages(section: TemplateSectionNode) {
  return (section.items ?? [])
    .map((item) => text(item.imageUrl) || text(item.resolvedSrc) || text(item.originalSrc))
    .filter(Boolean);
}

function normalizePage(page: string) {
  if (page === "shop" || page === "categories") return "products";
  return page;
}

/** Faq answers left blank by the seller come from their own delivery and payment settings (faq/faq-logic.ts). */
export { faqAnswer };

/** Builder only: when payday falls and how long the sale runs, as one whole sentence per case so it translates. */
function paydayNote(config: PaydaySettings, say: EditorText) {
  const vars = { day: config.day, days: config.days };
  if (config.rule === "last-friday") {
    return config.ends === "sunday"
      ? say("Payday: last Friday of the month; runs until Sunday.")
      : say("Payday: last Friday of the month; runs {days, plural, one {# day} other {# days}}.", vars);
  }
  if (config.rule === "last-weekday") {
    return config.ends === "sunday"
      ? say("Payday: last weekday of the month; runs until Sunday.")
      : say("Payday: last weekday of the month; runs {days, plural, one {# day} other {# days}}.", vars);
  }
  if (config.weekendToFriday) {
    return config.ends === "sunday"
      ? say("Payday: the {day} (Friday before if it's a weekend); runs until Sunday.", vars)
      : say("Payday: the {day} (Friday before if it's a weekend); runs {days, plural, one {# day} other {# days}}.", vars);
  }
  return config.ends === "sunday"
    ? say("Payday: the {day}; runs until Sunday.", vars)
    : say("Payday: the {day}; runs {days, plural, one {# day} other {# days}}.", vars);
}

function Countdown({ settings, look, copy, onShop, editor, say }: { settings: unknown; look: BoutiqueLook; copy: Record<string, unknown>; onShop: () => void; editor: boolean; say: EditorText }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const config = readPaydaySettings(settings);
  const window_ = now ? paydayWindow(now, config) : null;
  const target = window_ ? (window_.phase === "live" ? window_.end : window_.start) : null;
  const parts = now && target ? countdownParts(target, now) : null;
  const discount = text(copy.discountLabel);
  const custom = text(copy.title);
  const status = window_
    ? window_.phase === "live"
      ? `${discount ? `${discount} ends` : "Ends"} ${lagosDayLabel(paydayLastDay(window_), "weekday")}`
      : `Starts ${lagosDayLabel(window_.start, "short")}`
    : "Payday edit";
  const heading = custom || status;
  const t = look.tokens;
  const units: Array<[string, number | null]> = [
    ["Days", parts?.days ?? null],
    ["Hours", parts?.hours ?? null],
    ["Min", parts?.minutes ?? null],
    ["Sec", parts?.seconds ?? null],
  ];
  const spoken = parts ? `${window_?.phase === "live" ? "Ends" : "Starts"} in ${parts.days} days ${parts.hours} hours ${parts.minutes} minutes` : "";
  return (
    <section aria-label="Payday countdown" style={{ background: "#000", color: "#fff" }}>
      <div className="bq-wrap flex flex-wrap items-center justify-between gap-5 py-5">
        <div>
          <p className="text-[11.5px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.22em" }}>{text(copy.eyebrow) || "Payday edit"}</p>
          <h2 className="bq-h mt-1 text-[22px] @3xl:text-[26px]" style={look.headingStyle}>{heading}</h2>
          {custom ? <p className="mt-1 text-[13px] opacity-80">{status}</p> : null}
          {text(copy.body) ? <p className="mt-1 text-[13px] opacity-80">{text(copy.body)}</p> : null}
          {editor ? <p className="mt-1 text-[12px] opacity-60">{paydayNote(config, say)}</p> : null}
        </div>
        <div className="flex gap-2.5" role="timer" aria-label={spoken || "Countdown"}>
          {units.map(([label, value]) => (
            <div key={label} className="text-center" aria-hidden>
              <div className="grid h-12 min-w-12 place-items-center rounded-[8px] border px-2 text-[24px] font-semibold tabular-nums" style={{ borderColor: "#3A3A3A", color: t.accent }}>
                {value === null ? "--" : String(value).padStart(2, "0")}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] opacity-70">{label}</div>
            </div>
          ))}
        </div>
        <button type="button" className="bq-btn" style={{ ...look.primaryButton, minHeight: 42, textTransform: "uppercase", fontSize: 13 }} onClick={onShop}>
          {text(copy.primaryCta) || "Shop the edit"}
        </button>
      </div>
    </section>
  );
}

/** The sale-window countdown inside "deal" product sections: days, hours, minutes and seconds in square boxes. */
function DealTimer({ settings, look, editor, say }: { settings: unknown; look: BoutiqueLook; editor: boolean; say: EditorText }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const config = readPaydaySettings(settings);
  const window_ = now ? paydayWindow(now, config) : null;
  const target = window_ ? (window_.phase === "live" ? window_.end : window_.start) : null;
  const parts = now && target ? countdownParts(target, now) : null;
  const status = window_ ? (window_.phase === "live" ? `Ends ${lagosDayLabel(paydayLastDay(window_), "weekday")}` : `Starts ${lagosDayLabel(window_.start, "short")}`) : "";
  const t = look.tokens;
  const units: Array<[string, number | null]> = [["Days", parts?.days ?? null], ["Hours", parts?.hours ?? null], ["Min", parts?.minutes ?? null], ["Sec", parts?.seconds ?? null]];
  return (
    <div className="mt-1">
      <div className="flex gap-2.5" role="timer" aria-label={parts ? `${window_?.phase === "live" ? "Ends" : "Starts"} in ${parts.days} days ${parts.hours} hours` : "Countdown"}>
        {units.map(([label, value]) => (
          <div key={label} className="text-center" aria-hidden>
            <div className="grid h-14 min-w-14 place-items-center border-2 px-2 text-[24px] font-semibold tabular-nums" style={{ borderColor: t.ink, borderRadius: Math.min(look.cardRadius, 8) }}>{value === null ? "--" : String(value).padStart(2, "0")}</div>
            <div className="mt-1 text-[10.5px] uppercase tracking-[0.14em]" style={{ color: t.muted }}>{label}</div>
          </div>
        ))}
      </div>
      {status ? <p className="m-0 mt-2 text-[13px]" style={{ color: t.muted }}>{status}</p> : null}
      {editor ? <p className="m-0 mt-1 text-[12px]" style={{ color: t.muted, opacity: 0.8 }}>{paydayNote(config, say)}</p> : null}
    </div>
  );
}

export function BoutiqueStorefront(props: BoutiqueStorefrontProps) {
  const { themeId, store, snapshot, mode } = props;
  const live = mode === "live";
  // Builder-only hints on the canvas: the builder's words, else (and on the live store, which never shows them) English.
  const say: EditorText = !live && !props.demo && props.editorText ? props.editorText : englishText;
  const look = useMemo(() => boutiqueLook(themeId, snapshot.themeTokens), [themeId, snapshot.themeTokens]);
  const t = look.tokens;
  const shopper = useMemo(() => readShopperInfo(store.shopper), [store.shopper]);
  const products = store.storeProducts;
  const basePath = props.storeBasePath ?? "";
  const [sheet, setSheet] = useState<ShopperSheet>(live && props.initialQuery ? "search" : null);
  const [inline, setInline] = useState<(InlineEdit & { sectionId: string; container: HTMLElement }) | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [faqQuery, setFaqQuery] = useState<Record<string, string>>({});
  // Category tabs on "category-tabs" product sections (Gèlè): the picked category slug per section ("" is all).
  const [railTab, setRailTab] = useState<Record<string, string>>({});
  // Ìtura's banner: which picture the arrows have moved to.
  const [heroIndex, setHeroIndex] = useState(0);
  const [form, setForm] = useState<{ newsletter: string; name: string; email: string; phone: string; message: string }>({ newsletter: "", name: "", email: "", phone: "", message: "" });
  const [formStatus, setFormStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const railRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Shop grids with "Products shown at first": how many each one shows now (Show more adds a page). */
  const [shopShown, setShopShown] = useState<Record<string, number>>({});
  const uid = useId();

  const current = normalizePage(props.currentPage);
  // The shop's filters. On a live store they live in the address (/shop?category=bags&sort=price-low), so the
  // product page's category links, shared links and Back all land on the same filtered shop.
  const { query: filter, update: setFilter } = useShopQuery({ live, onShopPage: current === "products" });
  const page = findStorefrontPage(snapshot.pages, current) ?? snapshot.pages.find((entry) => entry.pageType === "home") ?? snapshot.pages[0];
  // Builder: the checkout page is previewed as the real checkout, which has its own slim header (CheckoutPreview), so
  // the store's announcement bar, header and footer aren't drawn around it (the live checkout doesn't show them).
  const checkoutPreview = !live && page?.pageType === "checkout";
  // Builder with drag and drop: hidden rows / columns sections stay in place as drop strips (drawn only mid-drag).
  const hiddenRowDrops = !live && !props.demo && Boolean(props.onMoveElement);
  const sections = drawnSections(page?.sections ?? [], hiddenRowDrops).filter((entry) => !(checkoutPreview && ["announcement-bar", "header", "footer"].includes(entry.kind)));
  const announcementSection = sections.find((entry) => entry.kind === "announcement-bar");
  const headerSection = sections.find((entry) => entry.kind === "header");
  const footerSection = [...sections].reverse().find((entry) => entry.kind === "footer");
  const content = sections.filter((entry) => !["announcement-bar", "header", "footer"].includes(entry.kind));
  const shownContent = content.filter((entry) => !isHiddenLayoutRow(entry));
  const headerCopy = copyOf(headerSection);
  const headerLayout = text(headerSection?.settings?.layout);
  const pageTypes = new Set(snapshot.pages.map((entry) => entry.pageType as string));
  const categories = useMemo(() => productCategories(products), [products]);
  const stockImages = useMemo(() => themeStockImages(themeId), [themeId]);
  const wished = props.wishlistProductIds;

  const productHref = (id: string) => (live ? getPublicStorefrontPath(basePath, `/product/${id}`) : undefined);
  const openProduct = (id: string) => {
    setSelectedProductId(id);
    props.onNavigate("product");
  };
  const toggleWish = live ? props.onToggleWishlist : undefined;

  /** A product card link: a real page on the live store, the product preview in the builder (no default button look). */
  function linkToProduct(product: ShopperProduct, className: string, children: React.ReactNode, style?: React.CSSProperties) {
    const href = productHref(product.id);
    return href ? (
      <Link key={product.id} href={href} prefetch={false} className={className} style={style}>{children}</Link>
    ) : (
      <button key={product.id} type="button" className={`cursor-pointer text-left ${className}`} style={{ background: "transparent", color: "inherit", font: "inherit", ...style }} onClick={live ? undefined : () => openProduct(product.id)}>{children}</button>
    );
  }

  function go(pageType: string) {
    const next = normalizePage(pageType);
    if (next === "cart") {
      props.onOpenCart?.();
      return;
    }
    if (next === "checkout" && live) {
      window.location.href = getPublicStorefrontPath(basePath, "/checkout");
      return;
    }
    props.onNavigate(next);
    if (live && typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function shopCategory(slug: string) {
    setFilter((prev) => withGroup(prev, { kind: "category", key: slug }));
    go("products");
  }

  function shopCollection(id: string) {
    setFilter((prev) => withGroup(prev, { kind: "collection", key: id }));
    go("products");
  }

  async function submitForm(type: "newsletter" | "contact") {
    if (!live || !props.visitorKey) return;
    const value = form.newsletter.trim();
    const payload =
      type === "newsletter"
        ? value.includes("@")
          ? { email: value }
          : { phone: value }
        : { name: form.name.trim() || undefined, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, message: form.message.trim() };
    setFormStatus((prev) => ({ ...prev, [type]: "sending" }));
    try {
      const response = await fetch(`/api/public/store/${encodeURIComponent(store.slug)}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorKey: props.visitorKey, type, ...payload, payload: { source: current, theme: themeId } }),
      });
      setFormStatus((prev) => ({ ...prev, [type]: response.ok ? "sent" : "error" }));
      if (response.ok) setForm((prev) => (type === "newsletter" ? { ...prev, newsletter: "" } : { ...prev, name: "", email: "", phone: "", message: "" }));
    } catch {
      setFormStatus((prev) => ({ ...prev, [type]: "error" }));
    }
  }

  function wrap(section: TemplateSectionNode, node: React.ReactNode) {
    if (!node) return null;
    if (live || props.demo) return <div key={section.id}>{node}</div>;
    const selected = props.selectedSectionId === section.id;
    const editCopy = props.onUpdateSectionCopy;
    // Words open for typing on a click; inside a button or link (which still works as one) on a double-click.
    const startInline = (event: React.MouseEvent<HTMLDivElement>, viaDouble: boolean) => {
      if (!editCopy) return;
      const found = inlineTargetFor(event.target as Element, event.currentTarget, copyOf(section));
      if (!found) return;
      const inControl = Boolean(found.element.closest("a, button, summary"));
      if (inControl !== viaDouble) return;
      event.preventDefault();
      setInline({ sectionId: section.id, container: event.currentTarget, key: found.key, element: found.element, value: (found.element.textContent ?? "").replace(/\s+/g, " ").trim() });
    };
    return (
      <div
        key={section.id}
        data-section-id={section.id}
        onClick={(event) => {
          event.stopPropagation();
          props.onSelectSection?.(section.id);
          startInline(event, false);
        }}
        onDoubleClick={(event) => startInline(event, true)}
        style={{ outline: selected ? "2.5px solid #0E9E85" : "2px solid transparent", outlineOffset: -2, cursor: "pointer", position: "relative" }}
      >
        {node}
        {inline && inline.sectionId === section.id && editCopy ? (
          <InlineTextEditor
            key={`${inline.key}-${inline.value}`}
            edit={inline}
            container={inline.container}
            onSave={(value) => editCopy(section.id, inline.key, value)}
            onClose={() => setInline(null)}
          />
        ) : null}
      </div>
    );
  }

  function editorHint(message: string, vars?: Record<string, string | number>) {
    if (live || props.demo) return null;
    return (
      <div className="bq-wrap py-6">
        <div className="rounded-[12px] border border-dashed px-4 py-5 text-center text-[13px]" style={{ borderColor: t.border, color: t.muted }}>{say(message, vars)}</div>
      </div>
    );
  }

  // ─── Sections ──────────────────────────────────────────────────────────────

  function hero(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const layout = text(section.settings?.layout) || look.defaultHero;
    const uploaded = itemImages(section);
    const fromProducts = products.map((product) => product.images[0]).filter(Boolean) as string[];
    // Until the seller uploads a banner, the theme's stock photo fills it (unless they turned that off). Extra
    // picture slots (collages, bento grids) take the seller's product photos first, then more stock.
    const stock = section.settings?.stockImage === false ? null : stockImages;
    const banner = uploaded.length ? uploaded : stock ? [stock.hero] : fromProducts;
    const slides = banner.slice(0, 3);
    const image = slides[0];
    const pool = [...new Set([...banner, ...fromProducts, ...(stock && !uploaded.length ? [stock.story, ...stock.extras] : [])])];
    const title = text(copy.title) || store.name;
    const body = text(copy.body) || (layout === "plain-slides" ? "" : text(store.description));
    const cta = text(copy.primaryCta) || "Shop now";
    const action = text(section.settings?.primaryButtonAction) || "products";
    const headingId = `${uid}-hero`;

    const img = image ? <img src={image} alt="" width={1600} height={900} loading="eager" fetchPriority="high" decoding="async" /> : null;

    const eyebrow = text(copy.eyebrow);

    // ─── Industry theme heroes (Ẹwà, Ṣùkú, Aṣọ Ẹbí, Agbada, Ìlẹ̀kẹ̀, Oúnjẹ, Chin Chin, Ọjà, Ọmọ, Ìwé, Owambe, Danfo, Turare, Oko) ──
    const eyebrowEl = (color: string, extra?: React.CSSProperties) =>
      eyebrow ? <p className="text-[12px] font-semibold uppercase" style={{ fontFamily: look.eyebrowFont, letterSpacing: "0.18em", color, ...extra }}>{eyebrow}</p> : null;
    const ctaButton = (style: React.CSSProperties = look.primaryButton) => <button type="button" className="bq-btn" style={style} onClick={() => go(action)}>{cta}</button>;
    const searchForm = (placeholder: string, dark: boolean) => (
      <form
        role="search"
        className="flex w-full max-w-[560px] items-center gap-2 rounded-full p-1.5 pl-4"
        style={{ background: dark ? "#FFFFFF" : t.cardBg, color: "#111" }}
        onSubmit={(event) => {
          event.preventDefault();
          const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
          setFilter((prev) => ({ ...withGroup(prev, null), q }));
          go("products");
        }}
      >
        <Icon name="search" size={17} color="#555" />
        <label htmlFor={`${headingId}-q`} className="sr-only">{placeholder}</label>
        <input id={`${headingId}-q`} name="q" type="search" placeholder={placeholder} className="h-10 w-0 min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
        <button type="submit" className="bq-btn" style={{ ...look.primaryButton, minHeight: 40 }}>Search</button>
      </form>
    );

    if (layout === "ewa-arch") {
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-8 py-10 @3xl:grid-cols-[1.1fr_1fr] @3xl:items-center @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 6cqi, 76px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[460px] text-[16px] leading-7 opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="bq-media mx-auto w-full max-w-[460px]" style={{ aspectRatio: "4 / 5", borderRadius: "999px 999px 24px 24px" }}>{img}</div>
          </div>
        </section>
      );
    }

    if (layout === "suku-crown") {
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-8 py-10 @3xl:grid-cols-[1fr_0.9fr] @3xl:items-center @3xl:py-14">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="rounded-full px-3 py-1 text-[12px] font-bold uppercase" style={{ background: t.accent, color: "#fff", letterSpacing: "0.12em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[11ch]" style={{ ...look.headingStyle, fontSize: "clamp(42px, 7.5cqi, 96px)", lineHeight: 0.95 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[16px] opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="relative mx-auto w-full max-w-[420px]">
              <div className="absolute -inset-3 rounded-[999px] border-2" style={{ borderColor: t.accent, opacity: 0.6 }} aria-hidden />
              <div className="bq-media" style={{ aspectRatio: "3 / 4", borderRadius: 999 }}>{img}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "asoebi-collage") {
      // Uploaded banners first, then product photos, so the collage is full with a single upload.
      const tiles = [0, 1, 2].map((i) => pool[i] ?? null);
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-8 py-10 @3xl:grid-cols-[0.9fr_1.1fr] @3xl:items-center @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.6cqi, 72px)", lineHeight: 1.04 }}>{title}</h1>
              <span className="block h-[2px] w-16" style={{ background: t.accent }} aria-hidden />
              {body ? <p className="max-w-[460px] text-[15.5px] leading-7 opacity-85">{body}</p> : null}
              {ctaButton({ background: t.accent, color: t.heroBg, border: `1.5px solid ${t.accent}` })}
            </div>
            <div className="bq-collage" style={{ aspectRatio: "6 / 5" }}>
              {tiles.map((src, i) => (
                <div key={i} className="bq-media" style={{ borderRadius: look.cardRadius, minHeight: 0, border: `1px solid ${t.accent}55` }}>
                  {src ? <img src={src} alt="" width={800} height={1000} loading={i === 0 ? "eager" : "lazy"} decoding="async" /> : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "agbada-tailored") {
      return (
        <section aria-labelledby={headingId} className="bq-split" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-media" style={{ aspectRatio: "4 / 5", minHeight: "100%" }}>{img}</div>
          <div className="flex flex-col justify-center gap-5 px-6 py-12 @3xl:px-14">
            {eyebrowEl(t.accent)}
            <span className="block h-px w-full max-w-[420px]" style={{ background: `${t.heroText}40` }} aria-hidden />
            <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 5cqi, 64px)", lineHeight: 1.05 }}>{title}</h1>
            <span className="block h-px w-full max-w-[420px]" style={{ background: `${t.heroText}40` }} aria-hidden />
            {body ? <p className="max-w-[440px] text-[15.5px] leading-7 opacity-85">{body}</p> : null}
            <div>{ctaButton({ background: t.heroText, color: t.heroBg, border: `1.5px solid ${t.heroText}` })}</div>
          </div>
        </section>
      );
    }

    if (layout === "ileke-frame") {
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap flex flex-col items-center gap-6 py-12 text-center @3xl:py-16">
            {eyebrowEl(t.accent)}
            <h1 id={headingId} className="bq-h max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 6.4cqi, 84px)", lineHeight: 1 }}>{title}</h1>
            {body ? <p className="max-w-[520px] text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
            {ctaButton(look.solidButton)}
            <div className="mt-2 w-full max-w-[720px] p-3" style={{ border: `1px solid ${t.accent}66`, borderRadius: look.cardRadius + 6 }}>
              <div className="bq-media" style={{ aspectRatio: "16 / 9", borderRadius: look.cardRadius }}>{img}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "ounje-menu") {
      // Theme previews show where the button goes; a real store shows it only with a real number.
      const whatsapp = shopper.whatsappNumber ?? (props.demo ? "sample" : null);
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-8 py-10 @3xl:grid-cols-[1.1fr_1fr] @3xl:items-center @3xl:py-14">
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 6.4cqi, 80px)", lineHeight: 0.98 }}>{title}</h1>
              {body ? <p className="max-w-[460px] text-[16px] opacity-85">{body}</p> : null}
              <div className="flex flex-wrap gap-3">
                {whatsapp ? (
                  <a href={live && shopper.whatsappNumber ? whatsappLink(shopper.whatsappNumber, `Hi ${store.name}, I'd like to order`) : undefined} target="_blank" rel="noopener noreferrer" className="bq-btn" style={{ background: "#25D366", color: "#fff", border: "1.5px solid #25D366" }}>
                    <Icon name="whatsapp" size={17} /> Order on WhatsApp
                  </a>
                ) : null}
                {ctaButton(whatsapp ? { background: "transparent", color: t.heroText, border: `1.5px solid ${t.heroText}` } : look.primaryButton)}
              </div>
              {!whatsapp && !live && !props.demo ? <p className="text-[12.5px] opacity-70">{say("Add your WhatsApp number in Live chat settings to show Order on WhatsApp here.")}</p> : null}
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[440px]">
              <div className="absolute inset-0 rounded-full" style={{ background: `${t.accent}33` }} aria-hidden />
              <div className="absolute inset-[7%]">
                <div className="bq-media h-full w-full rounded-full" style={{ border: `6px solid ${t.paperBg}` }}>{img}</div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "chinchin-sweet") {
      return (
        <section aria-labelledby={headingId} className="relative" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-8 pb-16 pt-10 @3xl:grid-cols-2 @3xl:items-center @3xl:pb-20 @3xl:pt-14">
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 6cqi, 76px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[16px] opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="bq-media mx-auto w-full max-w-[460px]" style={{ aspectRatio: "1 / 1", borderRadius: "46% 54% 42% 58% / 52% 44% 56% 48%", border: `8px solid ${t.paperBg}` }}>{img}</div>
          </div>
          <svg aria-hidden viewBox="0 0 120 8" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 block h-4 w-full" style={{ color: t.paperBg }}>
            <path fill="currentColor" d={`M0 8 ${Array.from({ length: 12 }, (_, i) => `Q${i * 10 + 5} 0 ${i * 10 + 10} 8`).join(" ")} Z`} />
          </svg>
        </section>
      );
    }

    if (layout === "oja-market") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-4">
          <div className="grid overflow-hidden @3xl:grid-cols-[1.4fr_1fr]" style={{ background: t.heroBg, color: t.heroText, borderRadius: look.cardRadius + 6 }}>
            <div className="flex flex-col items-start gap-4 px-5 py-8 @3xl:px-10 @3xl:py-10">
              {eyebrowEl(t.heroText, { opacity: 0.85 })}
              <h1 id={headingId} className="bq-h max-w-[18ch]" style={{ ...look.headingStyle, fontSize: "clamp(30px, 4.4cqi, 54px)", lineHeight: 1.05 }}>{title}</h1>
              {body ? <p className="max-w-[480px] text-[15px] opacity-90">{body}</p> : null}
              {searchForm("Search rice, oil, detergent…", true)}
            </div>
            <div className="bq-media bq-only-wide" style={{ minHeight: "100%" }}>{img}</div>
          </div>
        </section>
      );
    }

    if (layout === "omo-play") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-4">
          <div className="grid gap-6 overflow-hidden px-6 py-10 @3xl:grid-cols-[1.1fr_1fr] @3xl:items-center @3xl:px-12 @3xl:py-14" style={{ background: t.heroBg, color: t.heroText, borderRadius: 32 }}>
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="rounded-full bg-white px-3 py-1 text-[12.5px] font-bold" style={{ color: t.accent }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.8cqi, 72px)", lineHeight: 1 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[16px] opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="relative mx-auto w-full max-w-[400px] py-4">
              <span className="absolute -left-2 top-2 h-16 w-16 rounded-full" style={{ background: t.accent, opacity: 0.85 }} aria-hidden />
              <span className="absolute -right-1 bottom-0 h-10 w-10 rounded-[12px]" style={{ background: "#FF7A59" }} aria-hidden />
              <div className="bq-media relative" style={{ aspectRatio: "1 / 1", borderRadius: 28, transform: "rotate(-3deg)", border: "6px solid #fff" }}>{img}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "iwe-shelf") {
      const covers = [...new Set([...uploaded, ...fromProducts])].slice(0, 4);
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-10 py-12 @3xl:grid-cols-[1fr_1.2fr] @3xl:items-end @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.6cqi, 70px)", lineHeight: 1.04 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {ctaButton(look.solidButton)}
            </div>
            <div>
              <div className="bq-shelf px-2">
                {(covers.length ? covers : [null, null, null, null]).map((src, i) => (
                  <div key={i} className="bq-media" style={{ aspectRatio: "2 / 3", borderRadius: 2, boxShadow: "0 10px 24px rgba(0,0,0,.18)", transform: `translateY(${i % 2 ? -10 : 0}px)` }}>
                    {src ? <img src={src} alt="" width={400} height={600} loading="eager" decoding="async" /> : null}
                  </div>
                ))}
              </div>
              <div className="mt-0 h-3 rounded-[2px]" style={{ background: t.ink, opacity: 0.85 }} aria-hidden />
            </div>
          </div>
        </section>
      );
    }

    if (layout === "owambe-party") {
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div aria-hidden className="absolute inset-0" style={{ backgroundImage: `radial-gradient(${t.accent} 1.5px, transparent 1.6px), radial-gradient(#E85D9E 1.5px, transparent 1.6px)`, backgroundSize: "46px 46px, 46px 46px", backgroundPosition: "0 0, 23px 23px", opacity: 0.35 }} />
          <div className="bq-wrap relative grid gap-8 py-12 @3xl:grid-cols-[1fr_1fr] @3xl:items-center @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(40px, 6.4cqi, 84px)", lineHeight: 0.98 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[16px] opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="bq-media" style={{ aspectRatio: "5 / 4", borderRadius: look.cardRadius + 6, border: `3px solid ${t.accent}` }}>{img}</div>
          </div>
        </section>
      );
    }

    if (layout === "danfo-garage") {
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div aria-hidden className="h-3" style={{ background: `repeating-linear-gradient(135deg, ${t.accent} 0 16px, ${t.heroBg} 16px 32px)` }} />
          <div className="bq-wrap grid gap-8 py-10 @3xl:grid-cols-[1.2fr_1fr] @3xl:items-center @3xl:py-14">
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[15ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 6cqi, 76px)", lineHeight: 0.98 }}>{title}</h1>
              {body ? <p className="max-w-[480px] text-[15.5px] opacity-85">{body}</p> : null}
              {searchForm("Search by part, car or model", true)}
            </div>
            <div className="bq-media" style={{ aspectRatio: "4 / 3", borderRadius: look.cardRadius, border: `2px solid ${t.accent}` }}>{img}</div>
          </div>
          <div aria-hidden className="h-3" style={{ background: `repeating-linear-gradient(135deg, ${t.accent} 0 16px, ${t.heroBg} 16px 32px)` }} />
        </section>
      );
    }

    if (layout === "turare-glow") {
      return (
        <section aria-labelledby={headingId} style={{ background: `radial-gradient(circle at 70% 50%, ${t.accent}55, transparent 55%), ${t.heroBg}`, color: t.heroText }}>
          <div className="bq-wrap grid gap-8 py-12 @3xl:grid-cols-2 @3xl:items-center @3xl:py-20">
            <div className="flex flex-col items-start gap-5">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 6cqi, 80px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[15.5px] leading-7 opacity-80">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="mx-auto grid w-full max-w-[420px] place-items-center" style={{ aspectRatio: "1 / 1", borderRadius: 999, background: `radial-gradient(circle, ${t.accent}66, transparent 68%)` }}>
              <div className="bq-media h-[78%] w-[62%]" style={{ borderRadius: look.cardRadius + 10 }}>{img}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "oko-field") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(to top, rgba(18,32,14,.7), rgba(18,32,14,0) 60%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-start gap-4 pb-8 text-white">
              {eyebrow ? <p className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold" style={{ background: t.accent, color: t.ink }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 6cqi, 80px)", lineHeight: 1 }}>{title}</h1>
              {body ? <p className="max-w-[480px] text-[15.5px] opacity-90">{body}</p> : null}
              {ctaButton({ background: "#fff", color: t.ink, border: "1.5px solid #fff" })}
            </div>
          </div>
        </section>
      );
    }

    // ─── Àárọ̀, Highlife, Ọba and Gbẹ̀du: after the theme stores' best sellers (photo-first, retro, luxury, loud) ──
    // The ticker ribbon is decoration (the same words as the eyebrow or button), so screen readers skip it.
    const ticker = (words: string, style: React.CSSProperties, mark = "✦") => (
      <div aria-hidden className="bq-ticker py-3" style={style}>
        <div className="bq-ticker-track">
          {[0, 1].map((half) => (
            <span key={half} className="inline-flex">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="inline-flex items-center gap-5 px-5 text-[15px] font-extrabold uppercase" style={{ letterSpacing: "0.04em" }}>
                  {words}
                  <span style={{ opacity: 0.8 }}>{mark}</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    );

    if (layout === "aaro-banner") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "rgba(0,0,0,.32)" : "transparent" }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
              {eyebrow ? <p className="text-[13px]" style={{ letterSpacing: "0.08em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 5.5cqi, 64px)", lineHeight: 1.08 }}>{title}</h1>
              {body ? <p className="max-w-[520px] text-[15.5px] opacity-90">{body}</p> : null}
              <button type="button" className="bq-btn mt-1" style={{ background: "#fff", color: "#121212", border: "1px solid #fff", borderRadius: look.buttonRadius }} onClick={() => go(action)}>{cta}</button>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "highlife-ticker") {
      return (
        <section aria-labelledby={headingId} style={{ color: t.ink }}>
          <div className="bq-wrap grid gap-10 py-10 @3xl:grid-cols-[1fr_1fr] @3xl:items-center @3xl:py-16">
            <div className="relative flex flex-col items-start gap-5">
              {eyebrow ? (
                <p className="inline-flex -rotate-3 items-center rounded-full px-4 py-1.5 text-[13px] font-extrabold uppercase" style={{ background: "#F6D27A", color: t.ink, border: `2px solid ${t.ink}`, letterSpacing: "0.06em" }}>{eyebrow}</p>
              ) : null}
              <h1 id={headingId} className="bq-h max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(44px, 7.4cqi, 104px)", lineHeight: 0.92 }}>{title}</h1>
              {body ? <p className="max-w-[460px] text-[16px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="relative mx-auto w-full max-w-[560px]">
              <div aria-hidden className="absolute inset-0 translate-x-3 translate-y-3" style={{ background: t.heroBg, borderRadius: look.cardRadius + 8 }} />
              <div className="bq-media relative" style={{ aspectRatio: "5 / 4", borderRadius: look.cardRadius + 8, border: `2px solid ${t.ink}` }}>{img}</div>
              <span aria-hidden className="absolute -right-2 -top-4 grid h-20 w-20 rotate-12 place-items-center rounded-full text-[30px] leading-none" style={{ background: t.accent, color: "#fff", border: `2px solid ${t.ink}` }}>✦</span>
            </div>
          </div>
          {ticker(eyebrow || cta, { background: t.heroBg, color: t.heroText, borderBlock: `2px solid ${t.ink}` })}
        </section>
      );
    }

    if (layout === "oba-cinema") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-media aspect-[4/5] @3xl:aspect-[16/8]" style={{ background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0) 55%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-12 text-center @3xl:pb-16" style={{ color: t.heroText }}>
              {eyebrow ? <p className="text-[11.5px] uppercase" style={{ fontFamily: look.eyebrowFont, letterSpacing: "0.3em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[18ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 6.6cqi, 92px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[520px] text-[15px] leading-7 opacity-90">{body}</p> : null}
              <button type="button" className="mt-2 cursor-pointer border-0 border-b bg-transparent px-0 pb-1.5 text-[12px] font-semibold uppercase" style={{ color: "inherit", borderColor: "currentColor", letterSpacing: "0.22em" }} onClick={() => go(action)}>{cta}</button>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "gbedu-impact") {
      const glow = `linear-gradient(90deg, ${t.accent}, #EC4899)`;
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 80% 20%, ${t.accent}55, transparent 50%), linear-gradient(to top, ${t.heroBg} 4%, rgba(11,11,15,.55) 45%, rgba(11,11,15,.15))` }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-start gap-4 pb-8 @3xl:pb-12">
              {eyebrow ? <p className="rounded-full px-3.5 py-1 text-[12px] font-extrabold uppercase" style={{ background: glow, color: "#fff", letterSpacing: "0.14em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(48px, 10.5cqi, 156px)", lineHeight: 0.86 }}>
                <span style={{ background: `linear-gradient(100deg, ${t.heroText} 35%, ${t.accent} 70%, #EC4899)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{title}</span>
              </h1>
              {body ? <p className="max-w-[480px] text-[15.5px] opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
          </div>
          {ticker(eyebrow || cta, { background: glow, color: "#FFFFFF" }, "●")}
        </section>
      );
    }

    // ─── Ọmalịcha, Zuma, Ọkụ, Ìhè, Kasuwa, Nkata, Ụwa, Sarauniya, Zinariya ───────────────────────────
    const picture = (src: string | undefined, eager = false) => (src ? <img src={src} alt="" width={900} height={1125} loading={eager ? "eager" : "lazy"} decoding="async" /> : null);
    // A product link that works live (a real page) and in the builder (opens the product preview).
    const productLink = (product: ShopperProduct, className: string, children: React.ReactNode, style?: React.CSSProperties) => {
      const href = productHref(product.id);
      return href ? (
        <Link key={product.id} href={href} prefetch={false} className={className} style={style}>{children}</Link>
      ) : (
        <button key={product.id} type="button" className={className} style={{ background: "transparent", border: 0, padding: 0, textAlign: "left", color: "inherit", cursor: "pointer", ...style }} onClick={live ? undefined : () => openProduct(product.id)}>{children}</button>
      );
    };

    if (layout === "omalicha-card") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-4 @3xl:pt-6">
          <div className="relative">
            <div className="bq-media aspect-[4/5] @3xl:aspect-[16/7]" style={{ borderRadius: 32, background: image ? look.placeholder : t.heroBg }}>{img}</div>
            <div className="relative mx-3 -mt-20 flex flex-col items-start gap-3 p-6 @3xl:absolute @3xl:bottom-10 @3xl:left-10 @3xl:m-0 @3xl:max-w-[460px] @3xl:p-9" style={{ background: "#FFFFFF", borderRadius: 26, boxShadow: "0 18px 50px rgba(58,35,65,.14)" }}>
              {eyebrow ? <p className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: t.cardBg, color: t.accent }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(32px, 4.4cqi, 54px)", lineHeight: 1.04 }}>{title}</h1>
              {body ? <p className="text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {ctaButton()}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "zuma-collage") {
      const second = pool[1] ?? pool[0];
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-10 py-10 @3xl:grid-cols-[1.05fr_1fr] @3xl:items-center @3xl:py-16">
            <div className="relative mx-auto w-full max-w-[560px]" style={{ aspectRatio: "1 / 1" }}>
              <div className="bq-media left-0 top-0 h-[86%] w-[74%]" style={{ position: "absolute", borderRadius: look.cardRadius }}>{picture(pool[0], true)}</div>
              <div className="bq-media bottom-0 right-0 h-[54%] w-[46%]" style={{ position: "absolute", borderRadius: look.cardRadius, border: `8px solid ${t.heroBg}` }}>{picture(second)}</div>
              <span aria-hidden className="absolute right-[8%] top-[6%] h-16 w-16 rounded-full" style={{ background: t.accent, opacity: 0.85 }} />
            </div>
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.4cqi, 68px)", lineHeight: 1.04 }}>{title}</h1>
              {body ? <p className="max-w-[460px] text-[16px] leading-7 opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "oku-diagonal") {
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="grid @3xl:grid-cols-[1fr_1.1fr]">
            <div className="relative z-[1] flex flex-col items-start justify-center gap-4 px-5 py-10 @3xl:py-20 @3xl:pl-12 @3xl:pr-6">
              {eyebrow ? <p className="-skew-x-12 px-3 py-1 text-[12px] font-extrabold uppercase" style={{ background: t.accent, color: t.ink, letterSpacing: "0.12em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[11ch]" style={{ ...look.headingStyle, fontSize: "clamp(46px, 8cqi, 116px)", lineHeight: 0.9 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[15.5px] opacity-80">{body}</p> : null}
              <button type="button" className="bq-btn" style={look.primaryButton} onClick={() => go(action)}>{cta} <span aria-hidden>→</span></button>
            </div>
            <div className="bq-media aspect-[4/3] @3xl:aspect-auto @3xl:min-h-[560px] [clip-path:polygon(0_8%,100%_0,100%_100%,0_100%)] @3xl:[clip-path:polygon(18%_0,100%_0,100%_100%,0_100%)]" style={{ background: image ? look.placeholder : "#1F1F1F" }}>
              {img}
            </div>
          </div>
          <div aria-hidden className="h-2" style={{ background: t.accent }} />
        </section>
      );
    }

    if (layout === "ihe-gallery") {
      const works = [0, 1, 2].map((i) => ({ src: pool[i], name: products[i]?.name ?? "" }));
      const shapes = ["3 / 4", "4 / 5", "1 / 1"];
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12 @3xl:py-20">
          <div className="grid gap-10 @3xl:grid-cols-[0.75fr_2fr] @3xl:items-end">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="flex items-center gap-2 text-[12px] uppercase" style={{ color: t.muted, letterSpacing: "0.18em" }}><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: t.accent }} />{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(34px, 4.2cqi, 54px)", lineHeight: 1.08 }}>{title}</h1>
              {body ? <p className="max-w-[360px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" className="mt-1 cursor-pointer border-0 border-b bg-transparent px-0 pb-1 text-[14px]" style={{ color: t.ink, borderColor: t.ink }} onClick={() => go(action)}>{cta} →</button>
            </div>
            <div className="flex snap-x gap-5 overflow-x-auto pb-2 @3xl:grid @3xl:grid-cols-3 @3xl:items-end @3xl:gap-8 @3xl:overflow-visible" style={{ scrollbarWidth: "none" }}>
              {works.map((work, i) => (
                <figure key={i} className="m-0 w-[68%] shrink-0 snap-start @3xl:w-auto">
                  <div className="bq-media" style={{ aspectRatio: shapes[i], padding: 0, boxShadow: "0 1px 0 rgba(0,0,0,.04), 0 14px 30px rgba(0,0,0,.08)" }}>{picture(work.src, i === 0)}</div>
                  {work.name ? <figcaption className="mt-3 text-[13px]" style={{ color: t.muted }}>{work.name}</figcaption> : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "kasuwa-mosaic") {
      const side = [0, 1].map((i) => {
        const category = categories[i];
        const product = category ? products.find((entry) => entry.category?.slug === category.slug) : products[i + 1];
        return { label: category?.name ?? product?.name ?? "", src: product?.images[0] ?? pool[i + 1], open: () => (category ? shopCategory(category.slug) : go("products")) };
      });
      return (
        <section aria-labelledby={headingId} className="bq-wrap grid gap-3 pt-4 @3xl:grid-cols-[2fr_1fr] @3xl:gap-4 @3xl:pt-6">
          <div className="grid overflow-hidden @3xl:grid-cols-[1fr_1fr]" style={{ background: t.heroBg, color: t.heroText, borderRadius: look.cardRadius + 4 }}>
            <div className="flex flex-col items-start justify-center gap-4 p-6 @3xl:p-10">
              {eyebrow ? <p className="rounded-md px-2.5 py-1 text-[12px] font-bold uppercase" style={{ background: t.accent, color: t.ink, letterSpacing: "0.06em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(32px, 4.2cqi, 56px)", lineHeight: 1 }}>{title}</h1>
              {body ? <p className="max-w-[380px] text-[15px] opacity-85">{body}</p> : null}
              {ctaButton({ background: t.accent, color: t.ink, border: `1.5px solid ${t.accent}` })}
            </div>
            <div className="bq-media min-h-[220px]" style={{ background: "rgba(255,255,255,.08)" }}>{img}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-1 @3xl:gap-4">
            {side.map((tile, i) => (
              <button key={i} type="button" onClick={tile.open} className="relative grid min-h-[150px] cursor-pointer grid-cols-1 overflow-hidden border-0 p-0 text-left @3xl:grid-cols-[1fr_1fr]" style={{ background: i === 0 ? t.accent : t.cardBg, color: t.ink, borderRadius: look.cardRadius + 4, border: i === 0 ? 0 : `1px solid ${t.border}` }}>
                <span className="relative z-[1] flex flex-col justify-end gap-1 p-4 @3xl:justify-center @3xl:p-5">
                  <span className="text-[17px] font-bold leading-tight" style={{ fontFamily: look.headingFont }}>{tile.label || "Shop all"}</span>
                  <span className="text-[13px] font-semibold underline underline-offset-4">Shop now</span>
                </span>
                <span className="bq-media min-h-[96px]" style={{ background: "transparent" }}>{picture(tile.src)}</span>
              </button>
            ))}
          </div>
          <div className="@3xl:col-span-2">{searchForm("Search for products, brands and more", false)}</div>
        </section>
      );
    }

    if (layout === "nkata-frame") {
      return (
        <section aria-labelledby={headingId}>
          <div className="relative">
            <div className="bq-media aspect-[4/5] @3xl:aspect-[16/7]" style={{ background: image ? look.placeholder : t.heroBg }}>{img}</div>
            <div className="relative mx-4 -mt-24 @3xl:absolute @3xl:inset-0 @3xl:m-0 @3xl:grid @3xl:place-items-center">
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center @3xl:max-w-[520px] @3xl:px-12 @3xl:py-11" style={{ background: t.paperBg, color: t.ink, outline: `1px solid ${t.border}`, outlineOffset: -10 }}>
                {eyebrow ? <p className="text-[11.5px] uppercase" style={{ color: t.accent, letterSpacing: "0.22em" }}>{eyebrow}</p> : null}
                <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(30px, 3.8cqi, 48px)", lineHeight: 1.08 }}>{title}</h1>
                {body ? <p className="text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
                <div className="mt-1">{ctaButton()}</div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "uwa-cover") {
      const issue = products.slice(0, 3);
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap pb-10 pt-6 @3xl:pb-14">
            <div className="flex items-end justify-between gap-4 border-b-2 pb-2" style={{ borderColor: t.ink }}>
              <p aria-hidden className="m-0 truncate leading-[0.85]" style={{ fontFamily: look.logoFont, ...look.logoStyle, fontSize: "clamp(48px, 11cqi, 168px)" }}>{store.name}</p>
              {eyebrow ? <p className="m-0 hidden shrink-0 pb-3 text-[11px] uppercase @3xl:block" style={{ fontFamily: look.eyebrowFont, letterSpacing: "0.16em", color: t.accent }}>{eyebrow}</p> : null}
            </div>
            <div className="mt-6 grid gap-8 @3xl:grid-cols-[1.5fr_1fr] @3xl:gap-12">
              <div className="bq-media aspect-[4/5] @3xl:aspect-[5/4]" style={{ background: look.placeholder }}>{img}</div>
              <div className="flex flex-col gap-5">
                {eyebrow ? <p className="m-0 text-[11px] uppercase @3xl:hidden" style={{ fontFamily: look.eyebrowFont, letterSpacing: "0.16em", color: t.accent }}>{eyebrow}</p> : null}
                <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(38px, 5cqi, 72px)", lineHeight: 0.98 }}>{title}</h1>
                {body ? <p className="text-[16px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
                <div>{ctaButton()}</div>
                {issue.length ? (
                  <div className="mt-2 border-t pt-4" style={{ borderColor: t.ink }}>
                    <p className="m-0 mb-2 text-[11px] uppercase" style={{ fontFamily: look.eyebrowFont, letterSpacing: "0.16em" }}>In this issue</p>
                    <ol className="m-0 grid list-none gap-0 p-0">
                      {issue.map((product, i) => (
                        <li key={product.id} className="border-b" style={{ borderColor: t.border }}>
                          {productLink(product, "flex w-full items-baseline gap-4 py-3", (
                            <>
                              <span className="text-[13px]" style={{ fontFamily: look.eyebrowFont, color: t.accent }}>{String(i + 1).padStart(2, "0")}</span>
                              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold" style={{ fontFamily: look.headingFont }}>{product.name}</span>
                              <span className="text-[13.5px]" style={{ color: t.muted }}>{formatStoreMoney(product.retailPrice, product.currency)}</span>
                            </>
                          ))}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "sarauniya-duo") {
      const pair = [pool[0], pool[1] ?? pool[0]];
      return (
        <section aria-labelledby={headingId} className="relative" style={{ color: t.heroText }}>
          <div className="grid grid-cols-2">
            {pair.map((src, i) => (
              <div key={i} className="bq-media aspect-[3/5] @3xl:aspect-[4/5]" style={{ background: src ? look.placeholder : i ? t.cardBg : t.heroBg }}>{picture(src, true)}</div>
            ))}
          </div>
          <div className="absolute inset-0" style={{ background: image ? "linear-gradient(to top, rgba(0,0,0,.66), rgba(0,0,0,.28) 55%, rgba(0,0,0,.12))" : "transparent" }} />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-6 pb-10 text-center @3xl:pb-16" style={{ textShadow: "0 1px 18px rgba(0,0,0,.35)" }}>
            {eyebrow ? <p className="text-[11.5px] uppercase" style={{ letterSpacing: "0.24em" }}>{eyebrow}</p> : null}
            <h1 id={headingId} className="bq-h max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(40px, 7cqi, 104px)", lineHeight: 0.98 }}>{title}</h1>
            {body ? <p className="max-w-[480px] text-[15px] opacity-90">{body}</p> : null}
            {ctaButton({ ...look.secondaryButton, background: "transparent", color: "#FFFFFF", border: "1px solid #FFFFFF" })}
          </div>
        </section>
      );
    }

    if (layout === "zinariya-arch") {
      const thumbs = products.slice(0, 2);
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 py-12 text-center @3xl:grid-cols-[1fr_auto_1fr] @3xl:gap-14 @3xl:py-16 @3xl:text-left">
            <div className="flex flex-col items-center gap-4 @3xl:items-start">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 4.6cqi, 62px)", lineHeight: 1.04 }}>{title}</h1>
              <span aria-hidden className="block h-px w-24" style={{ background: t.accent }} />
            </div>
            <div className="relative mx-auto w-[min(78vw,380px)]">
              <div aria-hidden className="absolute -inset-3" style={{ border: `1px solid ${t.accent}`, borderRadius: "999px 999px 0 0", opacity: 0.8 }} />
              <div className="bq-media" style={{ aspectRatio: "3 / 4", borderRadius: "999px 999px 0 0", background: "rgba(255,255,255,.06)" }}>{img}</div>
            </div>
            <div className="flex flex-col items-center gap-5 @3xl:items-start">
              {body ? <p className="max-w-[340px] text-[15px] leading-7 opacity-85">{body}</p> : null}
              {ctaButton()}
              {thumbs.length ? (
                <div className="flex gap-3">
                  {thumbs.map((product) => productLink(product, "block", (
                    <span className="bq-media block h-16 w-16 rounded-full" style={{ boxShadow: `0 0 0 1px ${t.accent}`, background: "rgba(255,255,255,.06)" }}>
                      {product.images[0] ? <img src={product.images[0]} alt={product.name} width={128} height={128} loading="lazy" /> : null}
                    </span>
                  )))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    // ─── Ìràwọ̀, Àṣà, Mmiri, Ụzọ, Rawa, Fitila, Ọ̀ṣọ́, Shakara ────────────────────────────────────────────
    if (layout === "irawo-product") {
      // Product-led: the store's first product, big, with its real name and price.
      const star = products[0];
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-10 py-10 @3xl:grid-cols-2 @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ background: "#FFFFFF", color: t.accent }}>★ {eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(40px, 6.2cqi, 84px)", lineHeight: 0.95 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[16px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {star ? (
                <p className="m-0 flex flex-wrap items-baseline gap-x-3 text-[15px]">
                  <span className="font-semibold">{star.name}</span>
                  <span className="text-[20px] font-extrabold" style={{ color: t.accent }}>{formatStoreMoney(star.retailPrice, star.currency)}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-4">
                {star ? productLink(star, "bq-btn", cta, { ...look.primaryButton, padding: "0 26px" }) : ctaButton()}
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: t.ink }} onClick={() => go("products")}>See everything</button>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[520px]">
              <div aria-hidden className="absolute inset-[6%] rounded-full" style={{ background: t.accent, opacity: 0.18 }} />
              <div className="bq-media relative mx-auto aspect-square w-[82%] rounded-full" style={{ boxShadow: "0 30px 60px rgba(43,27,23,.18)", background: look.placeholder }}>{img}</div>
              <span aria-hidden className="absolute right-[4%] top-[6%] grid h-24 w-24 rotate-12 place-items-center rounded-full text-center text-[12px] font-extrabold uppercase leading-tight" style={{ background: t.ink, color: t.paperBg }}>Best<br />seller</span>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "asa-stamp") {
      const ring = `${eyebrow || store.name} · `.repeat(3);
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-10 py-10 @3xl:grid-cols-[1fr_1.1fr] @3xl:py-16">
            <div className="relative mx-auto w-full max-w-[440px]">
              <div className="bq-media aspect-[4/5]" style={{ borderRadius: "220px 220px 12px 12px", background: look.placeholder }}>{img}</div>
              <div aria-hidden className="pointer-events-none absolute inset-3" style={{ borderRadius: "210px 210px 8px 8px", border: `1.5px dashed ${t.paperBg}` }} />
              <svg aria-hidden viewBox="0 0 120 120" className="absolute -bottom-6 -right-4 h-32 w-32 @3xl:-right-10 @3xl:h-36 @3xl:w-36" style={{ background: t.accent, borderRadius: 999, color: "#FFF6EA" }}>
                <defs><path id={`${headingId}-ring`} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" /></defs>
                <text fontSize="10.5" letterSpacing="1.6" fill="currentColor" style={{ textTransform: "uppercase", fontFamily: look.bodyFont as string }}><textPath href={`#${headingId}-ring`}>{ring}</textPath></text>
                <text x="60" y="68" textAnchor="middle" fontSize="24" fill="currentColor">✺</text>
              </svg>
            </div>
            <div className="flex flex-col items-start gap-4">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 5.6cqi, 74px)", lineHeight: 1.02 }}>{title}</h1>
              <span aria-hidden className="block h-[3px] w-14" style={{ background: t.accent }} />
              {body ? <p className="max-w-[440px] text-[16px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {ctaButton()}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "mmiri-wave") {
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-10 pb-16 pt-10 @3xl:grid-cols-[1.05fr_1fr] @3xl:pb-24 @3xl:pt-14">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ background: "rgba(255,255,255,.16)" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(44px, 7cqi, 96px)", lineHeight: 0.92 }}>{title}</h1>
              {body ? <p className="max-w-[440px] text-[16px] opacity-90">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="relative mx-auto grid w-full max-w-[460px] place-items-center">
              <div aria-hidden className="absolute aspect-square w-[92%] rounded-full" style={{ background: t.accent }} />
              <div className="bq-media relative aspect-[3/4] w-[62%]" style={{ borderRadius: 999, boxShadow: "0 24px 50px rgba(11,37,69,.35)", background: look.placeholder }}>{img}</div>
              {[["12%", "18%", 18], ["82%", "30%", 12], ["18%", "78%", 10]].map(([left, top, size], i) => (
                <span key={i} aria-hidden className="absolute rounded-full" style={{ left: left as string, top: top as string, width: size as number, height: size as number, background: "rgba(255,255,255,.75)" }} />
              ))}
            </div>
          </div>
          <svg aria-hidden viewBox="0 0 1440 90" preserveAspectRatio="none" className="-mt-px block h-[50px] w-full @3xl:h-[80px]" style={{ background: t.heroBg }}>
            <path d="M0,40 C240,90 480,0 720,36 C960,72 1200,10 1440,44 L1440,90 L0,90 Z" fill={t.paperBg} />
          </svg>
        </section>
      );
    }

    if (layout === "uzo-sticky") {
      const stops = categories.slice(0, 3);
      return (
        <section aria-labelledby={headingId} className="bq-wrap grid gap-8 py-10 @3xl:grid-cols-[1fr_1.15fr] @3xl:gap-14 @3xl:py-14">
          <div className="flex flex-col items-start gap-4 @3xl:sticky @3xl:top-24 @3xl:self-start">
            {eyebrow ? <p className="text-[11.5px] uppercase" style={{ fontFamily: look.eyebrowFont, letterSpacing: "0.18em", color: t.accent }}>{eyebrow}</p> : null}
            <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(40px, 5.4cqi, 76px)", lineHeight: 0.98 }}>{title}</h1>
            {body ? <p className="max-w-[420px] text-[16px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
            {ctaButton()}
            {stops.length ? (
              <ol className="m-0 mt-4 grid w-full list-none gap-0 border-t p-0" style={{ borderColor: t.border }}>
                {stops.map((stop, i) => (
                  <li key={stop.slug} className="border-b" style={{ borderColor: t.border }}>
                    <button type="button" onClick={() => shopCategory(stop.slug)} className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent py-3.5 text-left" style={{ color: t.ink }}>
                      <span className="text-[12px]" style={{ fontFamily: look.eyebrowFont, color: t.muted }}>{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1 text-[18px] font-semibold" style={{ fontFamily: look.headingFont }}>{stop.name}</span>
                      <span aria-hidden>→</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
          <div className="flex snap-x gap-4 overflow-x-auto pb-2 @3xl:grid @3xl:gap-6 @3xl:overflow-visible" style={{ scrollbarWidth: "none" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bq-media aspect-[4/5] w-[80%] shrink-0 snap-start @3xl:w-auto" style={{ borderRadius: look.cardRadius, background: look.placeholder }}>{picture(pool[i], i === 0)}</div>
            ))}
          </div>
        </section>
      );
    }

    if (layout === "rawa-fan") {
      const cards = [pool[1] ?? pool[0], pool[0], pool[2] ?? pool[0]];
      return (
        <section aria-labelledby={headingId} className="overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-6 pb-12 pt-10 @3xl:grid-cols-2 @3xl:pb-16 @3xl:pt-14">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="-rotate-2 rounded-full px-3.5 py-1 text-[13px] font-extrabold uppercase" style={{ background: t.accent, color: t.ink }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[11ch]" style={{ ...look.headingStyle, fontSize: "clamp(46px, 7.6cqi, 112px)", lineHeight: 0.88 }}>{title}</h1>
              {body ? <p className="max-w-[420px] text-[16px] opacity-90">{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="relative mx-auto h-[340px] w-full max-w-[520px] @3xl:h-[460px]">
              {cards.map((src, i) => (
                <div key={i} className="bq-media left-1/2 top-1/2 aspect-[3/4] w-[46%]" style={{ position: "absolute", borderRadius: look.cardRadius, border: "5px solid #FFFFFF", boxShadow: "0 18px 40px rgba(0,0,0,.25)", transform: `translate(${-50 + (i - 1) * 48}%, -50%) rotate(${(i - 1) * 9}deg)`, zIndex: i === 1 ? 2 : 1, background: look.placeholder }}>
                  {picture(src, i === 1)}
                </div>
              ))}
            </div>
          </div>
          {ticker(eyebrow || cta, { background: t.accent, color: t.ink }, "✿")}
        </section>
      );
    }

    if (layout === "fitila-room") {
      // Product pins on the room photo: shoppers point at a glowing dot to see the piece and open it.
      const pins = products.slice(0, 3);
      const spots = [{ left: "60%", top: "38%" }, { left: "78%", top: "62%" }, { left: "46%", top: "70%" }];
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="relative">
            <div className="bq-media aspect-[4/5] @3xl:aspect-[16/8]" style={{ background: look.placeholder }}>{img}</div>
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(90deg, rgba(25,20,16,.78), rgba(25,20,16,.15) 60%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-start gap-4 pb-8 @3xl:inset-y-0 @3xl:justify-center @3xl:pb-0">
              {eyebrowEl(t.accent)}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.4cqi, 72px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[420px] text-[15.5px] leading-7 opacity-85">{body}</p> : null}
              {ctaButton()}
            </div>
            {pins.map((product, i) => (
              <div key={product.id} className="group absolute hidden @3xl:block" style={{ left: spots[i]!.left, top: spots[i]!.top }}>
                {productLink(product, "relative grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full", (
                  <>
                    <span aria-hidden className="absolute inset-0 animate-ping rounded-full motion-reduce:animate-none" style={{ background: t.accent, opacity: 0.45 }} />
                    <span aria-hidden className="relative h-4 w-4 rounded-full" style={{ background: t.accent, boxShadow: "0 0 0 4px rgba(255,255,255,.85)" }} />
                    <span className="sr-only">{product.name}</span>
                  </>
                ))}
                <span aria-hidden className="pointer-events-none absolute left-6 top-0 w-[220px] -translate-y-1/2 rounded-[12px] p-3 opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100" style={{ background: t.paperBg, color: t.ink }}>
                  <span className="block truncate text-[14px] font-semibold">{product.name}</span>
                  <span className="block text-[13px]" style={{ color: t.muted }}>{formatStoreMoney(product.retailPrice, product.currency)}</span>
                </span>
              </div>
            ))}
          </div>
          {pins.length ? (
            <div className="bq-wrap flex gap-2 overflow-x-auto py-4 @3xl:hidden" style={{ scrollbarWidth: "none" }}>
              {pins.map((product) => productLink(product, "flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-[13px]", (
                <>
                  <span className="bq-media block h-8 w-8 rounded-full">{product.images[0] ? <img src={product.images[0]} alt="" width={64} height={64} loading="lazy" /> : null}</span>
                  <span className="font-semibold">{product.name}</span>
                </>
              ), { background: "rgba(255,255,255,.1)", color: t.heroText }))}
            </div>
          ) : null}
        </section>
      );
    }

    if (layout === "oso-bento") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-4 @3xl:pt-6">
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4 @3xl:grid-rows-2 @3xl:gap-4">
            <div className="bq-media col-span-2 aspect-[4/5] @3xl:row-span-2 @3xl:aspect-auto @3xl:min-h-[640px]" style={{ background: look.placeholder }}>{picture(pool[0], true)}</div>
            <div className="col-span-2 flex flex-col items-start justify-end gap-4 p-6 @3xl:p-10" style={{ background: t.accent, color: "#FFFFFF" }}>
              {eyebrow ? <p className="text-[11.5px] uppercase" style={{ letterSpacing: "0.22em", opacity: 0.85 }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 4.6cqi, 64px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[420px] text-[15px] opacity-90">{body}</p> : null}
              {ctaButton({ background: "#FFFFFF", color: t.ink, border: "1px solid #FFFFFF" })}
            </div>
            <div className="bq-media aspect-square" style={{ background: look.placeholder }}>{picture(pool[1])}</div>
            <div className="bq-media aspect-square" style={{ background: look.placeholder }}>{picture(pool[2] ?? pool[1])}</div>
          </div>
        </section>
      );
    }

    if (layout === "shakara-poster") {
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <p aria-hidden className="pointer-events-none absolute -left-2 top-0 m-0 hidden h-full select-none whitespace-nowrap @3xl:block" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: look.headingFont, fontWeight: 800, fontSize: "clamp(80px, 9cqi, 150px)", lineHeight: 1, textTransform: "uppercase", color: "transparent", WebkitTextStroke: `1.5px ${t.heroText}55` }}>{store.name}</p>
          <div className="bq-wrap relative">
            <div className="grid items-end gap-8 py-10 @3xl:grid-cols-[1.1fr_1fr] @3xl:py-16 @3xl:pl-28">
              <div className="relative order-2 @3xl:order-1">
                {eyebrow ? <p className="mb-4 inline-block rotate-[-3deg] border-2 px-3 py-1 text-[13px] font-bold uppercase" style={{ fontFamily: look.eyebrowFont, borderColor: t.accent, color: t.accent }}>{eyebrow}</p> : null}
                <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(56px, 11cqi, 172px)", lineHeight: 0.84 }}>{title}</h1>
                {body ? <p className="mt-5 max-w-[420px] text-[15.5px] opacity-80">{body}</p> : null}
                <div className="mt-6">{ctaButton()}</div>
              </div>
              <div className="relative order-1 mx-auto w-full max-w-[440px] @3xl:order-2">
                <div aria-hidden className="absolute inset-0 translate-x-4 translate-y-4" style={{ background: t.accent }} />
                <div className="bq-media relative aspect-[4/5]" style={{ border: `2px solid ${t.heroText}`, background: look.placeholder }}>{img}</div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    // ─── Àga, Ìtura, Gèlè, Imani, Ìtànná (from the seller's inspiration templates, batch 1) ─────────────
    if (layout === "aga-masonry") {
      // A masonry wall of the store's products, each with its price and name over the photo.
      const wall = products.slice(0, 9);
      const heights = ["aspect-[4/5]", "aspect-[1/1]", "aspect-[3/4]", "aspect-[1/1]", "aspect-[4/5]", "aspect-[3/4]", "aspect-[4/5]", "aspect-[1/1]", "aspect-[3/4]"];
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-wrap flex flex-wrap items-end justify-between gap-4 pb-6 pt-8">
            <div>
              {eyebrow ? <p className="m-0 flex items-center gap-2 text-[12px] font-semibold uppercase" style={{ letterSpacing: "0.12em", color: t.muted }}><span aria-hidden className="inline-block h-[3px] w-6" style={{ background: t.accent }} />{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h mt-2 text-[30px] @3xl:text-[40px]" style={look.headingStyle}>{title}</h1>
            </div>
            {ctaButton()}
          </div>
          {wall.length ? (
            <div className="columns-2 gap-0 @3xl:columns-3">
              {wall.map((product, i) => productLink(product, "group relative block w-full break-inside-avoid", (
                <>
                  <span className={`bq-media block ${heights[i % heights.length]}`} style={{ background: look.placeholder }}>
                    {product.images[0] ? <img src={product.images[0]} alt="" width={700} height={875} loading={i < 3 ? "eager" : "lazy"} decoding="async" className="transition duration-500 group-hover:scale-[1.03]" /> : null}
                  </span>
                  <span className="absolute left-5 top-5 flex flex-col gap-1" style={{ color: t.ink }}>
                    <span aria-hidden className="block h-[3px] w-10 transition-all group-hover:w-16" style={{ background: t.accent }} />
                    <span className="text-[13px]" style={{ color: t.muted }}>From {formatStoreMoney(product.retailPrice, product.currency)}</span>
                    <span className="text-[18px] font-semibold @3xl:text-[22px]" style={{ fontFamily: look.headingFont }}>{product.name}</span>
                  </span>
                </>
              )))}
            </div>
          ) : (
            <div className="bq-media aspect-[16/7]" style={{ background: look.placeholder }}>{img}</div>
          )}
        </section>
      );
    }

    if (layout === "itura-cutout") {
      const frames = pool.slice(0, 3);
      const at = frames.length ? heroIndex % frames.length : 0;
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 py-10 @3xl:grid-cols-[1fr_1.2fr] @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="m-0 text-[13px] font-semibold" style={{ color: t.accent }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 5.4cqi, 70px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[420px] text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="relative">
              <div className="bq-media aspect-[4/3]" style={{ background: "transparent", borderRadius: look.cardRadius + 8 }}>{picture(frames[at], true)}</div>
              {frames.length > 1 ? (
                <div className="mt-4 flex items-center justify-end gap-3 text-[13px] font-semibold">
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0" style={{ color: t.ink }} onClick={() => setHeroIndex((value) => (value + frames.length - 1) % frames.length)} aria-label="Previous picture">Previous</button>
                  <span aria-hidden style={{ color: t.muted }}>|</span>
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0" style={{ color: t.ink }} onClick={() => setHeroIndex((value) => (value + 1) % frames.length)} aria-label="Next picture">Next</button>
                  <span className="ml-2" style={{ color: t.muted }} aria-live="polite">{at + 1} / {frames.length}</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "gele-mosaic") {
      // One big banner beside four category tiles with how many items each has.
      const tints = ["#DCEFE9", "#E6E1F7", "#FBE3EC", "#DCEAF8"];
      const tiles = categories.slice(0, 4).map((category, i) => {
        const inCategory = products.filter((product) => product.category?.slug === category.slug);
        return { key: category.slug, name: category.name, count: inCategory.length, src: inCategory[0]?.images[0] ?? pool[i + 1], tint: tints[i]!, open: () => shopCategory(category.slug) };
      });
      return (
        <section aria-labelledby={headingId} className="grid @3xl:grid-cols-2">
          <div className="relative min-h-[420px] overflow-hidden @3xl:min-h-[560px]" style={{ background: t.heroBg }}>
            <div className="bq-media inset-0" style={{ position: "absolute", background: "transparent" }}>{img}</div>
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(90deg, rgba(253,232,226,.92), rgba(253,232,226,.35) 55%, rgba(253,232,226,0))" : "transparent" }} />
            <div className="relative flex h-full min-h-[420px] max-w-[420px] flex-col justify-center gap-4 p-8 @3xl:min-h-[560px] @3xl:p-12" style={{ color: t.heroText }}>
              {eyebrow ? <p className="m-0 text-[13px] uppercase" style={{ letterSpacing: "0.14em", color: t.accent }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(40px, 5cqi, 64px)", lineHeight: 1.04 }}>{title}</h1>
              {body ? <p className="m-0 text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" onClick={() => go(action)} className="w-max cursor-pointer border-0 border-b-2 bg-transparent px-0 pb-1 text-[13px] font-bold uppercase" style={{ color: t.ink, borderColor: t.accent, letterSpacing: "0.08em" }}>{cta}</button>
            </div>
          </div>
          {tiles.length ? (
            <div className="grid grid-cols-2">
              {tiles.map((tile) => (
                <button key={tile.key} type="button" onClick={tile.open} className="group relative min-h-[200px] cursor-pointer overflow-hidden border-0 p-0 text-left @3xl:min-h-[280px]" style={{ background: tile.tint }}>
                  <span className="bq-media inset-y-0 right-0 w-[60%]" style={{ position: "absolute", background: "transparent" }}>{picture(tile.src)}</span>
                  <span className="relative flex h-full flex-col justify-center gap-1 p-6" style={{ color: "#111" }}>
                    <span className="bq-h text-[22px] @3xl:text-[26px]" style={{ ...look.headingStyle, color: "#111" }}>{tile.name}</span>
                    <span className="text-[13px]" style={{ color: "#555" }}>{tile.count} {tile.count === 1 ? "item" : "items"}</span>
                    <span className="mt-2 w-max border-b-2 pb-0.5 text-[12px] font-bold uppercase" style={{ borderColor: t.accent, letterSpacing: "0.08em" }}>Shop now</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      );
    }

    if (layout === "imani-split") {
      // Two halves, each with its own picture and link: the banner's words on the left, the first category on the right.
      const second = categories[0];
      const right = second ? products.find((product) => product.category?.slug === second.slug)?.images[0] ?? pool[1] : pool[1];
      return (
        <section aria-labelledby={headingId} className="grid @3xl:grid-cols-2" style={{ background: t.heroBg, color: t.heroText }}>
          {[0, 1].map((half) => (
            <div key={half} className="relative min-h-[300px] overflow-hidden @3xl:min-h-[440px]">
              <div className="bq-media inset-0" style={{ position: "absolute", background: t.heroBg }}>{picture(half ? right : pool[0], true)}</div>
              <div className="absolute inset-0" style={{ background: `linear-gradient(${half ? "270deg" : "90deg"}, ${t.heroBg}E6, ${t.heroBg}33 70%)` }} />
              <div className={`relative flex h-full min-h-[300px] flex-col justify-center gap-3 p-8 @3xl:min-h-[440px] @3xl:p-12 ${half ? "items-end text-right" : "items-start"}`}>
                {half ? (
                  <>
                    <p className="bq-h m-0 text-[32px] @3xl:text-[44px]" style={{ ...look.headingStyle, color: t.heroText }}>{second?.name ?? store.name}</p>
                    <button type="button" onClick={() => (second ? shopCategory(second.slug) : go("products"))} className="bq-btn" style={{ background: "#E86A9A", color: "#fff", border: "1.5px solid #E86A9A" }}>Shop now</button>
                  </>
                ) : (
                  <>
                    {eyebrow ? <p className="m-0 text-[12px] uppercase" style={{ letterSpacing: "0.16em", color: t.accent }}>{eyebrow}</p> : null}
                    <h1 id={headingId} className="bq-h max-w-[12ch] text-[32px] @3xl:text-[44px]" style={{ ...look.headingStyle, color: t.heroText }}>{title}</h1>
                    {body ? <p className="m-0 max-w-[360px] text-[15px] opacity-85">{body}</p> : null}
                    {ctaButton()}
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (layout === "itanna-centered") {
      // Words only, centred, on a soft glow; the products right below carry the page.
      const chips = categories.slice(0, 5);
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden">
          <div aria-hidden className="absolute left-1/2 top-[-120px] h-[360px] w-[720px] -translate-x-1/2 rounded-full" style={{ background: `radial-gradient(closest-side, ${t.accent}33, transparent)` }} />
          <div className="bq-wrap relative flex flex-col items-center gap-4 py-14 text-center @3xl:py-20">
            {eyebrow ? <p className="m-0 rounded-full px-3 py-1 text-[12.5px] font-semibold" style={{ background: t.heroBg, color: t.accent }}>{eyebrow}</p> : null}
            <h1 id={headingId} className="bq-h max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 5.6cqi, 64px)", lineHeight: 1.05 }}>{title}</h1>
            {body ? <p className="m-0 max-w-[560px] text-[16.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
            {chips.length ? (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {chips.map((category) => (
                  <button key={category.slug} type="button" onClick={() => shopCategory(category.slug)} className="cursor-pointer rounded-full border px-4 py-2 text-[13.5px] font-medium" style={{ borderColor: t.border, background: "#FFFFFF", color: t.ink }}>{category.name}</button>
                ))}
              </div>
            ) : (
              ctaButton()
            )}
          </div>
        </section>
      );
    }

    // ─── Littafi, Ìtàn, Àwọ̀, Kyau, Keke (from the seller's inspiration templates, batch 2) ────────────
    // Book-cover and cut-out banners flip through their pictures with side arrows.
    const sideArrows = (count: number, color: string) => count > 1 ? (
      <>
        <button type="button" aria-label="Previous picture" onClick={() => setHeroIndex((value) => (value + count - 1) % count)} className="absolute left-2 top-1/2 z-[2] grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0 bg-transparent" style={{ color }}><Icon name="arrowLeft" size={20} /></button>
        <button type="button" aria-label="Next picture" onClick={() => setHeroIndex((value) => (value + 1) % count)} className="absolute right-2 top-1/2 z-[2] grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0 bg-transparent" style={{ color }}><Icon name="chevRight" size={20} /></button>
      </>
    ) : null;

    if (layout === "littafi-gradient") {
      const covers = pool.slice(0, 3);
      const at = covers.length ? heroIndex % covers.length : 0;
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: "linear-gradient(115deg, #DDF3F1 0%, #F3EEF7 45%, #FCE7EF 100%)", color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 px-12 py-12 @3xl:grid-cols-2 @3xl:px-20 @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="m-0 text-[13px] font-semibold" style={{ color: t.accent }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 4.8cqi, 60px)", lineHeight: 1.08 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[420px] text-[15.5px]" style={{ color: t.muted }}>{body}</p> : null}
              {ctaButton()}
            </div>
            <div className="mx-auto w-[min(70%,320px)]">
              <div className="bq-media aspect-[2/3]" style={{ boxShadow: "-12px 18px 40px rgba(31,31,31,.25)", borderRadius: "4px 10px 10px 4px" }}>{picture(covers[at], true)}</div>
            </div>
          </div>
          {sideArrows(covers.length, t.ink)}
        </section>
      );
    }

    if (layout === "itan-cover") {
      const covers = pool.slice(0, 3);
      const at = covers.length ? heroIndex % covers.length : 0;
      const [first, ...rest] = title.split(" ");
      return (
        <section aria-labelledby={headingId} className="relative" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-10 px-12 py-12 @3xl:grid-cols-[1.1fr_1fr] @3xl:px-24 @3xl:py-20">
            <div className="flex flex-col items-start gap-5">
              {eyebrow ? <p className="m-0 text-[12px] uppercase" style={{ letterSpacing: "0.2em", color: t.muted }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(40px, 5.4cqi, 72px)", lineHeight: 1.12 }}>{first} <span style={{ color: t.accent }}>{rest.join(" ")}</span></h1>
              {body ? <p className="m-0 max-w-[420px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" onClick={() => go(action)} className="bq-btn" style={look.primaryButton}>{cta} <span aria-hidden>→</span></button>
            </div>
            <div className="mx-auto w-[min(72%,340px)]">
              <div className="bq-media aspect-[2/3]" style={{ boxShadow: "inset 10px 0 12px -8px rgba(0,0,0,.35), 0 24px 50px rgba(0,0,0,.18)" }}>{picture(covers[at], true)}</div>
            </div>
          </div>
          {sideArrows(covers.length, t.muted)}
        </section>
      );
    }

    if (layout === "awo-banner") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(90deg, rgba(255,255,255,.92), rgba(255,255,255,.55) 40%, rgba(255,255,255,0) 65%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-0 flex flex-col items-start justify-center gap-4" style={{ color: t.ink }}>
              {eyebrow ? <p className="m-0 text-[12.5px] font-semibold uppercase" style={{ letterSpacing: "0.08em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 5cqi, 64px)", lineHeight: 1.06 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[420px] text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
              {ctaButton()}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "kyau-season") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(90deg, rgba(233,236,242,.9), rgba(233,236,242,.3) 45%, rgba(233,236,242,0) 65%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-0 flex flex-col items-start justify-center gap-3" style={{ color: t.ink }}>
              {eyebrow ? <p className="m-0 text-[17px] @3xl:text-[22px]">{eyebrow}</p> : null}
              <h1 id={headingId} className="m-0 max-w-[12ch] uppercase" style={{ fontFamily: BQ_SERIF, fontWeight: 700, fontSize: "clamp(38px, 5.6cqi, 72px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[400px] text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
              <div className="mt-2">{ctaButton()}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "keke-slant") {
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.paperBg }}>
          <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[62%] @3xl:block" style={{ background: t.heroBg, clipPath: "polygon(0 0, 100% 0, 100% 62%, 0 100%)" }} />
          <div className="bq-wrap relative grid items-center gap-6 py-8 @3xl:grid-cols-[1.1fr_1fr] @3xl:py-14">
            <div className="relative">
              <div className="bq-media aspect-[4/3]" style={{ background: "transparent" }}>{image ? <img src={image} alt="" width={900} height={675} loading="eager" fetchPriority="high" decoding="async" style={{ objectFit: "contain" }} /> : null}</div>
              {eyebrow ? <span aria-hidden className="absolute left-[18%] top-0 grid h-16 w-16 place-items-center rounded-full text-center text-[11px] font-bold uppercase leading-tight" style={{ background: t.accent, color: t.ink }}>{eyebrow.split(" ")[0]}</span> : null}
            </div>
            <div className="flex flex-col items-start gap-4 p-6 @3xl:p-0" style={{ background: t.heroBg, color: t.heroText }}>
              {eyebrow ? <p className="sr-only">{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[10ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 4.8cqi, 60px)", lineHeight: 1.04, color: t.heroText }}>{title}</h1>
              {body ? <p className="m-0 max-w-[380px] text-[15px] opacity-85">{body}</p> : null}
              {ctaButton()}
              <div aria-hidden className="mt-4 hidden gap-0 @3xl:flex"><span className="h-8 w-8" style={{ background: t.accent }} /><span className="h-8 w-8" style={{ background: "#1B2B33" }} /></div>
            </div>
          </div>
        </section>
      );
    }

    // ─── Inspiration batch 3: Ahịa, Àdó, Wuta, Ike, Ẹ̀wù ─────────────────────────────────────────────
    if (layout === "ahia-yellow") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: "#FFFFFF" }}>
          <div className="bq-media inset-0" style={{ position: "absolute", borderRadius: 0, background: t.heroBg }}>{picture(shots[at], true)}</div>
          <div aria-hidden className="absolute inset-0" style={{ background: shots.length ? `linear-gradient(180deg, ${t.heroBg}B3 0%, rgba(0,0,0,.18) 55%, ${t.paperBg} 100%)` : "transparent" }} />
          <div className="bq-wrap relative">
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 px-10 pb-24 pt-16 text-center @3xl:min-h-[540px] @3xl:px-24">
            {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ letterSpacing: "0.16em", textShadow: "0 1px 8px rgba(0,0,0,.35)" }}>{eyebrow}</p> : null}
            <h1 id={headingId} className="bq-h max-w-[16ch] uppercase" style={{ ...look.headingStyle, fontSize: "clamp(34px, 5.6cqi, 72px)", lineHeight: 1.08, textShadow: "0 2px 18px rgba(0,0,0,.35)" }}>{title}</h1>
            {body ? <p className="m-0 max-w-[520px] text-[15.5px]" style={{ textShadow: "0 1px 8px rgba(0,0,0,.4)" }}>{body}</p> : null}
            {ctaButton(look.solidButton)}
          </div>
          </div>
          {shots.length > 1 ? (
            <>
              <button type="button" aria-label="Previous picture" onClick={() => setHeroIndex((value) => (value + shots.length - 1) % shots.length)} className="absolute left-2 top-[45%] z-[2] grid h-9 w-9 @3xl:left-4 @3xl:h-12 @3xl:w-12 cursor-pointer place-items-center rounded-full border-0" style={{ background: "rgba(255,255,255,.75)", color: t.ink }}><Icon name="arrowLeft" size={18} /></button>
              <button type="button" aria-label="Next picture" onClick={() => setHeroIndex((value) => (value + 1) % shots.length)} className="absolute right-2 top-[45%] z-[2] grid h-9 w-9 @3xl:right-4 @3xl:h-12 @3xl:w-12 cursor-pointer place-items-center rounded-full border-0" style={{ background: "rgba(255,255,255,.75)", color: t.ink }}><Icon name="chevRight" size={18} /></button>
            </>
          ) : null}
        </section>
      );
    }

    if (layout === "ado-model") {
      const [first, ...rest] = title.split(" ");
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(90deg, rgba(12,24,52,.62), rgba(12,24,52,.25) 45%, rgba(12,24,52,0) 70%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-0 flex flex-col items-start justify-center gap-4" style={{ color: "#FFFFFF" }}>
              {eyebrow ? <p className="m-0 text-[12px] font-semibold uppercase" style={{ letterSpacing: "0.12em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[11ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.2cqi, 68px)", lineHeight: 1.08 }}><span style={{ color: t.accent }}>{first}</span> {rest.join(" ")}</h1>
              {body ? <p className="m-0 max-w-[400px] text-[15px] opacity-90">{body}</p> : null}
              <div className="mt-1">{ctaButton()}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "wuta-deal") {
      const pick = products[0];
      const side = pool[1] ?? pool[0];
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-5">
          <div className="grid gap-4 @3xl:grid-cols-[2fr_1fr]">
            <div className="bq-media relative min-h-[320px] @3xl:min-h-[440px]" style={{ background: image ? look.placeholder : t.heroBg, borderRadius: look.cardRadius }}>
              {img}
              <div className="absolute inset-0" style={{ background: image ? "linear-gradient(90deg, rgba(255,255,255,.94), rgba(255,255,255,.6) 45%, rgba(255,255,255,0) 72%)" : "transparent" }} />
              <div className="absolute inset-0 flex flex-col items-start justify-center gap-3 p-7 @3xl:p-12" style={{ color: t.ink }}>
                {eyebrow ? <p className="m-0 text-[13px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.08em" }}>{eyebrow}</p> : null}
                <h1 id={headingId} className="bq-h max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(30px, 4.2cqi, 54px)", lineHeight: 1.08 }}>{title}</h1>
                {body ? <p className="m-0 max-w-[380px] text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
                <div className="mt-1">{ctaButton()}</div>
              </div>
            </div>
            <div className="flex flex-col overflow-hidden" style={{ background: t.accent, color: look.onAccent, borderRadius: look.cardRadius }}>
              {pick ? linkToProduct(pick, "flex h-full w-full flex-col gap-3 border-0 p-6", (
                <>
                  <span className="text-[12px] font-bold uppercase" style={{ letterSpacing: "0.12em" }}>Featured</span>
                  <span className="bq-media mx-auto block aspect-square w-[min(100%,240px)]" style={{ background: "rgba(255,255,255,.35)", borderRadius: look.cardRadius }}>{pick.images[0] ? <img src={pick.images[0]} alt="" width={480} height={480} loading="eager" /> : null}</span>
                  <span className="bq-h mt-auto text-[22px] leading-tight" style={look.headingStyle}>{pick.name}</span>
                  <span className="text-[16px] font-bold">{formatStoreMoney(pick.retailPrice, pick.currency)}{pick.compareAtPrice && pick.compareAtPrice > pick.retailPrice ? <s className="ml-2 font-normal opacity-70">{formatStoreMoney(pick.compareAtPrice, pick.currency)}</s> : null}</span>
                  <span className="inline-flex w-max items-center rounded-full px-5 py-2.5 text-[13px] font-bold" style={{ background: "#FFFFFF", color: "#1A1A1A" }}>View product</span>
                </>
              ), { color: look.onAccent }) : (
                <div className="flex h-full flex-col gap-3 p-6">
                  <span className="bq-media block flex-1" style={{ background: "rgba(255,255,255,.35)", borderRadius: look.cardRadius, minHeight: 200 }}>{picture(side)}</span>
                  <span className="bq-h text-[22px]" style={look.headingStyle}>{store.name}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "ike-deal") {
      // The second picture: the seller's next banner or product photo, else the theme's stock story photo.
      const left = pool[0];
      const right = uploaded[1] ?? stock?.story ?? pool[1];
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-6 py-10 @3xl:grid-cols-[1fr_1.25fr_1fr] @3xl:py-14">
            <div className="bq-media aspect-[4/3]" style={{ background: "transparent", borderRadius: look.cardRadius }}>{picture(left, true)}</div>
            <div className="flex flex-col items-center gap-4 text-center">
              {eyebrow ? <p className="m-0 text-[13px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.12em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[14ch] uppercase" style={{ ...look.headingStyle, fontSize: "clamp(30px, 3.8cqi, 50px)", lineHeight: 1.08 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[420px] text-[15px] uppercase" style={{ color: t.muted, letterSpacing: "0.04em" }}>{body}</p> : null}
              <div className="mt-1">{ctaButton()}</div>
            </div>
            <div className="bq-media hidden aspect-[4/3] @3xl:block" style={{ background: "transparent", borderRadius: look.cardRadius }}>{picture(right)}</div>
          </div>
        </section>
      );
    }

    if (layout === "ewu-menu") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-5">
          <div className="grid gap-6 @3xl:grid-cols-[260px_1fr]">
            <nav aria-label="Categories" className="bq-only-wide self-start border" style={{ borderColor: t.border }}>
              <p className="m-0 flex h-[60px] items-center justify-between px-5 text-[15px] font-semibold" style={{ background: t.accent, color: t.ctaText }}>Categories <Icon name="chevDown" size={14} aria-hidden /></p>
              <ul className="m-0 list-none p-0">
                {(categories.length ? categories.slice(0, 9) : []).map((category) => (
                  <li key={category.slug} className="border-t" style={{ borderColor: t.border }}>
                    <button type="button" onClick={() => shopCategory(category.slug)} className="block w-full cursor-pointer border-0 bg-transparent px-5 py-2.5 text-left text-[14px]" style={{ color: t.ink }}>{category.name}</button>
                  </li>
                ))}
                <li className="border-t" style={{ borderColor: t.border }}>
                  <button type="button" onClick={() => go("products")} className="block w-full cursor-pointer border-0 bg-transparent px-5 py-2.5 text-left text-[14px] font-semibold" style={{ color: t.ink }}>Shop all</button>
                </li>
              </ul>
            </nav>
            <div className="bq-media relative min-h-[340px] @3xl:min-h-[430px]" style={{ background: shots.length ? look.placeholder : t.heroBg, borderRadius: look.cardRadius }}>
              {picture(shots[at], true)}
              <div className="absolute inset-0" style={{ background: shots.length ? "rgba(20,20,30,.38)" : "transparent" }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-14 text-center" style={{ color: shots.length ? "#FFFFFF" : t.heroText }}>
                {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ letterSpacing: "0.14em" }}>{eyebrow}</p> : null}
                <h1 id={headingId} className="bq-h max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(32px, 4.6cqi, 58px)", lineHeight: 1.08 }}>{title}</h1>
                {body ? <p className="m-0 max-w-[440px] text-[15px] opacity-90">{body}</p> : null}
                {ctaButton()}
              </div>
              {sideArrows(shots.length, "#FFFFFF")}
            </div>
          </div>
        </section>
      );
    }

    // ─── Inspiration batch 4: Ẹ̀rín, Apẹ̀rẹ̀, Bàtà, Ọgbà, Èso ──────────────────────────────────────────
    if (layout === "erin-split") {
      const words = title.split(" ");
      const lead = words.slice(0, 2).join(" ");
      const rest = words.slice(2).join(" ");
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-6 @3xl:grid-cols-2">
            <div className="flex flex-col items-start gap-4 pb-4 pt-10 @3xl:py-20">
              {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ letterSpacing: "0.12em", color: t.muted }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0" style={{ ...look.headingStyle, fontSize: "clamp(36px, 4.8cqi, 62px)", lineHeight: 1.08 }}>
                <span className="block" style={{ color: t.accent }}>{lead}</span>
                {rest ? <span className="block">{rest}</span> : null}
              </h1>
              {body ? <p className="m-0 max-w-[440px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <div className="mt-1">{ctaButton()}</div>
            </div>
            <div className="bq-media aspect-[4/5] @3xl:aspect-[5/6]" style={{ background: "transparent", borderRadius: 0 }}>{img}</div>
          </div>
        </section>
      );
    }

    if (layout === "apere-trio") {
      // The big banner beside two small cards: the first two categories, else more pictures.
      const small = (categories.length ? categories.slice(0, 2).map((category) => ({ key: category.slug, name: category.name, image: category.imageUrl ?? undefined, onSelect: () => shopCategory(category.slug) })) : [])
        .concat(pool.slice(1, 3).map((src, i) => ({ key: `pic-${i}`, name: i === 0 ? "New in" : "Shop all", image: src, onSelect: () => go("products") })))
        .slice(0, 2);
      const tints = ["#EEF6E8", "#FBEDEB"];
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-6">
          <div className="grid gap-5 @3xl:grid-cols-[1.7fr_1fr]">
            <div className="relative grid min-h-[360px] items-center overflow-hidden @3xl:grid-cols-[1.1fr_1fr]" style={{ background: t.heroBg, borderRadius: look.cardRadius + 6 }}>
              <div className="relative z-[1] flex flex-col items-start gap-4 p-8 @3xl:p-12">
                {eyebrow ? <p className="m-0 text-[17px]" style={{ color: t.accent, fontFamily: BQ_SERIF }}>{eyebrow}</p> : null}
                <h1 id={headingId} className="bq-h m-0 max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(32px, 4cqi, 52px)", lineHeight: 1.1 }}>{title}</h1>
                {body ? <p className="m-0 max-w-[360px] text-[14.5px] leading-6" style={{ color: t.muted }}>{body}</p> : null}
                <button type="button" className="bq-btn mt-1" style={{ background: "transparent", color: t.ink, border: `1.5px solid ${t.ink}` }} onClick={() => go(action)}>{cta}</button>
              </div>
              <div className="bq-media h-full min-h-[260px]" style={{ background: "transparent", borderRadius: 0 }}>{img}</div>
            </div>
            <div className="grid gap-5">
              {small.map((card, i) => (
                <button key={card.key} type="button" onClick={card.onSelect} className="group grid min-h-[170px] cursor-pointer grid-cols-[1fr_1fr] items-center overflow-hidden border-0 p-0 text-left" style={{ background: tints[i % 2], color: t.ink, borderRadius: look.cardRadius + 6 }}>
                  <span className="flex flex-col gap-2 p-6">
                    <span className="bq-h text-[22px] leading-tight" style={look.headingStyle}>{card.name}</span>
                    <span className="text-[13px] font-semibold" style={{ color: t.muted }}>Shop collection →</span>
                  </span>
                  <span className="bq-media block h-full" style={{ background: "transparent", borderRadius: 0 }}>{picture(card.image)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "bata-full") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(0deg, rgba(255,255,255,.88), rgba(255,255,255,.2) 45%, rgba(255,255,255,0) 70%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 pb-10" style={{ color: t.ink }}>
              {eyebrow ? <p className="m-0 text-[12px] font-semibold uppercase" style={{ letterSpacing: "0.2em", color: t.accent }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 4.6cqi, 60px)", lineHeight: 1.06 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[440px] text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
              <div className="mt-1">{ctaButton()}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "ogba-slides") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      const arrow = (dir: -1 | 1) => (
        <button type="button" aria-label={dir < 0 ? "Previous picture" : "Next picture"} onClick={() => setHeroIndex((value) => (value + shots.length + dir) % shots.length)} className={`absolute top-1/2 z-[2] grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center border-0 @3xl:h-11 @3xl:w-11 ${dir < 0 ? "left-0" : "right-0"}`} style={{ background: t.accent, color: t.ctaText }}>
          <Icon name={dir < 0 ? "arrowLeft" : "chevRight"} size={20} />
        </button>
      );
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: "#FFFFFF" }}>
          <div className="bq-media inset-0" style={{ position: "absolute", borderRadius: 0, background: t.heroBg }}>{picture(shots[at], true)}</div>
          <div aria-hidden className="absolute inset-0" style={{ background: shots.length ? "rgba(0,0,0,.42)" : "transparent" }} />
          <div className="bq-wrap relative">
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-10 py-16 text-center @3xl:min-h-[560px] @3xl:px-16">
              {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ letterSpacing: "0.16em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 5.6cqi, 72px)", lineHeight: 1.06 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[520px] text-[15.5px] opacity-90">{body}</p> : null}
              <div className="mt-1">{ctaButton()}</div>
            </div>
          </div>
          {shots.length > 1 ? (
            <>
              {arrow(-1)}
              {arrow(1)}
              <div className="absolute inset-x-0 bottom-5 flex justify-center gap-2" aria-hidden>
                {shots.map((_, i) => <span key={i} className="h-3 w-3 border" style={{ borderColor: "#FFFFFF", background: i === at ? t.accent : "rgba(255,255,255,.25)" }} />)}
              </div>
            </>
          ) : null}
        </section>
      );
    }

    if (layout === "eso-search") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      const orange = "#FFB524";
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 py-10 @3xl:grid-cols-[1.25fr_1fr] @3xl:py-20">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="m-0 text-[16px] font-semibold" style={{ color: "#B7791F" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5cqi, 64px)", lineHeight: 1.06, color: "#3F7A05" }}>{title}</h1>
              {body ? <p className="m-0 max-w-[460px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <div className="mt-2 w-full max-w-[520px] rounded-full border-2 bg-white" style={{ borderColor: orange }}>{searchForm("Search fresh produce", true)}</div>
            </div>
            <div className="relative">
              <div className="bq-media aspect-[4/3]" style={{ background: orange, borderRadius: 18, border: `6px solid ${orange}` }}>{picture(shots[at], true)}</div>
              {shots.length > 1 ? (
                <>
                  <button type="button" aria-label="Previous picture" onClick={() => setHeroIndex((value) => (value + shots.length - 1) % shots.length)} className="absolute left-3 top-1/2 z-[2] grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0" style={{ background: t.accent, color: t.ctaText }}><Icon name="arrowLeft" size={18} /></button>
                  <button type="button" aria-label="Next picture" onClick={() => setHeroIndex((value) => (value + 1) % shots.length)} className="absolute right-3 top-1/2 z-[2] grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0" style={{ background: t.accent, color: t.ctaText }}><Icon name="chevRight" size={18} /></button>
                </>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    // ─── Inspiration batch 5: Ọsàn, Ìjókòó, Ìtẹ́, Kujera, Tufafi ─────────────────────────────────────
    if (layout === "osan-center") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "rgba(5,25,34,.62)" : "transparent" }} />
            <div className="bq-wrap absolute inset-0 flex flex-col items-center justify-center gap-4 text-center" style={{ color: "#FFFFFF" }}>
              {eyebrow ? <p className="m-0 text-[13px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.3em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.4cqi, 68px)", lineHeight: 1.08 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[520px] text-[15.5px] opacity-90">{body}</p> : null}
              <div className="mt-1 flex flex-wrap justify-center gap-3">
                {ctaButton()}
                {pageTypes.has("contact") ? <button type="button" className="bq-btn" style={{ background: "transparent", color: "#FFFFFF", border: `1.5px solid ${t.accent}` }} onClick={() => go("contact")}>Contact us</button> : null}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "ijokoo-cutout") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 py-12 @3xl:grid-cols-[1fr_1.05fr] @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="m-0 text-[15px]" style={{ color: t.muted }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 4.6cqi, 58px)", lineHeight: 1.1 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[440px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <div className="mt-1 flex flex-wrap items-center gap-5">
                {ctaButton()}
                {pageTypes.has("about") ? <button type="button" onClick={() => go("about")} className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold" style={{ color: t.accent }}>More info</button> : null}
              </div>
            </div>
            <div className="relative">
              <div aria-hidden className="absolute -right-6 -top-6 h-40 w-40 opacity-60" style={{ backgroundImage: `radial-gradient(${t.border} 2px, transparent 2px)`, backgroundSize: "16px 16px" }} />
              <div className="bq-media relative aspect-[5/4]" style={{ background: "transparent", borderRadius: look.cardRadius }}>{picture(shots[at], true)}</div>
              {shots.length > 1 ? (
                <div className="mt-4 flex justify-center gap-2">
                  {shots.map((_, i) => (
                    <button key={i} type="button" aria-label={`Picture ${i + 1}`} aria-pressed={i === at} onClick={() => setHeroIndex(i)} className="h-2.5 cursor-pointer rounded-full border-0 p-0 transition-all" style={{ width: i === at ? 26 : 10, background: i === at ? t.accent : t.border }} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "ite-green") {
      return (
        <section aria-labelledby={headingId} className="relative" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-end gap-6 pt-12 @3xl:grid-cols-[1fr_1.2fr] @3xl:pt-16">
            <div className="flex flex-col items-start gap-4 pb-10 @3xl:pb-24">
              <h1 id={headingId} className="bq-h m-0 max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 4.8cqi, 60px)", lineHeight: 1.08 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[420px] text-[15px] leading-7 opacity-80">{body}</p> : null}
              <div className="mt-1 flex flex-wrap gap-3">
                {ctaButton()}
                <button type="button" className="bq-btn" style={{ background: "transparent", color: "#FFFFFF", border: "1.5px solid rgba(255,255,255,.45)" }} onClick={() => go("products")}>Explore</button>
              </div>
            </div>
            <div className="relative @3xl:-mb-16">
              <div aria-hidden className="absolute right-6 top-0 h-28 w-40 opacity-70" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.35) 2px, transparent 2px)", backgroundSize: "16px 16px" }} />
              <div className="bq-media relative aspect-[4/3]" style={{ background: "transparent", borderRadius: look.cardRadius + 6 }}>{img}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "kujera-slides") {
      // The first products with a photo as slides; without products the banner shows the picture and the words.
      const slideProducts = products.filter((product) => product.images[0]).slice(0, 3);
      const count = slideProducts.length || 1;
      const at = heroIndex % count;
      const product = slideProducts[at];
      const saving = product?.compareAtPrice && product.compareAtPrice > product.retailPrice ? Math.round((1 - product.retailPrice / product.compareAtPrice) * 100) : null;
      return (
        <section aria-labelledby={headingId} className="relative" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 py-10 @3xl:grid-cols-[1.2fr_1fr] @3xl:py-16">
            <div className="bq-media aspect-[4/3]" style={{ background: "transparent", borderRadius: 0 }}>{picture(product?.images[0] ?? image, true)}</div>
            <div className="flex flex-col items-start gap-4">
              {saving ? <p className="m-0 text-[28px] font-semibold" style={{ color: t.accent }}>{saving}% off</p> : eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ color: t.accent, letterSpacing: "0.14em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0" style={{ ...look.headingStyle, fontSize: "clamp(32px, 4cqi, 52px)", lineHeight: 1.08 }}>{product ? product.name : title}</h1>
              {product?.description || body ? <p className="m-0 line-clamp-3 max-w-[420px] text-[15px] leading-7" style={{ color: t.muted }}>{product?.description || body}</p> : null}
              {product ? <p className="m-0 text-[22px] font-semibold">{formatStoreMoney(product.retailPrice, product.currency)}</p> : null}
              {product ? linkToProduct(product, "inline-flex items-center border-0 border-b-2 pb-1 text-[15px] font-semibold", <>{cta} <span aria-hidden className="ml-2">→</span></>, { borderColor: t.ink }) : ctaButton()}
              {slideProducts.length > 1 ? (
                <div className="mt-3 flex gap-2">
                  <button type="button" aria-label="Previous product" onClick={() => setHeroIndex((value) => (value + count - 1) % count)} className="grid h-11 w-11 cursor-pointer place-items-center border" style={{ borderColor: t.ink, background: "transparent", color: t.ink }}><Icon name="arrowLeft" size={18} /></button>
                  <button type="button" aria-label="Next product" onClick={() => setHeroIndex((value) => (value + 1) % count)} className="grid h-11 w-11 cursor-pointer place-items-center border-0" style={{ background: t.ink, color: "#FFFFFF" }}><Icon name="chevRight" size={18} /></button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "tufafi-mosaic") {
      // A big picture beside four category tiles (collections, else categories; pictures fill in when there are fewer).
      const fromCategories = (shopper.collections.length
        ? shopper.collections.map((collection) => ({ key: collection.id, name: collection.name, image: collection.imageUrl ?? products.find((entry) => collection.productIds.includes(entry.id))?.images[0], onSelect: () => shopCollection(collection.id) }))
        : categories.map((category) => ({ key: category.slug, name: category.name, image: category.imageUrl ?? undefined, onSelect: () => shopCategory(category.slug) })));
      // Spare tiles take stock pictures first, then product photos the category tiles don't already show.
      const shown = new Set([image, ...fromCategories.map((tile) => tile.image)]);
      const spare = [...new Set([...(stock && !uploaded.length ? [stock.story, ...stock.extras] : []), ...uploaded.slice(1), ...fromProducts])].filter((src) => !shown.has(src));
      const tiles = [...fromCategories, ...spare.map((src, i) => ({ key: `pic-${i}`, name: "", image: src, onSelect: () => go("products") }))].slice(0, 4);
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-5">
          <div className="grid gap-4 @3xl:grid-cols-2">
            <div className="bq-media relative min-h-[360px] @3xl:min-h-[520px]" style={{ background: image ? look.placeholder : t.heroBg, borderRadius: look.cardRadius }}>
              {img}
              <div className="absolute inset-0" style={{ background: image ? "rgba(0,0,0,.42)" : "transparent" }} />
              <div className="absolute inset-0 flex flex-col items-start justify-center gap-4 p-8 @3xl:p-12" style={{ color: "#FFFFFF" }}>
                {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ letterSpacing: "0.16em" }}>{eyebrow}</p> : null}
                <h1 id={headingId} className="bq-h m-0 max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 4.4cqi, 56px)", lineHeight: 1.06 }}>{title}</h1>
                {body ? <p className="m-0 max-w-[380px] text-[15px] italic opacity-90">{body}</p> : null}
                <button type="button" className="bq-btn" style={{ background: "transparent", color: "#FFFFFF", border: "1.5px solid #FFFFFF" }} onClick={() => go(action)}>{cta}</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {tiles.map((tile) => (
                <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative block min-h-[170px] cursor-pointer overflow-hidden border-0 p-0" style={{ background: look.placeholder, borderRadius: look.cardRadius }}>
                  <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={500} height={500} loading="eager" className="transition duration-500 group-hover:scale-[1.06]" /> : null}</span>
                  <span className="absolute inset-0 transition group-hover:bg-black/55" style={{ background: tile.name ? "rgba(0,0,0,.28)" : "transparent" }} />
                  {tile.name ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white">
                      <span className="bq-h text-[22px] font-bold" style={look.headingStyle}>{tile.name}</span>
                      <span className="translate-y-2 border border-white px-4 py-1.5 text-[12px] font-semibold opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">Shop now</span>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    // ─── Inspiration batch 6: Rẹ̀wà, Ìgbésẹ̀, Ọlá, Ọkùnrin, Sálúbàtà ────────────────────────────────
    if (layout === "rewa-trends") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: "#FFFFFF" }}>
          <div className="bq-media inset-0" style={{ position: "absolute", borderRadius: 0, background: t.heroBg }}>{picture(shots[at], true)}</div>
          <div aria-hidden className="absolute inset-0" style={{ background: shots.length ? "linear-gradient(90deg, rgba(0,0,0,.5), rgba(0,0,0,.15) 60%)" : "transparent" }} />
          <div className="bq-wrap relative flex min-h-[440px] flex-col items-start justify-end gap-4 pb-14 pt-24 @3xl:min-h-[600px]">
            {eyebrow ? <p className="m-0 text-[12px] font-semibold" style={{ letterSpacing: "0.04em" }}>* {eyebrow}</p> : null}
            <h1 id={headingId} className="bq-h m-0 max-w-[14ch] uppercase" style={{ ...look.headingStyle, fontWeight: 800, fontSize: "clamp(40px, 6.4cqi, 88px)", lineHeight: 0.98 }}>{title}</h1>
            {body ? <p className="m-0 max-w-[460px] text-[15px] opacity-90">{body}</p> : null}
            <button type="button" className="bq-btn mt-1" style={{ background: "transparent", color: "#FFFFFF", border: "2px solid #FFFFFF", textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 }} onClick={() => go(action)}>{cta}</button>
          </div>
          {shots.length > 1 ? (
            <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col gap-2 @3xl:left-4 @3xl:right-auto">
              {shots.map((_, i) => <button key={i} type="button" aria-label={`Picture ${i + 1}`} aria-pressed={i === at} onClick={() => setHeroIndex(i)} className="h-2.5 w-2.5 cursor-pointer rounded-full border-0 p-0" style={{ background: i === at ? t.accent : "#FFFFFF" }} />)}
            </div>
          ) : null}
        </section>
      );
    }

    if (layout === "igbese-stripes") {
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.paperBg, color: t.ink }}>
          <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[58%] @3xl:block" style={{ background: `linear-gradient(135deg, #FFC400, ${t.accent})`, clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)" }} />
          <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[58%] @3xl:block" style={{ backgroundImage: "repeating-linear-gradient(120deg, transparent 0 70px, rgba(255,255,255,.85) 70px 86px, transparent 86px 170px)", clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)", opacity: 0.6 }} />
          <div className="bq-wrap relative grid items-center gap-8 py-12 @3xl:grid-cols-[1fr_1.2fr] @3xl:py-20">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="m-0 text-[13px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.12em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 4.8cqi, 62px)", lineHeight: 1.06 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[420px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" onClick={() => go(action)} className="mt-1 inline-flex cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-[13px] font-bold uppercase" style={{ color: t.ink, letterSpacing: "0.06em" }}>
                <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full" style={{ background: t.accent, color: t.ctaText }}><Icon name="chevRight" size={18} /></span>
                {cta}
              </button>
            </div>
            <div className="bq-media aspect-[4/3]" style={{ background: "transparent", borderRadius: look.cardRadius + 6, boxShadow: "0 30px 60px rgba(0,0,0,.18)" }}>{img}</div>
          </div>
        </section>
      );
    }

    if (layout === "ola-duo") {
      // The heading over two photos labelled with the first two categories ("For her" and "For him" in the template).
      const second = uploaded[1] ?? stock?.story ?? pool[1];
      const labels = categories.slice(0, 2);
      const half = (src: string | undefined, i: number) => {
        const category = labels[i];
        return (
          <button key={i} type="button" onClick={() => (category ? shopCategory(category.slug) : go(action))} className="group relative block aspect-[4/5] cursor-pointer overflow-hidden border-0 p-0 @3xl:aspect-[5/6]" style={{ background: look.placeholder }}>
            <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{src ? <img src={src} alt="" width={800} height={960} loading="eager" className="transition duration-700 group-hover:scale-[1.04]" /> : null}</span>
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-7 py-2.5 text-[13px] font-semibold" style={{ background: "#FFFFFF", color: "#222" }}>{category?.name ?? cta}</span>
          </button>
        );
      };
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.paperBg, color: t.ink }}>
          <div className="bq-wrap relative py-12 text-center @3xl:py-16">
            {eyebrow ? <p className="m-0 text-[17px] @3xl:text-[20px]" style={{ color: t.muted }}>{eyebrow}</p> : null}
            <h1 id={headingId} className="bq-h m-0 mt-2" style={{ ...look.headingStyle, fontSize: "clamp(32px, 4.4cqi, 54px)", lineHeight: 1.1 }}>{title}</h1>
            {body ? <p className="mx-auto mt-3 max-w-[520px] text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
            <div className="mt-8 grid grid-cols-2 gap-0">{half(image, 0)}{half(second, 1)}</div>
          </div>
        </section>
      );
    }

    if (layout === "okunrin-circle") {
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.ink }}>
          <div className="bq-wrap grid items-center gap-8 pt-10 @3xl:grid-cols-2 @3xl:pt-0">
            <div className="flex flex-col items-start gap-4 @3xl:py-24">
              {eyebrow ? <p className="m-0 text-[12.5px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.18em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 4.6cqi, 58px)", lineHeight: 1.1 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[400px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" className="bq-btn mt-2" style={{ ...look.primaryButton, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12.5, fontWeight: 700 }} onClick={() => go(action)}>{cta} <span aria-hidden className="ml-2">→</span></button>
            </div>
            <div className="relative mx-auto w-full max-w-[520px] self-end">
              <div aria-hidden className="absolute left-[8%] top-[6%] aspect-square w-[78%] rounded-full" style={{ background: "#F6D9D2" }} />
              <div aria-hidden className="absolute right-0 top-[4%] h-28 w-36" style={{ backgroundImage: "radial-gradient(#FFFFFF 2.5px, transparent 2.5px)", backgroundSize: "14px 14px" }} />
              <div aria-hidden className="absolute bottom-[12%] left-0 h-24 w-28" style={{ backgroundImage: `radial-gradient(${t.ink}33 2px, transparent 2px)`, backgroundSize: "14px 14px" }} />
              <div className="bq-media relative mx-auto aspect-[4/5] w-[78%]" style={{ background: "transparent", borderRadius: "999px 999px 0 0" }}>{img}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "salubata-cutout") {
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 py-12 @3xl:grid-cols-[1fr_1.15fr] @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="m-0 px-2.5 py-1 text-[12px] font-semibold uppercase" style={{ background: "#111111", color: t.heroBg, letterSpacing: "0.14em" }}>#{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[14ch] uppercase" style={{ ...look.headingStyle, fontWeight: 300, fontSize: "clamp(34px, 4.4cqi, 56px)", lineHeight: 1.1 }}>{title}</h1>
              {body ? <p className="m-0 max-w-[420px] text-[15px] leading-7" style={{ opacity: 0.8 }}>{body}</p> : null}
              <div className="mt-1">{ctaButton()}</div>
            </div>
            <div className="bq-media aspect-[4/3]" style={{ background: "transparent", borderRadius: 0 }}>{img}</div>
          </div>
        </section>
      );
    }

    // ─── Inspiration batch 7: Ẹ̀fọ́, Àlùkò, Ajá, Dára, Ìfẹ́ ──────────────────────────────────────────
    if (layout === "efo-full") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "rgba(0,0,0,.32)" : "transparent" }} />
            <div className="bq-wrap absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white">
              <h1 id={headingId} className="m-0 max-w-[18ch] uppercase" style={{ fontFamily: look.headingFont, fontWeight: 300, letterSpacing: "0.06em", fontSize: "clamp(38px, 6cqi, 84px)", lineHeight: 1.04, textShadow: "0 2px 16px rgba(0,0,0,.35)" }}>{title}</h1>
              {eyebrow ? <p className="m-0 text-[12.5px] font-semibold uppercase" style={{ letterSpacing: "0.3em" }}>{eyebrow}</p> : null}
              {body ? <p className="m-0 max-w-[480px] text-[15px] opacity-90">{body}</p> : null}
              <div className="mt-2">{ctaButton()}</div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "aluko-lookbook") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      const [first, ...rest] = title.split(" ");
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: "#FFFFFF" }}>
          <div className="bq-media inset-0" style={{ position: "absolute", borderRadius: 0, background: t.heroBg }}>{picture(shots[at], true)}</div>
          <div aria-hidden className="absolute inset-0" style={{ background: shots.length ? "rgba(0,0,0,.36)" : "transparent" }} />
          <div className="bq-wrap relative">
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-12 py-16 text-center @3xl:min-h-[560px]">
              {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ letterSpacing: "0.2em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="m-0" style={{ fontFamily: look.headingFont, fontSize: "clamp(40px, 6.4cqi, 92px)", lineHeight: 1 }}>
                <span className="block font-bold">{first}</span>
                {rest.length ? <span className="block font-light">{rest.join(" ")}.</span> : null}
              </h1>
              {body ? <p className="m-0 max-w-[460px] text-[15px] opacity-90">{body}</p> : null}
              <button type="button" className="bq-btn mt-2" style={{ background: "transparent", color: "#FFFFFF", border: "2px solid #FFFFFF", textTransform: "uppercase", fontSize: 12, letterSpacing: "0.12em" }} onClick={() => go(action)}>{cta}</button>
            </div>
          </div>
          {sideArrows(shots.length, "#FFFFFF")}
        </section>
      );
    }

    if (layout === "aja-circle") {
      const words = title.split(" ");
      const tail = words.length > 2 ? words.slice(-2).join(" ") : "";
      const lead = tail ? words.slice(0, -2).join(" ") : title;
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid items-center gap-8 py-12 @3xl:grid-cols-2 @3xl:py-16">
            <div className="relative mx-auto w-full max-w-[460px]">
              <div aria-hidden className="absolute inset-[6%] rounded-full" style={{ background: "#EFE2D2" }} />
              <div className="bq-media relative aspect-square rounded-full" style={{ background: "transparent" }}>{img}</div>
            </div>
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ color: t.accent, letterSpacing: "0.16em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h m-0 max-w-[13ch]" style={{ ...look.headingStyle, fontSize: "clamp(38px, 5cqi, 66px)", lineHeight: 1.1 }}>
                {lead} {tail ? <span style={{ color: t.accent }}>{tail}</span> : null}
              </h1>
              {body ? <p className="m-0 max-w-[420px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" className="bq-btn mt-1" style={{ background: "transparent", color: t.ink, border: `1.5px solid ${t.ink}`, textTransform: "uppercase", fontSize: 12.5, letterSpacing: "0.08em" }} onClick={() => go(action)}>{cta} <span aria-hidden className="ml-2">→</span></button>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "dara-split") {
      const words = title.split(" ");
      return (
        <section aria-labelledby={headingId} className="relative" style={{ background: t.paperBg, color: t.ink }}>
          <div className="grid @3xl:grid-cols-2">
            <div className="relative flex flex-col items-start justify-center gap-4 px-6 py-14 @3xl:min-h-[600px] @3xl:pl-24 @3xl:pr-12">
              {eyebrow ? <p aria-hidden className="absolute bottom-24 left-6 m-0 hidden origin-left -rotate-90 text-[11px] uppercase @3xl:block" style={{ color: t.muted, letterSpacing: "0.24em" }}>{eyebrow}</p> : null}
              {eyebrow ? <p className="m-0 text-[11.5px] uppercase" style={{ color: t.muted, letterSpacing: "0.24em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="m-0 max-w-[12ch]" style={{ fontFamily: look.headingFont, fontWeight: 300, fontSize: "clamp(34px, 4.4cqi, 56px)", lineHeight: 1.12 }}>
                {words.map((word, i) => <span key={i} style={{ fontWeight: i === words.length - 2 ? 700 : 300 }}>{word}{i < words.length - 1 ? " " : ""}</span>)}
              </h1>
              {body ? <p className="m-0 max-w-[400px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <div className="mt-1">{ctaButton({ ...look.primaryButton, boxShadow: `0 10px 24px ${t.accent}55` })}</div>
            </div>
            <div className="bq-media min-h-[380px] @3xl:min-h-[600px]" style={{ borderRadius: 0, background: image ? look.placeholder : t.cardBg }}>{img}</div>
          </div>
        </section>
      );
    }

    if (layout === "ife-split") {
      // Two photos side by side, each with a label box; the title sits over the right one, the eyebrow over the left.
      const second = uploaded[1] ?? stock?.story ?? pool[1];
      const half = (src: string | undefined, label: string, big: boolean, right: boolean) => (
        <div className="bq-media relative min-h-[320px] @3xl:min-h-[560px]" style={{ borderRadius: 0, background: look.placeholder }}>
          {picture(src, true)}
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.18)" }} />
          <div className={`absolute bottom-[22%] ${right ? "left-6 @3xl:left-10" : "right-0"} flex flex-col items-start gap-3`}>
            {label ? (big
              ? <h1 id={headingId} className="m-0 px-5 py-3 uppercase" style={{ background: "rgba(42,37,34,.82)", color: "#FFFFFF", fontFamily: look.headingFont, fontWeight: 400, letterSpacing: "0.04em", fontSize: "clamp(28px, 3.6cqi, 46px)" }}>{label}</h1>
              : <p className="m-0 px-5 py-3 uppercase" style={{ background: "rgba(42,37,34,.82)", color: "#FFFFFF", fontFamily: look.headingFont, letterSpacing: "0.04em", fontSize: "clamp(22px, 2.6cqi, 34px)" }}>{label}</p>) : null}
            {big ? <button type="button" className="bq-btn" style={{ background: "#FFFFFF", color: t.ink, border: "1.5px solid #FFFFFF", textTransform: "uppercase", fontSize: 12, letterSpacing: "0.12em" }} onClick={() => go(action)}>{cta}</button> : null}
          </div>
        </div>
      );
      return (
        <section aria-label={title}>
          <div className="grid @3xl:grid-cols-2">
            {half(image, eyebrow, false, false)}
            {half(second, title, true, true)}
          </div>
        </section>
      );
    }

    // ─── Inspiration batch 8: Ìrọ̀rùn ────────────────────────────────────────────────────────────────
    if (layout === "irorun-bold") {
      const shots = pool.slice(0, 3);
      const at = shots.length ? heroIndex % shots.length : 0;
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-media inset-0" style={{ position: "absolute", borderRadius: 0, background: t.heroBg }}>{picture(shots[at], true)}</div>
          {/* Phones: an even wash over the whole photo; wider screens: a fade behind the words on the left. */}
          <div aria-hidden className="absolute inset-0 @3xl:hidden" style={{ background: shots.length ? "rgba(236,236,236,.78)" : "transparent" }} />
          <div aria-hidden className="absolute inset-0 hidden @3xl:block" style={{ background: shots.length ? "linear-gradient(90deg, rgba(236,236,236,.92), rgba(236,236,236,.55) 40%, rgba(236,236,236,0) 62%)" : "transparent" }} />
          <div className="bq-wrap relative">
            <div className="flex min-h-[420px] flex-col items-start justify-center gap-4 px-10 py-16 @3xl:min-h-[580px] @3xl:px-0">
              {eyebrow ? <p className="m-0 text-[13px] font-semibold uppercase" style={{ letterSpacing: "0.14em", color: t.muted }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="m-0 max-w-[9ch]" style={{ fontFamily: look.headingFont, fontWeight: 800, fontSize: "clamp(44px, 6.4cqi, 88px)", lineHeight: 0.98, letterSpacing: "-0.03em" }}>{title}</h1>
              {body ? <p className="m-0 max-w-[400px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" className="bq-btn mt-2" style={{ background: "#FFFFFF", color: t.ink, border: "1.5px solid #FFFFFF", textTransform: "uppercase", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em" }} onClick={() => go(action)}>{cta} <span aria-hidden className="ml-2">→</span></button>
            </div>
          </div>
          {sideArrows(shots.length, t.ink)}
        </section>
      );
    }

    if (layout === "adire-banner") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : "#9A928A" }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "rgba(20,12,6,.38)" : "transparent" }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-10 text-center text-white">
              {eyebrow ? <p className="text-[12px] uppercase" style={{ letterSpacing: "0.22em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[980px]" style={{ ...look.headingStyle, fontWeight: 500, fontSize: "clamp(34px, 6cqi, 72px)", lineHeight: 1.04 }}>{title}</h1>
              {body ? <p className="max-w-[560px] text-[15px] opacity-90">{body}</p> : null}
              <button type="button" className="bq-btn mt-1" style={{ background: "transparent", color: "#fff", border: "1.5px solid #fff", borderRadius: 999 }} onClick={() => go(action)}>{cta}</button>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "pantry-split") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-4">
          <div className="bq-split-hero overflow-hidden" style={{ borderRadius: look.cardRadius + 8 }}>
            <div className="flex flex-col justify-center gap-4 px-6 py-10 @3xl:px-12" style={{ background: t.heroBg, color: t.heroText }}>
              {eyebrow ? <p className="text-[13px] font-bold uppercase" style={{ letterSpacing: "0.14em", opacity: 0.85 }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(38px, 6.5cqi, 76px)", lineHeight: 0.98 }}>{title}</h1>
              {body ? <p className="max-w-[460px] text-[16px] opacity-90">{body}</p> : null}
              <div>
                <button type="button" className="bq-btn" style={look.secondaryButton} onClick={() => go(action)}>{cta}</button>
              </div>
            </div>
            <div className="bq-media" style={{ aspectRatio: "4 / 3", minHeight: "100%" }}>{img}</div>
          </div>
        </section>
      );
    }

    if (layout === "ile-calm") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap pb-4 pt-12 @3xl:pt-20">
          <div className="grid gap-5 @3xl:grid-cols-[1.2fr_1fr] @3xl:items-end">
            <div>
              {eyebrow ? <p className="text-[12.5px] uppercase" style={{ letterSpacing: "0.2em", color: t.muted }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h mt-3 max-w-[14ch]" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.5cqi, 68px)", lineHeight: 1.04 }}>{title}</h1>
            </div>
            <div className="flex flex-col items-start gap-4">
              {body ? <p className="max-w-[440px] text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" className="bq-btn" style={look.secondaryButton} onClick={() => go(action)}>{cta}</button>
            </div>
          </div>
          <div className="bq-media mt-10" style={{ aspectRatio: "16 / 9", borderRadius: look.cardRadius }}>{img}</div>
        </section>
      );
    }

    if (layout === "plug-spotlight") {
      return (
        <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
          <div className="bq-wrap grid gap-8 py-12 @3xl:grid-cols-2 @3xl:items-center @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              {eyebrow ? <p className="text-[12px] uppercase" style={{ fontFamily: look.eyebrowFont, color: t.accent, letterSpacing: "0.16em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(36px, 5.5cqi, 66px)", lineHeight: 1.02 }}>{title}</h1>
              {body ? <p className="max-w-[480px] text-[15.5px]" style={{ color: t.muted }}>{body}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button type="button" className="bq-btn" style={look.primaryButton} onClick={() => go(action)}>{cta}</button>
              </div>
            </div>
            <div className="relative grid place-items-center" style={{ aspectRatio: "1 / 1", borderRadius: look.cardRadius, background: `radial-gradient(circle at 50% 45%, ${t.accent}40, transparent 62%), ${t.cardBg}`, border: `1px solid ${t.border}` }}>
              {image ? <img src={image} alt="" width={900} height={900} loading="eager" fetchPriority="high" decoding="async" className="h-[78%] w-[78%] object-contain" /> : <Icon name="image" size={40} color={t.border} />}
            </div>
          </div>
        </section>
      );
    }

    if (layout === "stride-loud") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: image ? look.placeholder : t.heroBg }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,0) 55%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-start gap-4 pb-8 text-white">
              {eyebrow ? <p className="px-3 py-1 text-[12px] font-extrabold uppercase" style={{ background: image ? t.accent : t.ink, letterSpacing: "0.14em" }}>{eyebrow}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(46px, 10cqi, 140px)", lineHeight: 0.9 }}>{title}</h1>
              {body ? <p className="max-w-[480px] text-[15.5px] font-medium opacity-90">{body}</p> : null}
              <button type="button" className="bq-btn" style={{ background: "#fff", color: t.ink, border: "1.5px solid #fff", borderRadius: 999, textTransform: "uppercase", fontWeight: 800 }} onClick={() => go(action)}>{cta}</button>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "noir-center") {
      return (
        <section aria-labelledby={headingId}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: look.placeholder }}>
            {img}
            <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.55)" }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
              {text(copy.eyebrow) ? <p className="text-[11.5px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.22em" }}>{text(copy.eyebrow)}</p> : null}
              <h1 id={headingId} className="bq-h max-w-[900px]" style={{ ...look.headingStyle, fontSize: "clamp(30px, 6cqi, 60px)" }}>{title}</h1>
              {body ? <p className="max-w-[560px] text-[15px] opacity-90">{body}</p> : null}
              <button type="button" className="bq-btn" style={look.primaryButton} onClick={() => go(action)}>{cta}</button>
            </div>
          </div>
        </section>
      );
    }

    if (layout === "plain-slides") {
      // Each slide carries its own picture or video, words and button (older saves share the section's words).
      // No slides yet: the product photos rotate under the section's words, as before.
      const own = readHeroSlides(section);
      const sliderSlides: HeroSlide[] = own.length
        ? own
        : (slides.length ? slides : [""]).map((src) => ({
            mediaUrl: src,
            mediaType: src ? "image" : "none",
            alt: "",
            heading: title,
            text: body,
            buttonLabel: cta,
            link: readSlideLink(undefined, section.settings),
            textTone: src ? "light" : "dark",
            textPosition: "left",
          }));
      const openLink = (link: SlideLink) => {
        if (link.type === "product") {
          if (link.value) openProduct(link.value);
          return;
        }
        if (link.type === "url") {
          if (live && link.value) window.location.href = link.value;
          return;
        }
        go(link.value || "products");
      };
      return (
        <HeroSlider
          slides={sliderSlides}
          timing={readSlideTiming(section.settings)}
          label={title}
          emptyBackground={look.placeholder}
          slideClassName="bq-hero"
          renderOverlay={(slide, i) => {
            const light = slide.textTone === "light" && slide.mediaType !== "none";
            const align = slideAlign(slide.textPosition);
            const Heading = i === 0 ? "h1" : "h2";
            const productLink = slide.link.type === "product" && slide.link.value ? productHref(slide.link.value) : undefined;
            const buttonStyle: React.CSSProperties = light ? { background: "#fff", color: "#111", border: "1.5px solid #fff" } : look.primaryButton;
            return (
              <>
                <div className="absolute inset-0" style={{ background: slide.mediaType === "none" ? "transparent" : light ? "linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,0) 62%)" : "linear-gradient(to top, rgba(255,255,255,.78), rgba(255,255,255,0) 62%)" }} />
                <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col pb-14" style={{ color: light ? "#fff" : t.ink, alignItems: align.items, textAlign: align.text }}>
                  {slide.heading ? <Heading id={i === 0 ? headingId : undefined} className="bq-h" style={{ ...look.headingStyle, fontSize: "clamp(32px, 5cqi, 52px)" }}>{slide.heading}</Heading> : null}
                  {slide.text ? <p className="mt-2 max-w-[520px] text-[15px] opacity-90">{slide.text}</p> : null}
                  {slide.buttonLabel ? (
                    productLink || (live && slide.link.type === "url" && slide.link.value)
                      ? <a className="bq-btn mt-4" style={buttonStyle} href={productLink ?? slide.link.value}>{slide.buttonLabel}</a>
                      : <button type="button" className="bq-btn mt-4" style={buttonStyle} onClick={() => openLink(slide.link)}>{slide.buttonLabel}</button>
                  ) : null}
                </div>
              </>
            );
          }}
        />
      );
    }

    return (
      <section aria-labelledby={headingId} className="pt-3.5 bq-hero-wrap">
        <div className="bq-hero bq-media" style={{ background: image ? look.placeholder : t.heroBg }}>
          {img}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.05) 65%)" }} />
          {/* Phones: inset inside the rounded card. Wider: lines up with the header via bq-wrap. */}
          <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 py-6 text-white">
            <h1 id={headingId} className="bq-h max-w-[760px]" style={{ fontWeight: 700, letterSpacing: "-0.03em", fontSize: "clamp(32px, 6cqi, 68px)", lineHeight: 1.02 }}>{title}</h1>
            {body ? <p className="max-w-[520px] text-[15px] opacity-90">{body}</p> : null}
            <button type="button" className="bq-btn" style={{ ...look.primaryButton, borderRadius: 999 }} onClick={() => go(action)}>{cta}</button>
          </div>
        </div>
      </section>
    );
  }

  /**
   * The title banner at the top of an inner page (Ìtura, Imani, Gèlè): the page's name with a "Home / page" trail,
   * on a tinted band with a product photo, across a photo, or plain with a rule under it.
   */
  function pageHeader(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const layout = text(section.settings?.layout) || "tinted";
    const pageTitle = snapshot.pages.find((entry) => entry.pageType === current)?.title ?? "";
    const title = text(copy.title) || pageTitle || store.name;
    const body = text(copy.body);
    const headingId = `${uid}-${section.id}`;
    const uploaded = itemImages(section)[0];
    const crumbs = (color: string) => (
      <nav aria-label="Breadcrumb" className="text-[13px]" style={{ color }}>
        <button type="button" onClick={() => go("home")} className="cursor-pointer border-0 bg-transparent p-0 underline-offset-4 hover:underline" style={{ color: "inherit" }}>Home</button>
        <span aria-hidden className="px-2">/</span>
        <span aria-current="page">{title}</span>
      </nav>
    );
    if (layout === "photo") {
      const photo = uploaded ?? (section.settings?.stockImage === false ? undefined : stockImages?.hero) ?? products[0]?.images[0];
      return (
        <section aria-labelledby={headingId} className="bq-media" style={{ background: t.heroBg }}>
          <div className="aspect-[16/7] @3xl:aspect-[16/3]" />
          {photo ? <img src={photo} alt="" width={1600} height={300} loading="eager" decoding="async" /> : null}
          <div className="absolute inset-0" style={{ background: photo ? "linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,.1))" : "transparent" }} />
          <div className="bq-wrap absolute inset-x-0 bottom-0 flex flex-col gap-2 pb-6 text-white @3xl:pb-8">
            <h1 id={headingId} className="bq-h text-[30px] @3xl:text-[40px]" style={{ ...look.headingStyle, color: "#fff" }}>{title}</h1>
            {body ? <p className="m-0 max-w-[560px] text-[15px] opacity-90">{body}</p> : null}
            {crumbs("rgba(255,255,255,.85)")}
          </div>
        </section>
      );
    }
    if (layout === "simple") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap border-b pb-6 pt-8" style={{ borderColor: t.border }}>
          {crumbs(t.muted)}
          <h1 id={headingId} className="bq-h mt-3 text-[30px] @3xl:text-[38px]" style={look.headingStyle}>{title}</h1>
          {body ? <p className="m-0 mt-2 max-w-[600px] text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
        </section>
      );
    }
    const picture = uploaded ?? products[0]?.images[0];
    return (
      <section aria-labelledby={headingId} style={{ background: look.raised }}>
        <div className="bq-wrap grid items-center gap-6 py-8 @3xl:min-h-[220px] @3xl:grid-cols-[1fr_auto] @3xl:py-6">
          <div className="flex flex-col gap-3">
            <h1 id={headingId} className="bq-h text-[32px] @3xl:text-[42px]" style={look.headingStyle}>{title}</h1>
            {body ? <p className="m-0 max-w-[560px] text-[15px]" style={{ color: t.muted }}>{body}</p> : null}
            {crumbs(t.muted)}
          </div>
          {picture ? (
            <div className="bq-media hidden h-[200px] w-[260px] @3xl:block" style={{ borderRadius: look.cardRadius, background: "transparent" }}>
              <img src={picture} alt="" width={520} height={400} loading="eager" decoding="async" />
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function categoryTiles(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const tiles = shopper.collections.length
      ? shopper.collections.map((collection) => ({
          key: collection.id,
          name: collection.name,
          image: collection.imageUrl ?? products.find((product) => collection.productIds.includes(product.id))?.images[0] ?? null,
          count: collection.productIds.length,
          onSelect: () => shopCollection(collection.id),
        }))
      : categories.map((category) => ({ key: category.slug, name: category.name, image: category.imageUrl, count: category.count, onSelect: () => shopCategory(category.slug) }));
    if (!tiles.length) return editorHint("Category tiles appear once your products have categories or you create collections.");
    const headingId = `${uid}-${section.id}`;
    if (section.settings?.layout === "boutique-bold") {
      // One big card and two stacked ones, the names in huge black letters with a full stop (Ìrọ̀rùn).
      const [big, ...rest] = tiles;
      const card = (tile: (typeof tiles)[number], large: boolean) => (
        <button key={tile.key} type="button" onClick={tile.onSelect} className={`group relative block cursor-pointer overflow-hidden border-0 p-0 text-left ${large ? "min-h-[360px] @3xl:min-h-[520px]" : "min-h-[220px] @3xl:min-h-0"}`} style={{ background: "#ECECEC", color: t.ink, borderRadius: look.cardRadius }}>
          <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={large ? 900 : 600} height={large ? 900 : 400} loading="lazy" className="transition duration-700 group-hover:scale-[1.04]" /> : null}</span>
          <span aria-hidden className="absolute inset-0" style={{ background: large ? "linear-gradient(270deg, rgba(240,240,240,.92), rgba(240,240,240,.4) 45%, rgba(240,240,240,0) 65%)" : "linear-gradient(90deg, rgba(240,240,240,.9), rgba(240,240,240,.2) 60%)" }} />
          <span className={`absolute flex flex-col gap-2 ${large ? "right-8 top-1/2 -translate-y-1/2 items-start @3xl:right-12" : "left-6 top-1/2 -translate-y-1/2"}`}>
            <span className="text-[11px] font-semibold uppercase" style={{ color: t.muted, letterSpacing: "0.16em" }}>{tile.count} {tile.count === 1 ? "product" : "products"}</span>
            <span className="max-w-[8ch]" style={{ fontFamily: look.headingFont, fontWeight: 800, fontSize: large ? "clamp(40px, 5cqi, 64px)" : "clamp(28px, 3cqi, 38px)", lineHeight: 0.98, letterSpacing: "-0.03em" }}>{tile.name}.</span>
            <span className="mt-1 text-[13px] font-semibold">Shop collection →</span>
          </span>
        </button>
      );
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-12">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Collections"}</h2>
          <div className="grid gap-5 @3xl:grid-cols-[1.5fr_1fr]">
            {big ? card(big, true) : null}
            <div className="grid gap-5 @3xl:grid-rows-2">{rest.slice(0, 2).map((tile) => card(tile, false))}</div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-center") {
      // Four photo tiles around a centre column with the heading, a button and a tall photo (Ẹ̀fọ́).
      const [a, b, centre, c, d] = tiles;
      const tile = (entry: (typeof tiles)[number] | undefined) => entry ? (
        <button key={entry.key} type="button" onClick={entry.onSelect} className="group relative block aspect-[4/3] cursor-pointer overflow-hidden border-0 p-0" style={{ background: look.placeholder, borderRadius: look.cardRadius }}>
          <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{entry.image ? <img src={entry.image} alt="" width={500} height={375} loading="lazy" className="transition duration-700 group-hover:scale-[1.06]" /> : null}</span>
          <span className="absolute bottom-0 left-0 px-4 py-1.5 text-[13px] font-semibold" style={{ background: t.accent, color: t.ctaText }}>{entry.name}</span>
        </button>
      ) : null;
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-12">
          <div className="grid gap-4 @3xl:grid-cols-[1fr_1fr_1fr]">
            <div className="grid gap-4">{tile(a)}{tile(c)}</div>
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 id={headingId} className="m-0 text-[28px]" style={{ fontFamily: BQ_SERIF, fontStyle: "italic", color: t.accent }}>{text(copy.title) || "Shop by category"}</h2>
              {text(store.description) ? <p className="m-0 text-[13.5px]" style={{ color: t.muted }}>{text(store.description)}</p> : null}
              <button type="button" className="bq-btn" style={look.primaryButton} onClick={() => go("products")}>Shop now</button>
              {centre ? (
                <button type="button" onClick={centre.onSelect} className="group relative mt-2 block w-full flex-1 cursor-pointer overflow-hidden border-0 p-0" style={{ background: look.placeholder, borderRadius: look.cardRadius, minHeight: 200 }}>
                  <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{centre.image ? <img src={centre.image} alt="" width={500} height={500} loading="lazy" className="transition duration-700 group-hover:scale-[1.06]" /> : null}</span>
                  <span className="absolute bottom-0 left-0 px-4 py-1.5 text-[13px] font-semibold" style={{ background: t.accent, color: t.ctaText }}>{centre.name}</span>
                </button>
              ) : null}
            </div>
            <div className="grid gap-4">{tile(b)}{tile(d)}</div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-lookbook") {
      // Two stacked pale cards with a photo and the name on the left, a tall card on the right (Àlùkò).
      const [a, b, tall] = tiles;
      const card = (entry: (typeof tiles)[number] | undefined, tone: string) => entry ? (
        <button key={entry.key} type="button" onClick={entry.onSelect} className="group grid min-h-[240px] cursor-pointer grid-cols-2 items-center overflow-hidden border-0 p-0 text-left" style={{ background: tone, color: t.ink, borderRadius: look.cardRadius }}>
          <span className="bq-media block h-full" style={{ background: "transparent", borderRadius: 0 }}>{entry.image ? <img src={entry.image} alt="" width={500} height={500} loading="lazy" className="transition duration-700 group-hover:scale-[1.05]" /> : null}</span>
          <span className="flex flex-col items-start gap-1 p-6">
            <span className="text-[13px]" style={{ color: t.muted }}>{entry.count} {entry.count === 1 ? "piece" : "pieces"}</span>
            <span className="bq-h text-[26px] leading-tight" style={{ ...look.headingStyle, fontWeight: 700 }}>{entry.name}</span>
            <span className="mt-3 rounded-full border px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em]" style={{ borderColor: t.ink }}>See more</span>
          </span>
        </button>
      ) : null;
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-12">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Collections"}</h2>
          <div className="grid gap-5 @3xl:grid-cols-2">
            <div className="grid gap-5">{card(a, t.cardBg)}{card(b, "#EFEFEF")}</div>
            {tall ? (
              <button type="button" onClick={tall.onSelect} className="group relative block min-h-[420px] cursor-pointer overflow-hidden border-0 p-0 text-left" style={{ background: "#F2F2F2", borderRadius: look.cardRadius }}>
                <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{tall.image ? <img src={tall.image} alt="" width={700} height={900} loading="lazy" className="transition duration-700 group-hover:scale-[1.04]" /> : null}</span>
                <span aria-hidden className="absolute inset-x-0 top-0 h-1/2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,0))" }} />
                <span className="absolute left-8 top-8 flex flex-col gap-1" style={{ color: t.ink }}>
                  <span className="text-[13px]" style={{ color: t.muted }}>{tall.count} {tall.count === 1 ? "piece" : "pieces"}</span>
                  <span className="bq-h text-[38px] leading-none" style={{ ...look.headingStyle, fontWeight: 700 }}>{tall.name}</span>
                </span>
              </button>
            ) : null}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-overlap") {
      // Two big rows, the photo and a words card overlapping it, alternating sides (Dára).
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Collections"}</h2>
          <div className="grid gap-12">
            {tiles.slice(0, 2).map((tile, i) => (
              <div key={tile.key} className={`relative grid items-center @3xl:grid-cols-[1.1fr_1fr] ${i % 2 ? "@3xl:grid-cols-[1fr_1.1fr]" : ""}`}>
                <button type="button" onClick={tile.onSelect} className={`group relative block aspect-[4/3] cursor-pointer overflow-hidden border-0 p-0 ${i % 2 ? "@3xl:order-2" : ""}`} style={{ background: look.placeholder, borderRadius: look.cardRadius }}>
                  <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={800} height={600} loading="lazy" className="transition duration-700 group-hover:scale-[1.04]" /> : null}</span>
                </button>
                <div className={`relative z-[1] -mt-10 mx-4 flex flex-col items-start gap-3 p-8 shadow-lg @3xl:mx-0 @3xl:mt-0 ${i % 2 ? "@3xl:-mr-16" : "@3xl:-ml-16"}`} style={{ background: "#FFFFFF", color: t.ink, borderRadius: look.cardRadius }}>
                  <p className="m-0 text-[12px] uppercase" style={{ color: t.muted, letterSpacing: "0.2em" }}>{tile.count} {tile.count === 1 ? "product" : "products"}</p>
                  <h3 className="m-0 text-[26px] uppercase" style={{ fontFamily: look.headingFont, fontWeight: 300, letterSpacing: "0.02em" }}>{tile.name}</h3>
                  {text(store.description) ? <p className="m-0 text-[14px] leading-6" style={{ color: t.muted }}>{text(store.description)}</p> : null}
                  <button type="button" onClick={tile.onSelect} className="bq-btn mt-1" style={{ ...look.secondaryButton, boxShadow: "0 8px 20px rgba(0,0,0,.08)" }}>Shop now</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-shopbar") {
      // Photo cards with the name in a box and a dark "Shop now" bar along the bottom (Ìfẹ́).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-12">
          <p className="m-0 text-center text-[11px] uppercase" style={{ color: t.muted, letterSpacing: "0.3em" }}>Only the best</p>
          <h2 id={headingId} className="m-0 mb-8 mt-1 text-center text-[30px] uppercase @3xl:text-[38px]" style={{ fontFamily: look.headingFont, fontWeight: 400 }}>{text(copy.title) || "Shop the edit"}</h2>
          <div className="grid gap-5 @3xl:grid-cols-3">
            {tiles.slice(0, 3).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative block cursor-pointer overflow-hidden border-0 p-0" style={{ background: look.placeholder }}>
                <span className="bq-media block aspect-[4/3]" style={{ borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={600} height={450} loading="lazy" className="transition duration-700 group-hover:scale-[1.05]" /> : null}</span>
                <span className="absolute right-4 top-1/3 px-4 py-2 text-right" style={{ background: "rgba(42,37,34,.82)", color: "#FFFFFF", fontFamily: look.headingFont }}>
                  <span className="block text-[20px]">{tile.name}</span>
                  <span className="block text-[11px] uppercase tracking-[0.14em] opacity-80">{tile.count} {tile.count === 1 ? "piece" : "pieces"}</span>
                </span>
                <span className="block py-3 text-center text-[14px] text-white transition group-hover:opacity-90" style={{ background: "#2F2A27", fontFamily: look.headingFont }}>Shop now</span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-halves") {
      // Two tall photos, half the page each, the name in huge bold letters with an outline button (Rẹ̀wà).
      return (
        <section aria-labelledby={headingId}>
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Collections"}</h2>
          <div className="grid @3xl:grid-cols-2">
            {tiles.slice(0, 2).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative block min-h-[340px] cursor-pointer overflow-hidden border-0 p-0 text-left @3xl:min-h-[480px]" style={{ background: look.placeholder }}>
                <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={900} height={900} loading="lazy" className="transition duration-700 group-hover:scale-[1.04]" /> : null}</span>
                <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,.05))" }} />
                <span className="absolute inset-0 flex flex-col items-start justify-center gap-4 p-8 text-white @3xl:p-12">
                  <span className="text-[12px] font-semibold uppercase" style={{ letterSpacing: "0.14em" }}>{tile.count} {tile.count === 1 ? "product" : "products"}</span>
                  <span className="max-w-[10ch] uppercase leading-[0.95]" style={{ fontFamily: look.headingFont, fontWeight: 800, fontSize: "clamp(40px, 5.6cqi, 76px)" }}>{tile.name}</span>
                  <span className="border-2 border-white px-6 py-2.5 text-[12.5px] font-bold uppercase transition group-hover:bg-white group-hover:text-black">Shop now</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-exclusive") {
      // A words card and a big photo on top, three labelled photos below (Ọlá).
      const [big, ...small] = tiles;
      const photo = (tile: (typeof tiles)[number], className: string) => (
        <button key={tile.key} type="button" onClick={tile.onSelect} className={`group relative block cursor-pointer overflow-hidden border-0 p-0 ${className}`} style={{ background: look.placeholder, borderRadius: look.cardRadius }}>
          <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={800} height={600} loading="lazy" className="transition duration-700 group-hover:scale-[1.05]" /> : null}</span>
          <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,.5), rgba(0,0,0,0) 45%)" }} />
          <span className="absolute bottom-4 left-4 text-[14px] font-semibold text-white">{tile.name} →</span>
        </button>
      );
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-12">
          <div className="grid gap-3 @3xl:grid-cols-3">
            <div className="flex flex-col items-start justify-center gap-3 p-8" style={{ background: "#E9E9E9", borderRadius: look.cardRadius }}>
              <p className="m-0 text-[13px] font-semibold" style={{ color: t.muted }}>Exclusive collection</p>
              <h2 id={headingId} className="bq-h m-0 text-[28px]" style={look.headingStyle}>{text(copy.title) || "Be exclusive"}</h2>
              {text(store.description) ? <p className="m-0 text-[13.5px] leading-6" style={{ color: t.muted }}>{text(store.description)}</p> : null}
              <button type="button" className="bq-btn mt-2" style={look.primaryButton} onClick={() => go("products")}>Explore</button>
            </div>
            {big ? photo(big, "min-h-[280px] @3xl:col-span-2") : null}
            {small.slice(0, 3).map((tile) => photo(tile, "aspect-[4/3]"))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-staggered") {
      // Three collections staggered down the page, each a photo with its name and a "Shop now" underline (Ọkùnrin).
      const item = (tile: (typeof tiles)[number], i: number) => (
        <button key={tile.key} type="button" onClick={tile.onSelect} className={`group flex cursor-pointer gap-6 border-0 bg-transparent p-0 text-left ${i === 1 ? "flex-col-reverse items-start @3xl:col-span-5 @3xl:col-start-1 @3xl:-mt-28" : "items-center @3xl:col-span-7"} ${i === 0 ? "@3xl:col-start-6" : ""} ${i === 2 ? "@3xl:col-start-6 @3xl:-mt-16" : ""}`} style={{ color: t.ink }}>
          <span className={`flex flex-col gap-3 ${i === 1 ? "" : "order-first w-[40%]"}`}>
            <span className="bq-h text-[26px] leading-tight @3xl:text-[30px]" style={look.headingStyle}>{tile.name}</span>
            <span className="w-max border-b-2 pb-1 text-[12.5px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: t.ink }}>Shop now</span>
          </span>
          <span className="bq-media block aspect-square flex-1" style={{ background: look.placeholder, borderRadius: look.cardRadius, minWidth: 0, width: i === 1 ? "100%" : undefined }}>{tile.image ? <img src={tile.image} alt="" width={600} height={600} loading="lazy" className="transition duration-700 group-hover:scale-[1.04]" /> : null}</span>
        </button>
      );
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-14">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Collections"}</h2>
          <div className="grid gap-10 @3xl:grid-cols-12">{tiles.slice(0, 3).map(item)}</div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-panels") {
      // A tall photo beside colour-block panels: blue with a photo, white with the words, orange with a photo (Sálúbàtà).
      const [first, second, third] = tiles;
      const colour = (tile: (typeof tiles)[number] | undefined, bg: string) => tile ? (
        <button type="button" onClick={tile.onSelect} className="group relative grid min-h-[220px] cursor-pointer grid-cols-2 items-center overflow-hidden border-0 p-0 text-left" style={{ background: bg, color: "#FFFFFF" }}>
          <span className="flex flex-col gap-2 p-6">
            <span className="text-[11.5px] font-semibold uppercase" style={{ letterSpacing: "0.16em", opacity: 0.85 }}>{tile.count} {tile.count === 1 ? "product" : "products"}</span>
            <span className="bq-h text-[22px] leading-tight" style={look.headingStyle}>{tile.name}</span>
            <span className="mt-1 w-max rounded-full bg-black px-4 py-1.5 text-[12px] font-semibold">Shop now</span>
          </span>
          <span className="bq-media block h-full" style={{ background: "transparent", borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={400} height={400} loading="lazy" className="transition duration-700 group-hover:scale-[1.05]" /> : null}</span>
        </button>
      ) : null;
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-12">
          <div className="grid gap-0 @3xl:grid-cols-[1fr_2fr]">
            {first ? (
              <button type="button" onClick={first.onSelect} className="group relative block min-h-[320px] cursor-pointer overflow-hidden border-0 p-0" style={{ background: look.placeholder }}>
                <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{first.image ? <img src={first.image} alt="" width={600} height={800} loading="lazy" className="transition duration-700 group-hover:scale-[1.05]" /> : null}</span>
                <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,.55), rgba(0,0,0,0) 55%)" }} />
                <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-6 text-center text-white">
                  <span className="bq-h text-[24px]" style={look.headingStyle}>{first.name}</span>
                  <span className="rounded-full bg-black px-4 py-1.5 text-[12px] font-semibold">Shop now</span>
                </span>
              </button>
            ) : null}
            <div className="grid @xl:grid-cols-2">
              {colour(second, "#1A8FE3")}
              <div className={`flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center ${tiles[3] ? "" : "@xl:row-span-2"}`} style={{ background: "#FFFFFF", color: t.ink }}>
                <p className="m-0 text-[11.5px] font-semibold uppercase" style={{ letterSpacing: "0.16em", color: t.muted }}>{store.name}</p>
                <h2 id={headingId} className="bq-h m-0 text-[26px]" style={look.headingStyle}>{text(copy.title) || "Collections"}</h2>
                <button type="button" className="bq-btn" style={look.primaryButton} onClick={() => go("products")}>Shop all</button>
              </div>
              {colour(third, "#F7941D")}
              {colour(tiles[3], "#2B2B2B")}
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-trio") {
      // Three cards: two narrow ones with the picture above the name, a wide one in the middle with words and a button (Ìjókòó).
      const [left, middle, right] = tiles;
      const side = (tile: (typeof tiles)[number] | undefined) => tile ? (
        <button key={tile.key} type="button" onClick={tile.onSelect} className="group flex cursor-pointer flex-col items-center gap-3 border-0 p-6 text-center" style={{ background: t.cardBg, color: t.ink, borderRadius: look.cardRadius }}>
          <span className="bq-media block aspect-square w-[70%]" style={{ background: "transparent" }}>{tile.image ? <img src={tile.image} alt="" width={400} height={400} loading="lazy" className="transition duration-500 group-hover:scale-[1.05]" style={{ objectFit: "contain" }} /> : null}</span>
          <span className="bq-h text-[18px]" style={look.headingStyle}>{tile.name}</span>
          <span className="text-[13px]" style={{ color: t.muted }}>{tile.count} {tile.count === 1 ? "product" : "products"}</span>
        </button>
      ) : null;
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-12">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop by category"}</h2>
          <div className="grid gap-5 @3xl:grid-cols-[1fr_1.7fr_1fr]">
            {side(left)}
            {middle ? (
              <button type="button" onClick={middle.onSelect} className="group grid cursor-pointer items-center gap-4 border-0 p-6 text-left @xl:grid-cols-2" style={{ background: t.cardBg, color: t.ink, borderRadius: look.cardRadius }}>
                <span className="bq-media block aspect-square" style={{ background: "transparent" }}>{middle.image ? <img src={middle.image} alt="" width={500} height={500} loading="lazy" className="transition duration-500 group-hover:scale-[1.05]" style={{ objectFit: "contain" }} /> : null}</span>
                <span className="flex flex-col items-start gap-2">
                  <span className="bq-h text-[22px]" style={look.headingStyle}>{middle.name}</span>
                  <span className="text-[13.5px]" style={{ color: t.muted }}>{middle.count} {middle.count === 1 ? "product" : "products"} to choose from.</span>
                  <span className="mt-2 border px-4 py-2 text-[13px] font-semibold" style={{ borderColor: t.ink }}>Discover more</span>
                </span>
              </button>
            ) : null}
            {side(right)}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-duo") {
      // Two large photos with a serif "Shop …" caption under each (Bàtà).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop the collections"}</h2>
          <div className="grid gap-6 @3xl:grid-cols-2">
            {tiles.slice(0, 2).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group flex cursor-pointer flex-col gap-4 border-0 bg-transparent p-0 text-center" style={{ color: t.ink }}>
                <span className="bq-media block aspect-[4/3] w-full" style={{ background: look.placeholder, borderRadius: look.cardRadius }}>{tile.image ? <img src={tile.image} alt="" width={800} height={600} loading="lazy" className="transition duration-500 group-hover:scale-[1.04]" /> : null}</span>
                <span className="text-[24px] @3xl:text-[28px]" style={{ fontFamily: BQ_SERIF }}>Shop {tile.name}</span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-captioned") {
      // Square photos with the name on an accent bar underneath, lifted by a soft shadow (Ọgbà).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop by category"}</h2>
          <div className="grid gap-6 @3xl:grid-cols-3">
            {tiles.slice(0, 3).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group flex cursor-pointer flex-col border-0 p-0 text-center" style={{ background: "#FFFFFF", boxShadow: "0 10px 30px rgba(0,0,0,.12)", borderRadius: look.cardRadius }}>
                <span className="bq-media block aspect-[4/3] w-full" style={{ background: look.placeholder, borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={700} height={525} loading="lazy" className="transition duration-500 group-hover:scale-[1.05]" /> : null}</span>
                <span className="block w-full px-4 py-3.5 text-[15px] font-bold" style={{ background: t.ctaBg, color: t.ctaText }}>{tile.name}</span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-diagonal") {
      // Light tiles with the photo on the right and a slanted accent panel holding the name (Ike).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Collections"}</h2>
          <div className="grid gap-5 @3xl:grid-cols-3">
            {tiles.slice(0, 3).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative block h-[220px] cursor-pointer overflow-hidden border-0 p-0 text-left" style={{ background: t.cardBg, borderRadius: look.cardRadius }}>
                <span className="bq-media right-0 top-0 block h-full w-[64%]" style={{ position: "absolute", background: "transparent" }}>
                  {tile.image ? <img src={tile.image} alt="" width={500} height={440} loading="lazy" className="transition duration-500 group-hover:scale-[1.06]" /> : null}
                </span>
                <span aria-hidden className="absolute inset-0 transition-[clip-path] duration-300 [clip-path:polygon(0_0,62%_0,42%_100%,0_100%)] group-hover:[clip-path:polygon(0_0,72%_0,52%_100%,0_100%)]" style={{ background: t.accent, opacity: 0.94 }} />
                <span className="absolute inset-y-0 left-0 flex w-[46%] flex-col justify-center gap-3 pl-6" style={{ color: "#FFFFFF" }}>
                  <span className="bq-h text-[24px] leading-[1.05]" style={{ ...look.headingStyle, fontWeight: 700 }}>{tile.name}</span>
                  <span className="text-[12.5px] font-bold uppercase" style={{ letterSpacing: "0.06em" }}>Shop now →</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-counts") {
      // Bordered cards with how many products each holds, the picture and the name (Ẹ̀wù).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="bq-h mb-6 text-center text-[26px] @3xl:text-[30px]" style={look.headingStyle}>{text(copy.title) || "Shop by category"}</h2>
          <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-3 @3xl:gap-6">
            {tiles.slice(0, 6).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group flex cursor-pointer flex-col gap-3 border p-4 text-left transition hover:shadow-md @3xl:p-6" style={{ borderColor: t.border, background: "#FFFFFF", color: t.ink, borderRadius: look.cardRadius }}>
                <span className="self-end text-[12.5px]" style={{ color: t.muted }}>{tile.count} {tile.count === 1 ? "product" : "products"}</span>
                <span className="bq-media block aspect-square" style={{ background: look.placeholder, borderRadius: look.cardRadius }}>{tile.image ? <img src={tile.image} alt="" width={500} height={500} loading="lazy" className="transition duration-500 group-hover:scale-[1.05]" /> : null}</span>
                <span className="bq-h text-[17px] font-semibold" style={look.headingStyle}>{tile.name}</span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-promo") {
      // Two wide panels, the name large in the accent colour beside a photo (Wuta, Ẹ̀wù).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Collections"}</h2>
          <div className="grid gap-5 @3xl:grid-cols-2">
            {tiles.slice(0, 2).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group grid min-h-[200px] cursor-pointer grid-cols-[1.15fr_1fr] items-center gap-3 overflow-hidden border-0 p-0 text-left" style={{ background: look.storyBg, color: t.ink, borderRadius: look.cardRadius }}>
                <span className="flex flex-col items-start gap-2 p-6 @3xl:p-8">
                  <span className="text-[12.5px] font-semibold uppercase" style={{ color: t.muted, letterSpacing: "0.08em" }}>{tile.count} {tile.count === 1 ? "product" : "products"}</span>
                  <span className="bq-h text-[26px] leading-tight @3xl:text-[30px]" style={{ ...look.headingStyle, fontWeight: 700, color: t.accent }}>{tile.name}</span>
                  <span className="mt-1 border px-4 py-2 text-[12.5px] font-semibold transition group-hover:opacity-80" style={{ borderColor: t.ink, borderRadius: look.buttonRadius }}>Shop now</span>
                </span>
                <span className="bq-media block h-full min-h-[200px]" style={{ background: "transparent", borderRadius: 0 }}>{tile.image ? <img src={tile.image} alt="" width={500} height={500} loading="lazy" className="transition duration-500 group-hover:scale-[1.05]" /> : null}</span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-labels") {
      // Photo banners with the name in a white box in the middle (Àwọ̀).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-8">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop by category"}</h2>
          <div className="grid gap-4 @3xl:grid-cols-3">
            {tiles.slice(0, 3).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative block min-h-[220px] cursor-pointer overflow-hidden border-0 p-0" style={{ background: look.placeholder, borderRadius: look.cardRadius }}>
                <span className="bq-media inset-0 block" style={{ position: "absolute" }}>
                  {tile.image ? <img src={tile.image} alt="" width={700} height={500} loading="lazy" className="transition duration-500 group-hover:scale-[1.05]" /> : null}
                </span>
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-7 py-3 text-[15px] font-bold uppercase shadow-md transition group-hover:px-9" style={{ background: "#FFFFFF", color: "#111", letterSpacing: "0.06em" }}>{tile.name}</span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-bordered") {
      // Bordered cards: the name and a short line on the left, a photo on the right; a tint slides in on hover (Kyau).
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop by category"}</h2>
          <div className="grid gap-4 @3xl:grid-cols-3">
            {tiles.slice(0, 3).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative grid min-h-[200px] cursor-pointer grid-cols-[1fr_1fr] items-stretch overflow-hidden border p-0 text-left" style={{ borderColor: t.border, background: "#FFFFFF", color: t.ink, borderRadius: look.cardRadius }}>
                <span className="relative z-[1] flex flex-col justify-start gap-1 p-6">
                  <span className="bq-h text-[22px]" style={look.headingStyle}>{tile.name}</span>
                  <span className="text-[13px]" style={{ color: t.muted }}>New season</span>
                  <span className="mt-auto translate-y-2 border-b-2 pb-0.5 text-[12.5px] font-semibold opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100" style={{ borderColor: t.accent, width: "max-content" }}>Shop now</span>
                </span>
                <span className="bq-media block" style={{ background: "transparent" }}>{tile.image ? <img src={tile.image} alt="" width={400} height={400} loading="lazy" /> : null}</span>
                <span aria-hidden className="absolute inset-0 opacity-0 transition group-hover:opacity-100" style={{ background: `${t.accent}14` }} />
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-cards") {
      // Soft tinted cards, the name top-left and a product photo on the right (Ìtura).
      const tints = [look.raised, `${t.accent}14`, t.cardBg, `${t.accent}0D`];
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="bq-h mb-6 text-center text-[26px] @3xl:text-[30px]" style={look.headingStyle}>{text(copy.title) || "Featured categories"}</h2>
          <div className="grid gap-4 @3xl:grid-cols-[1.4fr_1fr]">
            {tiles.slice(0, 4).map((tile, i) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className={`group relative grid min-h-[200px] cursor-pointer grid-cols-[1fr_1fr] items-center overflow-hidden border-0 p-6 text-left @3xl:min-h-[260px] ${i === 1 || i === 2 ? "@3xl:order-none" : ""}`} style={{ background: tints[i % tints.length], color: t.ink, borderRadius: look.cardRadius }}>
                <span className="relative z-[1] flex flex-col gap-1.5">
                  <span className="text-[12px] uppercase" style={{ color: t.muted, letterSpacing: "0.14em" }}>Collection</span>
                  <span className="bq-h text-[22px] @3xl:text-[26px]" style={look.headingStyle}>{tile.name}</span>
                  <span className="mt-2 text-[13px] font-semibold underline underline-offset-4">Shop now</span>
                </span>
                <span className="bq-media block h-full min-h-[160px]" style={{ background: "transparent", borderRadius: look.cardRadius }}>
                  {tile.image ? <img src={tile.image} alt="" width={480} height={480} loading="lazy" className="transition duration-500 group-hover:scale-[1.05]" /> : null}
                </span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-words") {
      // Big words over pale photos with an outlined button (Imani): MEN, WOMEN, ACCESSORIES.
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop by category"}</h2>
          <div className="grid gap-4 @3xl:grid-cols-3">
            {tiles.slice(0, 3).map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative block min-h-[240px] cursor-pointer overflow-hidden border-0 p-0 text-left @3xl:min-h-[300px]" style={{ background: look.raised, borderRadius: look.cardRadius }}>
                <span className="bq-media inset-0 block" style={{ position: "absolute", background: "transparent" }}>
                  {tile.image ? <img src={tile.image} alt="" width={700} height={600} loading="lazy" className="opacity-90 transition duration-500 group-hover:scale-[1.04]" /> : null}
                </span>
                <span className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(255,255,255,.92), rgba(255,255,255,.55) 55%, rgba(255,255,255,0))" }} />
                <span className="relative flex h-full min-h-[240px] flex-col justify-center gap-2 p-6 @3xl:min-h-[300px]" style={{ color: "#111" }}>
                  <span className="bq-h text-[34px] uppercase @3xl:text-[44px]" style={{ ...look.headingStyle, color: "#111", lineHeight: 0.95 }}>{tile.name}</span>
                  <span className="text-[13px]" style={{ color: "#555", fontFamily: look.headingFont }}>Collection</span>
                  <span className="mt-3 inline-flex w-max border-2 px-4 py-1.5 text-[12px] font-bold uppercase" style={{ borderColor: "#111", letterSpacing: "0.08em" }}>Shop now</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-stack") {
      // Full-width banners, one per category, with the name large: for a short list of big departments.
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <SectionTitle look={look} id={headingId}>{text(copy.title) || "Shop by category"}</SectionTitle>
          <div className="grid gap-3">
            {tiles.slice(0, 4).map((tile, i) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="group relative block w-full cursor-pointer overflow-hidden border-0 p-0 text-left" style={{ borderRadius: look.cardRadius, background: look.placeholder }}>
                <span className="bq-media block aspect-[16/9] @3xl:aspect-[16/4]">
                  {tile.image ? <img src={tile.image} alt="" width={1600} height={400} loading="lazy" className="transition duration-500 group-hover:scale-[1.03]" /> : null}
                </span>
                <span className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,0) 70%)" }} />
                <span className="absolute inset-y-0 left-0 flex items-center gap-4 px-6 text-white @3xl:px-10">
                  <span className="text-[13px] opacity-80" style={{ fontFamily: look.eyebrowFont }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="bq-h text-[30px] @3xl:text-[46px]" style={{ ...look.headingStyle, color: "#fff" }}>{tile.name}</span>
                </span>
                <span aria-hidden className="absolute right-5 top-1/2 -translate-y-1/2 text-[24px] text-white transition group-hover:translate-x-1 @3xl:right-10">→</span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "boutique-mosaic") {
      // A bento grid: the first category large, the next four around it.
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-10">
          <SectionTitle look={look} id={headingId}>{text(copy.title) || "Shop by category"}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4 @3xl:grid-rows-2 @3xl:gap-4" style={{ gridAutoRows: "minmax(150px, auto)" }}>
            {tiles.slice(0, 5).map((tile, i) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className={`group relative block min-h-[160px] cursor-pointer overflow-hidden border-0 p-0 text-left ${i === 0 ? "col-span-2 row-span-2 min-h-[300px] @3xl:min-h-[420px]" : ""}`} style={{ borderRadius: look.cardRadius, background: look.placeholder }}>
                <span className="bq-media inset-0 block" style={{ position: "absolute" }}>
                  {tile.image ? <img src={tile.image} alt="" width={900} height={900} loading="lazy" className="transition duration-500 group-hover:scale-[1.04]" /> : null}
                </span>
                <span className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0) 55%)" }} />
                <span className={`absolute bottom-0 left-0 p-4 text-white ${i === 0 ? "@3xl:p-7" : ""}`}>
                  <span className={`bq-h block ${i === 0 ? "text-[28px] @3xl:text-[40px]" : "text-[18px]"}`} style={{ ...look.headingStyle, color: "#fff" }}>{tile.name}</span>
                  <span className="mt-1 block text-[13px] font-semibold underline underline-offset-4">Shop now</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "chips") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap pt-8">
          <SectionTitle look={look} id={headingId}>{text(copy.title) || "Shop by category"}</SectionTitle>
          <div className="bq-chips">
            {tiles.map((tile) => (
              <button key={tile.key} type="button" onClick={tile.onSelect} className="inline-flex min-h-[44px] shrink-0 items-center gap-2 border px-4 text-[14px] font-medium" style={{ borderColor: t.border, background: look.raised, color: t.ink, borderRadius: look.buttonRadius, cursor: "pointer" }}>
                {tile.image ? <img src={tile.image} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 rounded-[4px] object-cover" /> : null}
                {tile.name}
              </button>
            ))}
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby={headingId} className="bq-wrap pt-8">
        <SectionTitle look={look} id={headingId}>{text(copy.title) || "Shop by category"}</SectionTitle>
        <div className="bq-cats" data-shape={section.settings?.layout === "boutique-circles" ? "circles" : undefined}>
          {tiles.slice(0, themeId === "breeze" ? 6 : 8).map((tile) => (
            <button key={tile.key} type="button" className="bq-cat" onClick={tile.onSelect}>
              <span className="bq-media block">
                {tile.image ? <img src={tile.image} alt="" width={480} height={240} loading="lazy" /> : null}
              </span>
              <span className="bq-cat-label">{tile.name}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function sectionProducts(section: TemplateSectionNode) {
    const mapped = (section.items ?? [])
      .map((item) => (typeof item.mappedStoreProductId === "string" ? products.find((product) => product.id === item.mappedStoreProductId) : undefined))
      .filter((product): product is ShopperProduct => Boolean(product));
    const source = text(section.settings?.source);
    // "Only products I pick": just those, in the seller's order.
    if (source === "picked") return mapped;
    // "One collection": that collection's products, best first. An unknown or empty collection falls back to best sellers.
    if (source === "collection") {
      const collection = shopper.collections.find((entry) => entry.id === text(section.settings?.collectionId));
      if (collection) return bestSellers(products.filter((product) => collection.productIds.includes(product.id)));
    }
    // Best sellers: hand-picked products first (template apply maps a few), then the rest by reviews and newness.
    return [...mapped, ...bestSellers(products).filter((product) => !mapped.includes(product))];
  }

  /** Card extras the seller turned on for a product section (rating, quick add, second photo on hover). */
  function cardOptions(section: TemplateSectionNode) {
    const options = readProductCardOptions(section.settings);
    const quickAdd = options.quickAdd ? (live ? props.onAddToCart : () => undefined) : undefined;
    return { showRating: options.showRating, hoverImage: options.hoverImage, onQuickAdd: quickAdd };
  }

  function productRail(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const railLayout = text(section.settings?.layout);
    // An explicit "How many products" is shown in full; without one the layout keeps its own cap (CSS, per screen).
    const explicitLimit = readOptionalProductLimit(section.settings);
    const list = sectionProducts(section).slice(0, explicitLimit ?? readProductLimit(section.settings, railLayout === "dense" ? 12 : 8));
    const card = cardOptions(section);
    const headingId = `${uid}-${section.id}`;
    if (!list.length) {
      return live ? (
        <section className="bq-wrap py-10 text-center" aria-labelledby={headingId}>
          <h2 id={headingId} className="bq-h text-[24px]" style={look.headingStyle}>{text(copy.title) || "Best sellers"}</h2>
          <p className="mt-2 text-[14.5px]" style={{ color: t.muted }}>New pieces are on the way. Check back soon.</p>
        </section>
      ) : editorHint("Your best sellers show here once you add products.");
    }
    if (railLayout === "menu") return menuList(section, list, headingId);
    if (railLayout === "spotlight" || railLayout === "lookbook" || railLayout === "feature" || railLayout === "showcase") return featureLayout(section, railLayout, list, headingId);
    if (railLayout === "category-tabs") return categoryTabs(section, headingId);
    if (railLayout === "lists") return productLists(section, headingId);
    if (railLayout === "by-category") return categoryRows(section, headingId);
    if (railLayout === "mini") return miniCards(section, list, headingId);
    if (railLayout === "intro") return introProducts(section, list, headingId);
    if (railLayout === "per-category") return perCategory(section, headingId);
    if (railLayout === "overlay") return overlayTiles(section, list, headingId);
    if (railLayout === "deal") return dealSection(section, list, headingId);
    const scroll = (direction: number) => {
      const rail = railRefs.current[section.id];
      if (rail) rail.scrollBy({ left: direction * rail.clientWidth * 0.9, behavior: "smooth" });
    };
    const arrows = (
      <div className="bq-only-wide">
        <div className="flex items-center gap-2">
          <button type="button" className="bq-icon-btn border" style={{ borderColor: t.border, width: 36, height: 36 }} onClick={() => scroll(-1)} aria-label={`Scroll ${text(copy.title) || "products"} back`}>
            <Icon name="arrowLeft" size={15} />
          </button>
          <button type="button" className="bq-icon-btn" style={{ background: look.countBg, color: look.onAccent, width: 36, height: 36 }} onClick={() => scroll(1)} aria-label={`Scroll ${text(copy.title) || "products"} forward`}>
            <Icon name="chevRight" size={15} />
          </button>
        </div>
      </div>
    );
    const shopAll = (
      <button type="button" onClick={() => go("products")} className="bq-only-narrow border-0 bg-transparent p-0 text-[14px] font-semibold underline-offset-4 hover:underline" style={{ color: t.ink, cursor: "pointer" }}>
        {text(copy.cta) || "Shop all"}
      </button>
    );
    const shopAllAlways = (
      <button type="button" onClick={() => go("products")} className="border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: t.ink, cursor: "pointer" }}>
        {text(copy.cta) || "Shop all"}
      </button>
    );
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-10" style={look.dark ? { background: t.paperBg } : undefined}>
        <SectionTitle look={look} id={headingId} action={railLayout === "tiles" || railLayout === "dense" ? shopAllAlways : <>{shopAll}{arrows}</>}>{text(copy.title) || "Best sellers"}</SectionTitle>
        <div className={railLayout === "tiles" ? "bq-tiles" : railLayout === "dense" ? "bq-dense" : "bq-rail"} data-limit={explicitLimit ?? undefined} ref={(el) => { railRefs.current[section.id] = el; }}>
          {list.map((product, i) => (
            <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 2} {...card} />
          ))}
        </div>
      </section>
    );
  }

  /**
   * Two editorial product layouts any theme can use: "spotlight" (the first product large beside a grid of four)
   * and "lookbook" (up to three products as big alternating rows with their description).
   */
  function featureLayout(section: TemplateSectionNode, layout: "spotlight" | "lookbook" | "feature" | "showcase", list: ShopperProduct[], headingId: string) {
    const copy = copyOf(section);
    const card = cardOptions(section);
    const shopAll = (
      <button type="button" onClick={() => go("products")} className="border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: t.ink, cursor: "pointer" }}>
        {text(copy.cta) || "Shop all"}
      </button>
    );
    const open = (product: ShopperProduct, className: string, children: React.ReactNode, style?: React.CSSProperties) => {
      const href = productHref(product.id);
      return href ? (
        <Link key={product.id} href={href} prefetch={false} className={className} style={style}>{children}</Link>
      ) : (
        <button key={product.id} type="button" className={className} style={{ background: "transparent", border: 0, padding: 0, textAlign: "left", color: "inherit", cursor: "pointer", ...style }} onClick={live ? undefined : () => openProduct(product.id)}>{children}</button>
      );
    };
    if (layout === "feature") {
      // One product, large, with its description and price (Ìtàn's "best selling book").
      const product = list[0]!;
      return (
        <section aria-labelledby={headingId} className="py-12 @3xl:py-16" style={{ background: look.raised }}>
          <div className="bq-wrap grid items-center gap-8 @3xl:grid-cols-2 @3xl:gap-16">
            {open(product, "mx-auto block w-full max-w-[420px]", (
              <span className="bq-media block" style={{ aspectRatio: "3 / 4", borderRadius: look.cardRadius, boxShadow: "0 30px 60px rgba(0,0,0,.18)" }}>
                {product.images[0] ? <img src={product.images[0]} alt={product.name} width={840} height={1120} loading="lazy" decoding="async" /> : null}
              </span>
            ))}
            <div className="flex flex-col items-start gap-3">
              <h2 id={headingId} className="bq-h text-[30px] @3xl:text-[40px]" style={{ ...look.headingStyle, lineHeight: 1.08 }}>{text(copy.title) || "Best seller"}</h2>
              <span aria-hidden className="block h-[2px] w-12" style={{ background: t.accent }} />
              <p className="m-0 mt-2 text-[20px] font-semibold" style={{ fontFamily: look.headingFont }}>{product.name}</p>
              {text(product.description) ? <p className="m-0 max-w-[480px] text-[15.5px] leading-7" style={{ color: t.muted }}>{text(product.description)}</p> : null}
              <p className="m-0 text-[22px] font-bold" style={{ color: t.accent }}>{formatStoreMoney(product.retailPrice, product.currency)}</p>
              {open(product, "bq-btn mt-2", text(copy.cta) || "Shop it now", { ...look.primaryButton, padding: "0 24px" })}
            </div>
          </div>
        </section>
      );
    }
    if (layout === "showcase") {
      // Alternating rows, each product on an angled colour panel with its number, price and a Buy now button (Keke).
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12">
          <h2 id={headingId} className="bq-h mb-10 text-center text-[28px] @3xl:text-[34px]" style={look.headingStyle}>{text(copy.title) || "Our range"}</h2>
          <div className="grid gap-12 @3xl:gap-16">
            {list.slice(0, 4).map((product, i) => (
              <article key={product.id} className="grid items-center gap-6 @3xl:grid-cols-2 @3xl:gap-14">
                <div className={`relative ${i % 2 ? "@3xl:order-2" : ""}`}>
                  <div aria-hidden className="absolute inset-y-[6%] left-[8%] right-[18%]" style={{ background: t.accent, clipPath: i % 2 ? "polygon(0 10%, 100% 0, 100% 100%, 0 90%)" : "polygon(0 0, 100% 10%, 100% 90%, 0 100%)" }} />
                  {open(product, "relative block w-full", (
                    <span className="bq-media block aspect-[4/3]" style={{ background: "transparent" }}>
                      {product.images[0] ? <img src={product.images[0]} alt={product.name} width={900} height={675} loading="lazy" decoding="async" style={{ objectFit: "contain" }} /> : null}
                    </span>
                  ))}
                  <span aria-hidden className="absolute left-[12%] top-[10%] grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: t.heroBg }}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className={`flex flex-col gap-3 ${i % 2 ? "" : "@3xl:items-end @3xl:text-right"}`}>
                  <span aria-hidden className="block h-px w-24" style={{ background: t.border }} />
                  <h3 className="bq-h text-[26px] @3xl:text-[32px]" style={look.headingStyle}>{product.name}</h3>
                  {text(product.description) ? <p className="m-0 max-w-[460px] text-[15px] leading-7" style={{ color: t.muted }}>{text(product.description)}</p> : null}
                  <div className={`flex w-full max-w-[460px] items-center justify-between gap-4 ${i % 2 ? "" : "@3xl:flex-row-reverse"}`}>
                    {open(product, "bq-btn", "Buy now", { ...look.solidButton, padding: "0 20px", minHeight: 40 })}
                    <span className="text-[15px] font-semibold">Price <span style={{ color: t.accent }}>{formatStoreMoney(product.retailPrice, product.currency)}</span></span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }
    if (layout === "lookbook") {
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12">
          <SectionTitle look={look} id={headingId} action={shopAll}>{text(copy.title) || "The lookbook"}</SectionTitle>
          <div className="grid gap-10 @3xl:gap-16">
            {list.slice(0, 3).map((product, i) => (
              <article key={product.id} className="grid items-center gap-5 @3xl:grid-cols-2 @3xl:gap-14">
                <div className={i % 2 ? "@3xl:order-2" : undefined}>
                  {open(product, "block", (
                    <span className="bq-media block" style={{ aspectRatio: "4 / 5", borderRadius: look.cardRadius, border: look.tileBorder }}>
                      {product.images[0] ? <img src={product.images[0]} alt={product.name} width={900} height={1125} loading={i ? "lazy" : "eager"} decoding="async" /> : null}
                    </span>
                  ))}
                </div>
                <div className="flex flex-col items-start gap-3">
                  <p className="m-0 text-[12px] uppercase" style={{ color: t.muted, letterSpacing: "0.2em", fontFamily: look.eyebrowFont }}>{String(i + 1).padStart(2, "0")}{product.category?.name ? ` · ${product.category.name}` : ""}</p>
                  <h3 className="bq-h text-[28px] @3xl:text-[40px]" style={{ ...look.headingStyle, lineHeight: 1.05 }}>{product.name}</h3>
                  {text(product.description) ? <p className="m-0 max-w-[460px] text-[15.5px] leading-7" style={{ color: t.muted }}>{text(product.description)}</p> : null}
                  <p className="m-0 text-[18px] font-semibold">{formatStoreMoney(product.retailPrice, product.currency)}</p>
                  {open(product, "bq-btn", "View product", { ...look.primaryButton, padding: "0 22px" })}
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }
    const [lead, ...rest] = list;
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <SectionTitle look={look} id={headingId} action={shopAll}>{text(copy.title) || "Featured"}</SectionTitle>
        <div className="grid gap-4 @3xl:grid-cols-[1.15fr_1fr] @3xl:gap-6">
          {open(lead, "relative block overflow-hidden", (
            <>
              <span className="bq-media block h-full min-h-[360px]" style={{ borderRadius: look.cardRadius, border: look.tileBorder }}>
                {lead.images[0] ? <img src={lead.images[0]} alt={lead.name} width={1000} height={1250} loading="eager" decoding="async" /> : null}
              </span>
              <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 p-4 @3xl:inset-x-5 @3xl:bottom-5" style={{ background: look.dark ? "rgba(0,0,0,.72)" : "rgba(255,255,255,.94)", color: look.dark ? "#fff" : t.ink, borderRadius: Math.max(0, look.cardRadius - 4) }}>
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-semibold" style={{ fontFamily: look.headingFont }}>{lead.name}</span>
                  <span className="block text-[14px]">{formatStoreMoney(lead.retailPrice, lead.currency)}</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold underline underline-offset-4">Shop</span>
              </span>
            </>
          ))}
          <div className="grid grid-cols-2 gap-4 @3xl:gap-5">
            {rest.slice(0, 4).map((product, i) => (
              <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 2} {...card} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  /** New products with a tab per category above the grid (Gèlè); "All" shows every one. */
  function categoryTabs(section: TemplateSectionNode, headingId: string) {
    const copy = copyOf(section);
    const card = cardOptions(section);
    const picked = railTab[section.id] ?? "";
    const tabs = categories.slice(0, 6);
    const pool = sectionProducts(section);
    const shown = (picked ? pool.filter((product) => product.category?.slug === picked) : pool).slice(0, readProductLimit(section.settings, 8));
    const tab = (slug: string, label: string) => (
      <button key={slug || "all"} type="button" role="tab" aria-selected={picked === slug} onClick={() => setRailTab((prev) => ({ ...prev, [section.id]: slug }))} className="shrink-0 cursor-pointer border-0 border-b-2 bg-transparent px-0 pb-1 text-[14px]" style={{ color: picked === slug ? t.ink : t.muted, borderColor: picked === slug ? t.accent : "transparent", fontWeight: picked === slug ? 700 : 500 }}>
        {label}
      </button>
    );
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 id={headingId} className="bq-h text-[24px] @3xl:text-[28px]" style={look.headingStyle}>{text(copy.title) || "New products"}</h2>
          <div role="tablist" aria-label="Filter by category" className="flex gap-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {tab("", "All")}
            {tabs.map((category) => tab(category.slug, category.name))}
          </div>
        </div>
        <div className="bq-tiles" data-limit="">
          {shown.map((product, i) => (
            <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 2} {...card} />
          ))}
        </div>
      </section>
    );
  }

  /** Three short lists side by side: newest, best sellers and on sale (Gèlè), each a photo, name and price. */
  function productLists(section: TemplateSectionNode, headingId: string) {
    const copy = copyOf(section);
    const pool = sectionProducts(section);
    const onSale = pool.filter((product) => product.compareAtPrice && product.compareAtPrice > product.retailPrice);
    // Four lists adds a "Featured" column (the products picked first) ahead of the other three.
    const four = Number(section.settings?.listColumns) === 4;
    const columns = [
      ...(four ? [{ key: "featured", title: text(copy.featuredTitle) || "Featured", list: pool.slice(0, 3) }] : []),
      { key: "new", title: text(copy.newTitle) || (four ? "Latest" : "Hot right now"), list: (four ? pool.slice(3) : pool).slice(0, 3) },
      { key: "best", title: text(copy.bestTitle) || "Best sellers", list: bestSellers(pool).slice(0, 3) },
      { key: "sale", title: text(copy.saleTitle) || "On sale", list: (onSale.length ? onSale : pool.slice(3)).slice(0, 3) },
    ].filter((column) => column.list.length);
    const row = (product: ShopperProduct) => {
      const href = productHref(product.id);
      const inner = (
        <>
          <span className="bq-media block h-[72px] w-[72px] shrink-0" style={{ borderRadius: Math.min(look.cardRadius, 12) }}>{product.images[0] ? <img src={product.images[0]} alt="" width={144} height={144} loading="lazy" /> : null}</span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-medium">{product.name}</span>
            <span className="mt-1 block text-[14px] font-bold">{formatStoreMoney(product.retailPrice, product.currency)}{product.compareAtPrice && product.compareAtPrice > product.retailPrice ? <s className="ml-2 font-normal" style={{ color: t.muted }}>{formatStoreMoney(product.compareAtPrice, product.currency)}</s> : null}</span>
          </span>
        </>
      );
      return href ? (
        <Link key={product.id} href={href} prefetch={false} className="flex w-full min-w-0 items-center gap-3">{inner}</Link>
      ) : (
        <button key={product.id} type="button" onClick={live ? undefined : () => openProduct(product.id)} className="flex w-full min-w-0 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left" style={{ color: t.ink }}>{inner}</button>
      );
    };
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-10">
        <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop the lists"}</h2>
        <div className={`grid gap-8 ${columns.length === 4 ? "@3xl:grid-cols-4" : "@3xl:grid-cols-3"}`}>
          {columns.map((column) => (
            <div key={column.key} className="min-w-0">
              <h3 className="bq-h mb-4 inline-block border-b-2 pb-1 text-[15px] font-bold uppercase" style={{ borderColor: t.accent, letterSpacing: "0.06em", fontFamily: look.headingFont }}>{column.title}</h3>
              <div className="grid gap-4">{column.list.map(row)}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /**
   * "By category" (Ahịa): a titled row of three product cards for each of the first categories, the name and price
   * above the photo, Buy now and See more under it. A store without categories gets one row.
   */
  function categoryRows(section: TemplateSectionNode, headingId: string) {
    const copy = copyOf(section);
    const pool = sectionProducts(section);
    const groups = categories.length
      ? categories.slice(0, 4).map((category) => ({ key: category.slug, title: category.name, slug: category.slug as string | null, list: pool.filter((product) => product.category?.slug === category.slug).slice(0, 3) }))
      : [{ key: "all", title: text(copy.title) || "Best sellers", slug: null, list: pool.slice(0, 6) }];
    const card = (product: ShopperProduct, slug: string | null) => (
      <div key={product.id} className="flex min-w-0 flex-col gap-3 p-5" style={{ background: "#FFFFFF", borderRadius: look.cardRadius, boxShadow: "0 4px 18px rgba(0,0,0,.08)" }}>
        <div className="text-center">
          <h4 className="bq-h m-0 truncate text-[17px] font-semibold" style={look.headingStyle}>{product.name}</h4>
          <p className="m-0 mt-1 text-[13.5px]"><span style={{ color: t.accent }}>Price</span> {formatStoreMoney(product.retailPrice, product.currency)}</p>
        </div>
        {linkToProduct(product, "bq-media block aspect-square w-full border-0 p-0", product.images[0] ? <img src={product.images[0]} alt="" width={500} height={500} loading="lazy" style={{ objectFit: "contain" }} /> : null, { background: "transparent", borderRadius: look.cardRadius })}
        <div className="flex items-center justify-between text-[13.5px] font-semibold">
          {linkToProduct(product, "border-0 p-0", <span style={{ color: t.accent }}>Buy now</span>)}
          <button type="button" onClick={() => (slug ? shopCategory(slug) : go("products"))} className="cursor-pointer border-0 bg-transparent p-0 text-[13.5px] font-semibold" style={{ color: t.ink }}>{text(copy.cta) || "See more"}</button>
        </div>
      </div>
    );
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-6">
        <h2 id={headingId} className="sr-only">{text(copy.title) || "Shop by category"}</h2>
        {groups.filter((group) => group.list.length).map((group) => (
          <div key={group.key} className="py-6">
            <h3 className="bq-h mb-6 text-center text-[26px] @3xl:text-[32px]" style={{ ...look.headingStyle, fontWeight: 700 }}>{group.title}</h3>
            <div className="grid gap-5 @3xl:grid-cols-3">{group.list.map((product) => card(product, group.slug))}</div>
          </div>
        ))}
      </section>
    );
  }

  /** "Intro" (Ìtẹ́): a heading, a line and a button beside three products on the page background, each with a + button. */
  function introProducts(section: TemplateSectionNode, list: ShopperProduct[], headingId: string) {
    const copy = copyOf(section);
    const lead = text(copy.body) || text(store.description);
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12 @3xl:py-16">
        <div className="grid items-start gap-8 @3xl:grid-cols-[1fr_3fr]">
          <div className="flex flex-col items-start gap-4">
            <h2 id={headingId} className="bq-h m-0 text-[28px] leading-tight @3xl:text-[34px]" style={look.headingStyle}>{text(copy.title) || "Best sellers"}</h2>
            {lead ? <p className="m-0 text-[14.5px] leading-7" style={{ color: t.muted }}>{lead}</p> : null}
            <button type="button" className="bq-btn" style={look.secondaryButton} onClick={() => go("products")}>{text(copy.cta) || "Shop all"}</button>
          </div>
          <div className="grid grid-cols-2 gap-6 @3xl:grid-cols-3">
            {list.slice(0, 3).map((product) => linkToProduct(product, "group relative flex flex-col items-center gap-2 border-0 p-0 pb-8 text-center", (
              <>
                <span aria-hidden className="absolute inset-x-0 bottom-0 top-[30%] -z-0 translate-y-3 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100" style={{ background: t.cardBg, borderRadius: look.cardRadius }} />
                <span className="bq-media relative block aspect-square w-full" style={{ background: "transparent" }}>{product.images[0] ? <img src={product.images[0]} alt="" width={400} height={400} loading="lazy" style={{ objectFit: "contain" }} /> : null}</span>
                <span className="relative text-[15px] font-semibold">{product.name}</span>
                <span className="relative text-[16px] font-bold">{formatStoreMoney(product.retailPrice, product.currency)}</span>
                <span aria-hidden className="absolute -bottom-4 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full opacity-0 transition group-hover:opacity-100" style={{ background: t.ink, color: "#FFFFFF" }}>+</span>
              </>
            ), { color: t.ink }))}
          </div>
        </div>
      </section>
    );
  }

  /** "On the photo" (Ọlá): tall photos with the name and price over a dark fade at the bottom. */
  function overlayTiles(section: TemplateSectionNode, list: ShopperProduct[], headingId: string) {
    const copy = copyOf(section);
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <h2 id={headingId} className="bq-h mb-8 text-center text-[26px] @3xl:text-[30px]" style={look.headingStyle}>{text(copy.title) || "New arrivals"}</h2>
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          {list.slice(0, 4).map((product) => linkToProduct(product, "group relative block aspect-[3/4] overflow-hidden border-0 p-0", (
            <>
              <span className="bq-media inset-0 block" style={{ position: "absolute", borderRadius: 0 }}>{product.images[0] ? <img src={product.images[0]} alt="" width={500} height={670} loading="lazy" className="transition duration-700 group-hover:scale-[1.05]" /> : null}</span>
              <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,.7), rgba(0,0,0,0) 50%)" }} />
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 text-left text-white">
                <span className="text-[16px] font-semibold leading-tight">{product.name}</span>
                {product.category?.name ? <span className="text-[12.5px] opacity-80">{product.category.name}</span> : null}
                <span className="text-[14px] font-semibold" style={{ color: "#FFD28A" }}>{formatStoreMoney(product.retailPrice, product.currency)}</span>
              </span>
            </>
          ), { background: look.placeholder, borderRadius: look.cardRadius }))}
        </div>
      </section>
    );
  }

  /**
   * "Deal" (Ìgbésẹ̀, Ọkùnrin, Sálúbàtà): one product large beside a countdown. The countdown is the seller's own sale
   * window (the Payday countdown settings on this section), so it never shows a deadline the store didn't set.
   */
  function dealSection(section: TemplateSectionNode, list: ShopperProduct[], headingId: string) {
    const copy = copyOf(section);
    const product = list[0];
    if (!product) return null;
    const saving = product.compareAtPrice && product.compareAtPrice > product.retailPrice ? Math.round((1 - product.retailPrice / product.compareAtPrice) * 100) : null;
    return (
      <section aria-labelledby={headingId} style={{ background: look.storyBg, color: t.ink }}>
        <div className="bq-wrap grid items-center gap-8 py-12 @3xl:grid-cols-2 @3xl:py-16">
          <div className="relative">
            {linkToProduct(product, "bq-media block aspect-[4/3] w-full border-0 p-0", product.images[0] ? <img src={product.images[0]} alt="" width={800} height={600} loading="lazy" /> : null, { borderRadius: look.cardRadius, background: look.placeholder })}
            {saving ? <span className="absolute -right-2 -top-3 grid h-20 w-20 place-items-center rounded-full text-center text-[13px] font-bold leading-tight" style={{ background: t.ink, color: "#FFFFFF" }}>Save<br />{saving}%</span> : null}
          </div>
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[12.5px] font-bold uppercase" style={{ color: t.accent, letterSpacing: "0.16em" }}>{text(copy.title) || "Deal of the week"}</p>
            <h2 id={headingId} className="bq-h m-0 text-[30px] leading-tight @3xl:text-[38px]" style={look.headingStyle}>{product.name}</h2>
            <p className="m-0 text-[20px] font-semibold">
              {formatStoreMoney(product.retailPrice, product.currency)}
              {saving ? <s className="ml-3 text-[16px] font-normal" style={{ color: t.muted }}>{formatStoreMoney(product.compareAtPrice!, product.currency)}</s> : null}
            </p>
            <DealTimer settings={section.settings} look={look} editor={!live && !props.demo} say={say} />
            {linkToProduct(product, "bq-btn mt-2 border-0", <>{text(copy.cta) || "Shop now"}</>, look.primaryButton)}
          </div>
        </div>
      </section>
    );
  }

  /** "Per category" (Tufafi): a titled row of product cards for each of the first categories. */
  function perCategory(section: TemplateSectionNode, headingId: string) {
    const copy = copyOf(section);
    const card = cardOptions(section);
    const pool = sectionProducts(section);
    const groups = categories.length
      ? categories.slice(0, 3).map((category) => ({ key: category.slug, name: category.name, slug: category.slug as string | null, list: pool.filter((product) => product.category?.slug === category.slug).slice(0, 4) }))
      : [{ key: "all", name: text(copy.title) || "Latest", slug: null, list: pool.slice(0, 8) }];
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-6">
        <h2 id={headingId} className="sr-only">{text(copy.title) || "Latest"}</h2>
        {groups.filter((group) => group.list.length).map((group) => (
          <div key={group.key} className="border-b py-10 last:border-b-0" style={{ borderColor: t.border }}>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h3 className="bq-h m-0 text-[26px] @3xl:text-[30px]" style={{ ...look.headingStyle, fontWeight: 700 }}>{group.slug ? `${group.name}: ${(text(copy.title) || "Latest").toLowerCase()}` : group.name}</h3>
              </div>
              <button type="button" onClick={() => (group.slug ? shopCategory(group.slug) : go("products"))} className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: t.ink }}>{text(copy.cta) || "Shop all"}</button>
            </div>
            <div className="bq-tiles">
              {group.list.map((product, i) => (
                <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 2} {...card} />
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  /** "Mini cards" (Wuta): small bordered cards, the photo beside the category, name and price, three across. */
  function miniCards(section: TemplateSectionNode, list: ShopperProduct[], headingId: string) {
    const copy = copyOf(section);
    // "Round photos" (Èso): circular pictures on soft panels instead of bordered cards.
    const round = section.settings?.round === true;
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-10">
        <SectionTitle look={look} id={headingId} action={<button type="button" onClick={() => go("products")} className="border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: t.ink, cursor: "pointer" }}>{text(copy.cta) || "Shop all"}</button>}>{text(copy.title) || "Best sellers"}</SectionTitle>
        <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
          {list.slice(0, 6).map((product) => linkToProduct(product, `flex min-w-0 items-center gap-4 p-3 ${round ? "border-0" : "border"}`, (
            <>
              <span className="bq-media block h-[96px] w-[96px] shrink-0" style={{ background: look.placeholder, borderRadius: round ? 999 : Math.min(look.cardRadius, 12) }}>{product.images[0] ? <img src={product.images[0]} alt="" width={192} height={192} loading="lazy" /> : null}</span>
              <span className="min-w-0">
                {product.category?.name ? <span className="block truncate text-[12px]" style={{ color: t.accent }}>{product.category.name}</span> : null}
                <span className="mt-0.5 block truncate text-[15.5px] font-semibold">{product.name}</span>
                <span className="mt-1 block text-[14.5px] font-bold" style={{ color: t.accent }}>{formatStoreMoney(product.retailPrice, product.currency)}{product.compareAtPrice && product.compareAtPrice > product.retailPrice ? <s className="ml-2 font-normal" style={{ color: t.muted }}>{formatStoreMoney(product.compareAtPrice, product.currency)}</s> : null}</span>
              </span>
            </>
          ), { borderColor: t.border, borderRadius: look.cardRadius, color: t.ink, background: round ? t.cardBg : "#FFFFFF" }))}
        </div>
      </section>
    );
  }

  /** Oúnjẹ's menu: dish, what's in it and price, in a list; orders go through the product page or WhatsApp. */
  function menuList(section: TemplateSectionNode, list: ShopperProduct[], headingId: string) {
    const copy = copyOf(section);
    const whatsapp = shopper.whatsappNumber ?? (props.demo ? "sample" : null);
    const item = (product: ShopperProduct, i: number) => {
      const inner = (
        <>
          <span className="bq-media block">
            {product.images[0] ? <img src={product.images[0]} alt="" width={224} height={224} loading={i < 4 ? "eager" : "lazy"} decoding="async" /> : null}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[16px] font-semibold leading-snug" style={{ fontFamily: look.headingFont }}>{product.name}</span>
            {text(product.description) ? <span className="line-clamp-2 text-[13.5px] leading-5" style={{ color: t.muted }}>{text(product.description)}</span> : null}
            <span className="mt-1 text-[15px] font-bold">{formatStoreMoney(product.retailPrice, product.currency)}</span>
          </span>
        </>
      );
      const href = productHref(product.id);
      return href ? (
        <Link key={product.id} href={href} prefetch={false} className="bq-menu-item">{inner}</Link>
      ) : (
        <button key={product.id} type="button" className="bq-menu-item" onClick={live ? undefined : () => openProduct(product.id)}>{inner}</button>
      );
    };
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-10">
        <SectionTitle look={look} id={headingId} action={(
          <button type="button" onClick={() => go("products")} className="border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: t.ink, cursor: "pointer" }}>
            {text(copy.cta) || "Full menu"}
          </button>
        )}>{text(copy.title) || "Today's menu"}</SectionTitle>
        <div className="bq-menu">{list.map(item)}</div>
        {whatsapp ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--bq-card-radius)] px-5 py-4" style={{ background: t.heroBg, color: t.heroText }}>
            <p className="m-0 text-[15px] font-semibold">Prefer to order by chat? Send us your order on WhatsApp.</p>
            <a href={live && shopper.whatsappNumber ? whatsappLink(shopper.whatsappNumber, `Hi ${store.name}, I'd like to order`) : undefined} target="_blank" rel="noopener noreferrer" className="bq-btn" style={{ background: "#25D366", color: "#fff", border: "1.5px solid #25D366" }}>
              <Icon name="whatsapp" size={17} /> Order on WhatsApp
            </a>
          </div>
        ) : null}
      </section>
    );
  }

  function shopGrid(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const card = cardOptions(section);
    // The layouts picked under "Shop page style"; sections without one keep the classic grid below, as before.
    const browse = readShopLayoutOptions(section.settings);
    if (browse.layout !== "classic") {
      return (
        <ShopBrowser
          products={products}
          collections={shopper.collections}
          options={browse}
          query={filter}
          onQuery={setFilter}
          title={text(copy.title) || "Shop all"}
          renderTitle={(id, label) => <SectionTitle look={look} id={id}>{label}</SectionTitle>}
          renderTile={(product, i) => (
            <ProductTile product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 4} {...card} />
          )}
          palette={{ ink: t.ink, muted: t.muted, border: t.border, paper: t.paperBg, raised: look.raised, accent: t.accent, ctaBg: t.ctaBg, ctaText: t.ctaText, headingFont: look.headingFont, buttonRadius: look.buttonRadius, cardRadius: look.cardRadius }}
          formatPrice={(amount) => formatStoreMoney(amount, store.currency)}
          editor={!live}
          wrapClassName="bq-wrap"
        />
      );
    }
    const options = readShopGridOptions(section.settings);
    const collection = shopper.collections.find((entry) => entry.id === filter.collection);
    let list = searchProducts(products, filter.q);
    if (collection) list = list.filter((product) => collection.productIds.includes(product.id));
    else if (filter.category) list = list.filter((product) => product.category?.slug === filter.category);
    if (filter.sort === "price-low") list = [...list].sort((a, b) => a.retailPrice - b.retailPrice);
    if (filter.sort === "price-high") list = [...list].sort((a, b) => b.retailPrice - a.retailPrice);
    if (filter.sort === "rating") list = bestSellers(list);
    const shownCount = options.pageSize ? Math.max(options.pageSize, shopShown[section.id] ?? 0) : list.length;
    const visible = list.slice(0, shownCount);
    const headingId = `${uid}-${section.id}`;
    const sidebar = options.filters === "sidebar";
    const chip = (key: string, label: string, active: boolean, onClick: () => void) => (
      <button key={key} type="button" aria-pressed={active} onClick={onClick} className={sidebar ? "w-full rounded-[10px] border-0 px-3 py-2 text-left text-[14px]" : "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium"} style={sidebar ? { background: active ? look.raised : "transparent", color: t.ink, fontWeight: active ? 600 : 400, cursor: "pointer" } : { borderColor: active ? t.ink : t.border, background: active ? t.ink : "transparent", color: active ? t.paperBg : t.ink, cursor: "pointer" }}>
        {label}
      </button>
    );
    const search = (
      <label className={`flex h-11 min-w-0 items-center gap-2 rounded-full border px-4 ${sidebar ? "w-full" : "flex-1"}`} style={{ borderColor: t.border }}>
        <Icon name="search" size={16} color={t.muted} />
        <span className="sr-only">Search products</span>
        <input type="search" value={filter.q} onChange={(event) => setFilter((prev) => ({ ...prev, q: event.target.value }))} placeholder="Search products" className="h-full w-full bg-transparent text-[14.5px] outline-none" style={{ color: t.ink }} />
      </label>
    );
    const sort = (
      <label className={`flex items-center gap-2 text-[13.5px] ${sidebar ? "w-full" : ""}`} style={{ color: t.muted }}>
        Sort
        <select value={filter.sort || "featured"} onChange={(event) => setFilter((prev) => ({ ...prev, sort: event.target.value as ShopSort }), "push")} className={`h-11 rounded-full border bg-transparent px-3 text-[14px] ${sidebar ? "min-w-0 flex-1" : ""}`} style={{ borderColor: t.border, color: t.ink }}>
          <option value="featured">Newest</option>
          <option value="rating">Best rated</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
        </select>
      </label>
    );
    const hasGroups = categories.length > 0 || shopper.collections.length > 0;
    const chips = hasGroups ? (
      <div className={sidebar ? "grid gap-0.5" : "flex gap-2 overflow-x-auto pb-1"} role="group" aria-label="Filter by category">
        {chip("all", sidebar ? "All products" : "All", !filter.category && !filter.collection, () => setFilter((prev) => withGroup(prev, null), "push"))}
        {shopper.collections.map((entry) => chip(`c-${entry.id}`, entry.name, filter.collection === entry.id, () => setFilter((prev) => withGroup(prev, { kind: "collection", key: entry.id }), "push")))}
        {categories.map((entry) => chip(entry.slug, entry.name, filter.category === entry.slug && !filter.collection, () => setFilter((prev) => withGroup(prev, { kind: "category", key: entry.slug }), "push")))}
      </div>
    ) : null;
    const tile = (product: ShopperProduct, i: number) => (
      <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 4} size={options.view === "large" ? "large" : "regular"} {...card} />
    );
    const row = (product: ShopperProduct, i: number) => {
      const inner = (
        <>
          <span className="bq-media block">
            {product.images[0] ? <img src={product.images[0]} alt="" width={280} height={280} loading={i < 4 ? "eager" : "lazy"} decoding="async" /> : null}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[16px] font-semibold leading-snug" style={{ fontFamily: look.headingFont }}>{product.name}</span>
            {text(product.description) ? <span className="line-clamp-2 text-[13.5px] leading-5" style={{ color: t.muted }}>{text(product.description)}</span> : null}
            {card.showRating && product.avgRating && product.reviewCount ? (
              <span className="text-[12.5px]" style={{ color: t.muted }}><span aria-hidden style={{ color: "#F2A93B" }}>★</span> {product.avgRating.toFixed(1)} ({product.reviewCount})</span>
            ) : null}
            <span className="mt-1 text-[15px] font-bold">{formatStoreMoney(product.retailPrice, product.currency)}</span>
          </span>
          <span className="bq-shop-row-side">
            <span className="text-[13px] font-semibold underline underline-offset-4">View</span>
          </span>
        </>
      );
      const href = productHref(product.id);
      return (
        <div key={product.id} className="grid gap-2">
          {href ? (
            <Link href={href} prefetch={false} className="bq-shop-row">{inner}</Link>
          ) : (
            <button type="button" className="bq-shop-row" onClick={live ? undefined : () => openProduct(product.id)}>{inner}</button>
          )}
          {card.onQuickAdd ? (
            <button type="button" className="bq-btn justify-self-start" style={{ ...look.primaryButton, minHeight: 40, fontSize: 13.5 }} onClick={() => card.onQuickAdd?.(product.id)} disabled={Boolean(soldOutLabel(product))} aria-label={soldOutLabel(product) ? `${product.name} is sold out` : `Add ${product.name} to bag`}>
              {soldOutLabel(product) ?? <><Icon name="bag" size={15} aria-hidden /> Add to bag</>}
            </button>
          ) : null}
        </div>
      );
    };
    const results = (
      <div className="min-w-0">
        <p className="mb-3 text-[13px]" style={{ color: t.muted }} aria-live="polite">{list.length} {list.length === 1 ? "product" : "products"}</p>
        {visible.length ? (
          options.view === "list" ? (
            <div className="bq-shop-list">{visible.map(row)}</div>
          ) : (
            <div className="bq-shop-grid" data-view={options.view === "large" ? "large" : undefined} data-cols={options.view === "grid" && options.columns !== "auto" ? options.columns : undefined}>
              {visible.map(tile)}
            </div>
          )
        ) : (
          <p className="py-10 text-center text-[14.5px]" style={{ color: t.muted }}>{products.length ? "Nothing matches. Try another word or category." : "Products are on the way. Check back soon."}</p>
        )}
        {visible.length < list.length ? (
          <div className="mt-8 flex flex-col items-center gap-2">
            <p className="m-0 text-[13px]" style={{ color: t.muted }}>Showing {visible.length} of {list.length}</p>
            <button type="button" className="bq-btn" style={look.secondaryButton} onClick={(event) => { event.stopPropagation(); setShopShown((prev) => ({ ...prev, [section.id]: shownCount + (options.pageSize ?? list.length) })); }}>
              Show more
            </button>
          </div>
        ) : null}
      </div>
    );
    const title = <SectionTitle look={look} id={headingId}>{collection?.name ?? (filter.category ? categories.find((entry) => entry.slug === filter.category)?.name : null) ?? (text(copy.title) || "Shop all")}</SectionTitle>;
    if (sidebar) {
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-8">
          {title}
          <div className="bq-shop-layout">
            <aside className="bq-shop-aside grid gap-4" aria-label="Filters">
              {search}
              {sort}
              {chips}
            </aside>
            {results}
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-8">
        {title}
        {options.filters === "top" ? (
          <div className="mb-5 grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {search}
              {sort}
            </div>
            {chips}
          </div>
        ) : null}
        {results}
      </section>
    );
  }

  function reviewsSection(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const reviews = shopper.reviews.slice(0, readProductLimit(section.settings, 3));
    if (!reviews.length) return editorHint("Customer reviews appear here once shoppers review their orders. We never show made-up reviews.");
    const headingId = `${uid}-${section.id}`;
    const carousel = section.settings?.layout === "carousel";
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <h2 id={headingId} className="bq-h text-center text-[28px]" style={look.headingStyle}>{text(copy.title) || "What customers say"}</h2>
        {shopper.rating ? (
          <p className="mt-2 text-center text-[13.5px]" style={{ color: t.muted }}>
            <span aria-hidden style={{ color: "#F2A93B", letterSpacing: 1.5 }}>★★★★★</span> {shopper.rating.average.toFixed(1)} from {shopper.rating.count} {shopper.rating.count === 1 ? "review" : "reviews"}
          </p>
        ) : null}
        <ul
          className={carousel ? "mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]" : "mt-6 grid gap-3 bq-cols-3"}
          style={carousel ? undefined : { gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
          aria-label={carousel ? "Reviews. Swipe or scroll sideways for more." : undefined}
          tabIndex={carousel ? 0 : undefined}
        >
          {reviews.map((review) => (
            <li key={review.id} className={carousel ? "w-[min(320px,85%)] shrink-0 snap-start rounded-[14px] p-5" : "rounded-[14px] p-5"} style={{ background: look.raised }}>
              <span aria-hidden style={{ color: "#F2A93B", letterSpacing: 1.5 }}>{"★".repeat(review.rating)}</span>
              <span className="sr-only">{review.rating} out of 5</span>
              <blockquote className="m-0 mt-2 text-[14.5px] leading-6">“{review.body}”</blockquote>
              <p className="mt-3 text-[13.5px] font-semibold">
                {review.buyerName}
                {review.productName ? <span className="font-normal" style={{ color: t.muted }}> · {review.productName}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function story(section: TemplateSectionNode) {
    const copy = copyOf(section);
    // The seller's own picture, else the theme's stock story photo (unless turned off), else a product photo.
    const stockStory = section.settings?.stockImage === false ? undefined : stockImages?.story;
    const image = itemImages(section)[0] ?? stockStory ?? products[1]?.images[0] ?? products[0]?.images[0];
    const body = text(copy.body) || text(store.description);
    const headingId = `${uid}-${section.id}`;
    const onAbout = current === "about";
    const storyButton = (
      <button type="button" className="bq-btn mt-2" style={{ ...look.secondaryButton, minHeight: 44 }} onClick={() => go(onAbout ? "contact" : pageTypes.has("about") ? "about" : "contact")}>
        {onAbout ? "Get in touch" : text(copy.primaryCta) || "Our story"}
      </button>
    );
    // "Picture right" moves the picture after the words on wide screens; phones keep the picture on top.
    const pictureRight = section.settings?.imagePosition === "right";
    const eyebrow = text(copy.eyebrow) ? <p className="text-[12px] uppercase" style={{ color: look.dark ? t.accent : t.muted, letterSpacing: "0.22em" }}>{text(copy.eyebrow)}</p> : null;
    if (section.settings?.layout === "centered") {
      // Words only, centred: for a short statement or an About page that leads with the story.
      return (
        <section aria-labelledby={headingId} className="py-14 @3xl:py-24" style={{ background: look.storyBg }}>
          <div className="bq-wrap mx-auto flex max-w-[820px] flex-col items-center gap-4 text-center">
            {eyebrow}
            <h2 id={headingId} className="bq-h text-[34px] @3xl:text-[52px]" style={{ ...look.headingStyle, lineHeight: 1.06 }}>{text(copy.title) || store.name}</h2>
            {body ? <p className="max-w-[640px] whitespace-pre-line text-[16px] leading-8" style={{ color: t.muted }}>{body}</p> : null}
            {storyButton}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "banner") {
      // A wide picture across the page, the words centred under it.
      return (
        <section aria-labelledby={headingId} style={{ background: look.storyBg }}>
          <div className="bq-media w-full" style={{ aspectRatio: "21 / 9", minHeight: 220 }}>
            {image ? <img src={image} alt="" width={1600} height={686} loading="lazy" /> : null}
          </div>
          <div className="bq-wrap mx-auto flex max-w-[760px] flex-col items-center gap-4 py-12 text-center @3xl:py-16">
            {eyebrow}
            <h2 id={headingId} className="bq-h text-[30px] @3xl:text-[42px]" style={{ ...look.headingStyle, lineHeight: 1.08 }}>{text(copy.title) || store.name}</h2>
            {body ? <p className="max-w-[620px] whitespace-pre-line text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
            {storyButton}
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "framed") {
      // The picture inside an offset frame line, words beside it (Kyau's about page).
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12 @3xl:py-16">
          <div className="grid items-center gap-10 @3xl:grid-cols-[1.1fr_1fr] @3xl:gap-16">
            <div className={`flex flex-col items-start gap-3 ${pictureRight ? "" : "@3xl:order-2"}`}>
              {eyebrow}
              <h2 id={headingId} className="bq-h text-[30px] @3xl:text-[38px]" style={{ ...look.headingStyle, lineHeight: 1.1 }}>{text(copy.title) || store.name}</h2>
              {body ? <p className="m-0 whitespace-pre-line text-[15.5px] leading-8" style={{ color: t.muted }}>{body}</p> : null}
              {storyButton}
            </div>
            <div className="relative mx-auto w-full max-w-[460px] p-5">
              <div aria-hidden className="absolute inset-0 translate-x-0 translate-y-0" style={{ border: `3px solid ${t.border}` }} />
              <div className="bq-media relative -translate-x-6 -translate-y-6 aspect-[4/5]" style={{ borderRadius: look.cardRadius }}>{image ? <img src={image} alt="" width={800} height={1000} loading="lazy" /> : null}</div>
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "word") {
      // The words on the left; the picture on the right with the eyebrow as one giant word across its bottom (Àlùkò).
      const word = text(copy.eyebrow);
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-14 @3xl:py-20">
          <div className="grid items-center gap-10 @3xl:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col items-start gap-4">
              <h2 id={headingId} className="bq-h m-0 text-[36px] @3xl:text-[48px]" style={{ ...look.headingStyle, fontWeight: 800, lineHeight: 1.04 }}>{text(copy.title) || store.name}</h2>
              {body ? <p className="m-0 whitespace-pre-line text-[14.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {storyButton}
            </div>
            <div className="relative">
              <div className="bq-media aspect-[4/3]" style={{ borderRadius: look.cardRadius }}>{image ? <img src={image} alt="" width={900} height={675} loading="lazy" /> : null}</div>
              {word ? <p aria-hidden className="pointer-events-none absolute -bottom-3 left-0 m-0 w-full overflow-hidden whitespace-nowrap text-white" style={{ fontFamily: look.headingFont, fontWeight: 800, fontSize: "clamp(56px, 9cqi, 120px)", lineHeight: 1, textShadow: "0 4px 20px rgba(0,0,0,.25)" }}>{word}</p> : null}
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "panel") {
      // A wide picture with the words on a dark panel over its left side (Ìjókòó); phones stack them.
      return (
        <section aria-labelledby={headingId} className="relative overflow-hidden" style={{ background: t.ink, color: "#FFFFFF" }}>
          <div className="@3xl:absolute @3xl:inset-0">
            <div className="bq-media aspect-video w-full @3xl:aspect-auto @3xl:h-full" style={{ borderRadius: 0, minHeight: 220 }}>{image ? <img src={image} alt="" width={1600} height={900} loading="lazy" /> : null}</div>
          </div>
          <div className={`relative flex flex-col items-start gap-4 px-6 py-10 @3xl:min-h-[440px] @3xl:w-[44%] @3xl:justify-center @3xl:px-14 ${pictureRight ? "@3xl:ml-auto" : ""}`} style={{ background: "rgba(43,43,43,.86)" }}>
            {text(copy.eyebrow) ? <p className="m-0 text-[12px] font-semibold uppercase" style={{ letterSpacing: "0.18em", color: t.accent }}>{text(copy.eyebrow)}</p> : null}
            <h2 id={headingId} className="bq-h m-0 text-[28px] @3xl:text-[36px]" style={{ ...look.headingStyle, lineHeight: 1.12 }}>{text(copy.title) || store.name}</h2>
            {body ? <p className="m-0 whitespace-pre-line text-[14.5px] leading-7 opacity-85">{body}</p> : null}
            <button type="button" className="bq-btn mt-1" style={look.primaryButton} onClick={() => go(onAbout ? "contact" : "products")}>{onAbout ? "Get in touch" : "View more"}</button>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "collage") {
      // Three overlapping pictures beside the words (Ìtẹ́, Tufafi): the story picture large, then more stock or product photos.
      const extras = [...(section.settings?.stockImage === false ? [] : stockImages?.extras ?? []), ...products.map((product) => product.images[0]).filter(Boolean) as string[]].filter((src) => src !== image);
      const [second, third] = extras;
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-14 @3xl:py-20">
          <div className="grid items-center gap-10 @3xl:grid-cols-2 @3xl:gap-16">
            <div className={`relative ${pictureRight ? "@3xl:order-2" : ""}`}>
              <div aria-hidden className="absolute -left-4 -top-6 h-28 w-28 opacity-70" style={{ backgroundImage: `radial-gradient(${t.ink}55 2px, transparent 2px)`, backgroundSize: "14px 14px" }} />
              <div className="relative grid grid-cols-[1.4fr_1fr] gap-4">
                <div className="bq-media row-span-2 aspect-[3/4]" style={{ borderRadius: look.cardRadius + 6 }}>{image ? <img src={image} alt="" width={700} height={930} loading="lazy" /> : null}</div>
                <div className="bq-media aspect-square" style={{ borderRadius: look.cardRadius + 6 }}>{second ? <img src={second} alt="" width={400} height={400} loading="lazy" /> : null}</div>
                <div className="bq-media aspect-[3/4] -ml-16 mt-6" style={{ borderRadius: look.cardRadius + 6, boxShadow: "0 18px 40px rgba(0,0,0,.18)" }}>{third ? <img src={third} alt="" width={400} height={530} loading="lazy" /> : null}</div>
              </div>
            </div>
            <div className="flex flex-col items-start gap-4">
              {eyebrow}
              <h2 id={headingId} className="bq-h m-0 text-[30px] @3xl:text-[38px]" style={{ ...look.headingStyle, lineHeight: 1.12 }}>{text(copy.title) || store.name}</h2>
              {body ? <p className="m-0 whitespace-pre-line text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {storyButton}
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "band") {
      // A full-width colour band: words on the left, the picture on the right with the eyebrow in a round badge (Èso).
      return (
        <section aria-labelledby={headingId} style={{ background: look.storyBg, color: t.ink }}>
          <div className="bq-wrap grid items-center gap-8 py-12 @3xl:grid-cols-2 @3xl:py-16">
            <div className="flex flex-col items-start gap-4">
              <h2 id={headingId} className="bq-h m-0 max-w-[12ch]" style={{ ...look.headingStyle, fontSize: "clamp(32px, 4.4cqi, 56px)", lineHeight: 1.08 }}>{text(copy.title) || store.name}</h2>
              {body ? <p className="m-0 max-w-[460px] whitespace-pre-line text-[15px] leading-7">{body}</p> : null}
              <button type="button" className="bq-btn mt-1" style={{ background: "transparent", color: t.ink, border: `2px solid ${t.ink}` }} onClick={() => go(onAbout ? "contact" : "products")}>{onAbout ? "Get in touch" : text(copy.primaryCta) || "Shop now"}</button>
            </div>
            <div className="relative mx-auto w-full max-w-[460px]">
              <div className="bq-media aspect-[4/3]" style={{ borderRadius: look.cardRadius + 8 }}>{image ? <img src={image} alt="" width={900} height={675} loading="lazy" /> : null}</div>
              {text(copy.eyebrow) ? <span className="absolute -left-4 -top-4 grid h-24 w-24 place-items-center rounded-full p-3 text-center text-[13px] font-bold leading-tight shadow-lg" style={{ background: "#FFFFFF", color: t.ink }}>{text(copy.eyebrow)}</span> : null}
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "promo") {
      // A grey panel: the picture on one side, a big centred heading and a shop button on the other (Àdó, Wuta).
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-10">
          <div className="grid items-center overflow-hidden @3xl:grid-cols-2" style={{ background: look.storyBg, borderRadius: look.cardRadius }}>
            <div className={`bq-media aspect-[4/3] h-full ${pictureRight ? "@3xl:order-2" : ""}`} style={{ borderRadius: 0 }}>{image ? <img src={image} alt="" width={900} height={675} loading="lazy" /> : null}</div>
            <div className="flex flex-col items-center gap-4 px-6 py-10 text-center @3xl:px-12">
              {text(copy.eyebrow) ? <p className="m-0 text-[15px] uppercase" style={{ color: t.muted, letterSpacing: "0.06em" }}>{text(copy.eyebrow)}</p> : null}
              <h2 id={headingId} className="bq-h max-w-[12ch] uppercase" style={{ ...look.headingStyle, fontWeight: 700, fontSize: "clamp(34px, 4.6cqi, 60px)", lineHeight: 1.04 }}>{text(copy.title) || store.name}</h2>
              {body ? <p className="m-0 max-w-[420px] whitespace-pre-line text-[14.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              <button type="button" className="bq-btn mt-1" style={look.primaryButton} onClick={() => go(onAbout ? "contact" : "products")}>{onAbout ? "Get in touch" : text(copy.primaryCta) || "Shop now"}</button>
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "quote") {
      // The story's words as a large quotation (Ìtàn's "quote of the day"); the title is who said it.
      return (
        <section aria-labelledby={headingId} className="py-14 @3xl:py-20" style={{ background: look.storyBg }}>
          <figure className="bq-wrap m-0 mx-auto flex max-w-[860px] flex-col items-center gap-5 text-center">
            {eyebrow}
            <h2 id={headingId} className="sr-only">{text(copy.title) || store.name}</h2>
            <blockquote className="bq-h m-0 text-[26px] @3xl:text-[36px]" style={{ ...look.headingStyle, lineHeight: 1.35 }}>
              <span aria-hidden style={{ color: t.accent }}>“</span>{body || text(copy.title) || store.name}<span aria-hidden style={{ color: t.accent }}>”</span>
            </blockquote>
            {body && text(copy.title) ? <figcaption className="text-[14px]" style={{ color: t.muted }}>{text(copy.title)}</figcaption> : null}
          </figure>
        </section>
      );
    }
    if (section.settings?.layout === "overlap") {
      // A wide picture with the words on a card that overlaps its edge.
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12 @3xl:py-20">
          <div className="relative grid @3xl:grid-cols-12 @3xl:items-center">
            <div className={`bq-media aspect-[4/3] @3xl:col-span-8 @3xl:aspect-[16/10] ${pictureRight ? "@3xl:col-start-5 @3xl:row-start-1" : "@3xl:col-start-1 @3xl:row-start-1"}`} style={{ borderRadius: look.cardRadius }}>
              {image ? <img src={image} alt="" width={1200} height={750} loading="lazy" /> : null}
            </div>
            <div className={`relative z-[1] mx-4 -mt-16 flex flex-col items-start gap-3 p-6 @3xl:row-start-1 @3xl:m-0 @3xl:p-10 ${pictureRight ? "@3xl:col-span-5 @3xl:col-start-1" : "@3xl:col-span-5 @3xl:col-start-8"}`} style={{ background: look.storyBg === t.paperBg ? t.cardBg : look.storyBg, borderRadius: look.cardRadius, boxShadow: "0 20px 50px rgba(0,0,0,.12)" }}>
              {eyebrow}
              <h2 id={headingId} className="bq-h text-[30px] @3xl:text-[40px]" style={{ ...look.headingStyle, lineHeight: 1.08 }}>{text(copy.title) || store.name}</h2>
              {body ? <p className="m-0 text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {storyButton}
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "editorial") {
      return (
        <section aria-labelledby={headingId} className="py-12 @3xl:py-16" style={{ background: look.storyBg }}>
          <div className="bq-wrap grid gap-8 @3xl:grid-cols-2 @3xl:items-center @3xl:gap-14">
            <div className={pictureRight ? "bq-media @3xl:order-2" : "bq-media"} style={{ aspectRatio: "4 / 5", borderRadius: look.cardRadius }}>
              {image ? <img src={image} alt="" width={800} height={1000} loading="lazy" /> : null}
            </div>
            <div className="flex flex-col items-start gap-4">
              {text(copy.eyebrow) ? <p className="text-[12px] uppercase" style={{ color: t.muted, letterSpacing: "0.22em" }}>{text(copy.eyebrow)}</p> : null}
              <h2 id={headingId} className="bq-h text-[32px] @3xl:text-[44px]" style={{ ...look.headingStyle, lineHeight: 1.08 }}>{text(copy.title) || store.name}</h2>
              {body ? <p className="max-w-[520px] text-[15.5px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
              {storyButton}
            </div>
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby={headingId} className="bq-split" style={{ background: look.storyBg }}>
        <div className={pictureRight ? "bq-media @3xl:order-2" : "bq-media"} style={{ aspectRatio: "4 / 3", minHeight: "100%" }}>
          {image ? <img src={image} alt="" width={900} height={675} loading="lazy" /> : null}
        </div>
        <div className="flex flex-col justify-center gap-3 px-6 py-10 @3xl:px-10">
          {text(copy.eyebrow) ? <p className="text-[11.5px] font-bold uppercase" style={{ color: look.dark ? t.accent : t.muted, letterSpacing: "0.22em" }}>{text(copy.eyebrow)}</p> : null}
          <h2 id={headingId} className="bq-h text-[28px] @3xl:text-[32px]" style={look.headingStyle}>{text(copy.title) || store.name}</h2>
          {body ? <p className="max-w-[520px] text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
          <div>
            <button type="button" className="bq-btn mt-2" style={look.id === "noir" ? { ...look.primaryButton, minHeight: 42 } : look.primaryButton} onClick={() => go(onAbout ? "contact" : pageTypes.has("about") ? "about" : "contact")}>
              {onAbout ? "Get in touch" : text(copy.primaryCta) || "Our story"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  function faq(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const items = (section.items ?? [])
      .map((item, index) => ({ id: `${section.id}-${index}`, question: text(item.question), answer: faqAnswer(item, shopper, store.currency) }))
      .filter((item) => item.question && (item.answer || (!live && !props.demo)));
    if (!items.length) return editorHint("Add questions and answers for shoppers.");
    const headingId = `${uid}-${section.id}`;
    const layout = text(section.settings?.layout);
    const title = text(copy.title) || "Questions";
    const missing = "Write your answer in the editor. Until then this question stays hidden from shoppers.";
    // Optional search box (FAQ settings): filters questions and answers as the shopper types.
    const searchable = section.settings?.searchable === true;
    const query = faqQuery[section.id] ?? "";
    const shown = searchable ? filterFaq(items, query) : items;
    const searchBox = searchable ? (
      <>
        <label className="mt-5 flex h-12 items-center gap-2 rounded-full border px-4" style={{ borderColor: t.border }}>
          <Icon name="search" size={16} color={t.muted} />
          <span className="sr-only">{text(copy.searchPlaceholder) || "Search questions"}</span>
          <input type="search" value={query} onChange={(event) => setFaqQuery((prev) => ({ ...prev, [section.id]: event.target.value }))} placeholder={text(copy.searchPlaceholder) || "Search questions"} className="h-full w-full bg-transparent text-[15px] outline-none" style={{ color: t.ink }} />
        </label>
        {query.trim() ? <p className="m-0 mt-2 text-[13px]" role="status" style={{ color: t.muted }}>{shown.length ? `${shown.length} ${shown.length === 1 ? "answer" : "answers"}` : "No answers match. Try another word, or contact us."}</p> : null}
      </>
    ) : null;
    // How the questions look (FAQ style in the builder); the product page follows the same style by default.
    const style = faqSectionStyle(section, "boutique");
    if (layout === "cards") {
      // Every answer open, in cards: quick to scan on a dedicated FAQ page.
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12">
          <h2 id={headingId} className="bq-h text-center text-[30px]" style={look.headingStyle}>{title}</h2>
          {searchBox ? <div className="mx-auto max-w-[720px]">{searchBox}</div> : null}
          <FaqList items={shown} style="cards" look={look} missing={missing} className="mt-8" />
        </section>
      );
    }
    const accordion = <FaqList key={style} items={shown} style={style} look={look} missing={missing} className={layout === "two-column" ? "" : "mt-6"} />;
    if (layout === "two-column") {
      // Heading and a way to get in touch on the left, the questions on the right.
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12">
          <div className="grid gap-6 @3xl:grid-cols-[0.8fr_1.2fr] @3xl:gap-14">
            <div className="flex flex-col items-start gap-3">
              <h2 id={headingId} className="bq-h text-[30px] @3xl:text-[36px]" style={look.headingStyle}>{title}</h2>
              <p className="m-0 text-[14.5px]" style={{ color: t.muted }}>Can&apos;t find your answer? We&apos;re happy to help.</p>
              {pageTypes.has("contact") ? (
                <button type="button" className="bq-btn mt-1" style={look.secondaryButton} onClick={() => go("contact")}>Contact us</button>
              ) : null}
            </div>
            <div>
              {searchBox}
              {accordion}
            </div>
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <div className={`mx-auto ${style === "cards" || style === "split" ? "max-w-[960px]" : "max-w-[720px]"}`}>
          <h2 id={headingId} className="bq-h text-center text-[30px]" style={look.headingStyle}>{title}</h2>
          {searchBox}
          {accordion}
        </div>
      </section>
    );
  }

  function newsletter(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const status = formStatus.newsletter ?? "idle";
    const headingId = `${uid}-${section.id}`;
    const inputId = `${uid}-newsletter`;
    if (section.settings?.layout === "photo") {
      // The form over a darkened photo (the theme's stock story picture, else a product photo) (Ìfẹ́).
      const photo = stockImages?.story ?? products[0]?.images[0];
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-10">
          <div className="relative overflow-hidden px-6 py-14 text-center text-white @3xl:px-16 @3xl:py-20" style={{ background: t.heroBg, borderRadius: look.cardRadius }}>
            {photo ? <div className="bq-media inset-0" style={{ position: "absolute", borderRadius: 0 }}><img src={photo} alt="" width={1400} height={700} loading="lazy" /></div> : null}
            <div aria-hidden className="absolute inset-0" style={{ background: "rgba(20,16,14,.62)" }} />
            <div className="relative mx-auto max-w-[680px]">
              <p className="m-0 text-[11px] uppercase tracking-[0.3em] opacity-80">Only the best</p>
              <h2 id={headingId} className="m-0 mt-2 text-[28px] uppercase @3xl:text-[40px]" style={{ fontFamily: look.headingFont, fontWeight: 400 }}>{text(copy.title) || "Subscribe to new drops"}</h2>
              {text(copy.body) ? <p className="m-0 mt-2 text-[14.5px] opacity-85">{text(copy.body)}</p> : null}
              <form className="mt-6 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void submitForm("newsletter"); }}>
                <label htmlFor={inputId} className="sr-only">{text(copy.placeholder) || "WhatsApp number or email"}</label>
                <input id={inputId} required minLength={5} value={form.newsletter} onChange={(event) => setForm((prev) => ({ ...prev, newsletter: event.target.value }))} placeholder={text(copy.placeholder) || "WhatsApp number or email"} className="h-12 min-w-0 flex-1 border-0 bg-white px-4 text-[14.5px]" style={{ color: "#111" }} />
                <button type="submit" className="bq-btn" style={{ background: t.accent, color: "#FFFFFF", border: `1.5px solid ${t.accent}` }} disabled={status === "sending"}>{status === "sending" ? "Sending…" : text(copy.buttonLabel) || "Subscribe"}</button>
              </form>
              <p className="m-0 mt-3 min-h-5 text-[13px]" role="status">{status === "sent" ? "Thanks, you're on the list." : status === "error" ? "That didn't go through. Please try again." : ""}</p>
            </div>
          </div>
        </section>
      );
    }
    if (section.settings?.layout === "split") {
      // A tinted box: the heading and text on the left, the form stacked on the right (Apẹ̀rẹ̀).
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-10">
          <div className="grid items-center gap-8 p-8 @3xl:grid-cols-2 @3xl:p-14" style={{ background: look.newsletterBg, borderRadius: look.cardRadius + 8 }}>
            <div>
              <h2 id={headingId} className="bq-h m-0 text-[30px] @3xl:text-[42px]" style={{ ...look.headingStyle, lineHeight: 1.1 }}>{text(copy.title) || "Subscribe to new drops"}</h2>
              {text(copy.body) ? <p className="m-0 mt-3 max-w-[420px] text-[15px] leading-7" style={{ color: t.muted }}>{text(copy.body)}</p> : null}
            </div>
            <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void submitForm("newsletter"); }}>
              <label htmlFor={inputId} className="text-[13px] font-semibold">{text(copy.placeholder) || "WhatsApp number or email"}</label>
              <input id={inputId} required minLength={5} value={form.newsletter} onChange={(event) => setForm((prev) => ({ ...prev, newsletter: event.target.value }))} className="h-12 min-w-0 rounded-[var(--bq-button-radius)] border bg-white px-4 text-[14.5px]" style={{ borderColor: t.border, color: "#111" }} />
              <button type="submit" className="bq-btn w-full" style={look.solidButton} disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : text(copy.buttonLabel) || "Subscribe"}
              </button>
              <p className="m-0 min-h-5 text-[13px]" role="status" style={{ color: status === "error" ? "#B42318" : t.muted }}>
                {status === "sent" ? "Thanks, you're on the list." : status === "error" ? "That didn't go through. Please try again." : ""}
              </p>
            </form>
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby={headingId} className="py-12" style={{ background: look.newsletterBg }}>
        <div className="bq-wrap text-center">
          <h2 id={headingId} className="bq-h text-[28px] @3xl:text-[32px]" style={look.headingStyle}>{text(copy.title) || "Subscribe to new drops"}</h2>
          {text(copy.body) ? <p className="mt-2 text-[14.5px]" style={{ color: t.muted }}>{text(copy.body)}</p> : null}
          <form className="mx-auto mt-5 flex max-w-[460px] flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void submitForm("newsletter"); }}>
            <label htmlFor={inputId} className="sr-only">{text(copy.placeholder) || "WhatsApp number or email"}</label>
            <input id={inputId} required minLength={5} value={form.newsletter} onChange={(event) => setForm((prev) => ({ ...prev, newsletter: event.target.value }))} placeholder={text(copy.placeholder) || "WhatsApp number or email"} className="h-12 min-w-0 flex-1 rounded-[var(--bq-button-radius)] border bg-white px-4 text-[14.5px]" style={{ borderColor: t.border, color: "#111" }} />
            <button type="submit" className="bq-btn" style={look.solidButton} disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : text(copy.buttonLabel) || "Subscribe"}
            </button>
          </form>
          <p className="mt-3 min-h-5 text-[13px]" role="status" style={{ color: status === "error" ? "#B42318" : t.muted }}>
            {status === "sent" ? "Thanks, you're on the list." : status === "error" ? "That didn't go through. Please try again." : ""}
          </p>
        </div>
      </section>
    );
  }

  function contact(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const status = formStatus.contact ?? "idle";
    const headingId = `${uid}-${section.id}`;
    const layout = text(section.settings?.layout);
    const field = (key: "name" | "email" | "phone", label: string, type = "text") => (
      <label className="grid gap-1 text-[13.5px] font-medium">
        {label}
        <input type={type} value={form[key]} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))} className="h-11 rounded-[10px] border bg-transparent px-3 text-[14.5px]" style={{ borderColor: t.border, color: t.ink }} autoComplete={key === "name" ? "name" : key === "email" ? "email" : "tel"} />
      </label>
    );
    const whatsappButton = shopper.whatsappNumber ? (
      <a href={live ? whatsappLink(shopper.whatsappNumber, `Hi ${store.name}`) : undefined} target="_blank" rel="noopener noreferrer" className="bq-btn mt-5" style={{ background: "#25D366", color: "#fff", border: "1.5px solid #25D366" }}>
        <Icon name="whatsapp" size={17} /> Chat on WhatsApp
      </a>
    ) : null;
    const place = [store.city, store.country].filter(Boolean).join(", ");
    const formEl = (
      <form className={layout === "split" ? "grid gap-3" : "mt-6 grid gap-3"} onSubmit={(event) => { event.preventDefault(); void submitForm("contact"); }}>
        {field("name", "Name")}
        <div className="grid gap-3 @3xl:grid-cols-2">{field("email", "Email", "email")}{field("phone", "Phone", "tel")}</div>
        <label className="grid gap-1 text-[13.5px] font-medium">
          Message
          <textarea required value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} rows={5} className="rounded-[10px] border bg-transparent px-3 py-2 text-[14.5px]" style={{ borderColor: t.border, color: t.ink }} />
        </label>
        <div>
          <button type="submit" className="bq-btn" style={look.solidButton} disabled={status === "sending" || (!form.email.trim() && !form.phone.trim())}>
            {status === "sending" ? "Sending…" : text(copy.buttonLabel) || "Send message"}
          </button>
        </div>
        <p role="status" className="min-h-5 text-[13px]" style={{ color: status === "error" ? "#B42318" : t.muted }}>
          {status === "sent" ? "Thanks. We'll get back to you soon." : status === "error" ? "That didn't send. Please try again." : !form.email.trim() && !form.phone.trim() ? "Add an email or phone so we can reply." : ""}
        </p>
      </form>
    );
    if (layout === "split") {
      // The invitation on a panel in the theme's banner colours, the form beside it.
      return (
        <section aria-labelledby={headingId} className="bq-wrap py-12">
          <div className="grid gap-6 @3xl:grid-cols-[0.9fr_1.1fr] @3xl:gap-10">
            <div className="flex flex-col items-start p-6 @3xl:p-10" style={{ background: t.heroBg, color: t.heroText, borderRadius: look.cardRadius + 4 }}>
              <h1 id={headingId} className="bq-h text-[32px] @3xl:text-[40px]" style={look.headingStyle}>{text(copy.title) || "Get in touch"}</h1>
              {text(copy.body) ? <p className="mt-3 text-[15px] leading-7 opacity-85">{text(copy.body)}</p> : null}
              {place ? <p className="mt-4 flex items-center gap-2 text-[14px] opacity-85"><Icon name="pin" size={15} /> {place}</p> : null}
              {whatsappButton}
            </div>
            {formEl}
          </div>
        </section>
      );
    }
    const intro = (
      <>
        <h1 id={headingId} className="bq-h text-[32px]" style={look.headingStyle}>{text(copy.title) || "Get in touch"}</h1>
        {text(copy.body) ? <p className="mt-2 text-[15px]" style={{ color: t.muted }}>{text(copy.body)}</p> : null}
        {whatsappButton}
      </>
    );
    if (layout === "card") {
      // The form in a raised card on the theme's tint.
      return (
        <section aria-labelledby={headingId} className="py-12 @3xl:py-16" style={{ background: t.cardBg }}>
          <div className="bq-wrap">
            <div className="mx-auto max-w-[640px] p-6 @3xl:p-10" style={{ background: t.paperBg, borderRadius: look.cardRadius + 6, boxShadow: "0 18px 50px rgba(0,0,0,.08)" }}>
              {intro}
              {formEl}
            </div>
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <div className="mx-auto max-w-[620px]">
          {intro}
          {formEl}
        </div>
      </section>
    );
  }

  function wishlistSection(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const saved = products.filter((product) => wished.includes(product.id));
    const headingId = `${uid}-${section.id}`;
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-10">
        <SectionTitle look={look} id={headingId}>{text(copy.title) || "Your wishlist"}</SectionTitle>
        {saved.length ? (
          <div className="bq-shop-grid">
            {saved.map((product) => (
              <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished onToggleWishlist={toggleWish} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-[14.5px]" style={{ color: t.muted }}>Tap the heart on any product to save it here.</p>
        )}
      </section>
    );
  }

  function productDetail() {
    const own: BoutiqueProductDetail | undefined = (selectedProductId ? products.find((entry) => entry.id === selectedProductId) : null) ?? products[0];
    // The builder shows a sample product until the store has one, so the product page can still be designed.
    const product = own ?? (live || props.demo ? undefined : samplePdpProduct(themeId, store.currency));
    if (!product) return editorHint("Add a product to preview the product page.");
    const related = relatedProducts(product, products);
    return (
      <BoutiqueProductView
        product={product}
        look={look}
        shopper={shopper}
        storeName={store.name}
        currency={store.currency}
        reviews={[]}
        avgRating={product.avgRating ?? 0}
        reviewCount={product.reviewCount ?? 0}
        related={related}
        onOpenRelated={openProduct}
        wishlistIds={wished}
        crumbs={[{ label: "Home", onSelect: () => go("home") }, { label: "Shop", onSelect: () => go("products") }, ...(product.category ? [{ label: product.category.name, onSelect: () => shopCategory(product.category!.slug) }] : []), { label: product.name }]}
        interactive={false}
        settings={pdpSettingsForSnapshot(snapshot, themeId)}
        catalog={products}
        notice={own || props.demo ? undefined : "Sample product. Your own products show here once you add them."}
      />
    );
  }

  function generic(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const title = text(copy.title);
    const body = text(copy.body) || text(copy.summary);
    if (!title && !body) return editorHint("\"{name}\" isn't part of the {theme} theme yet, so shoppers won't see it.", { name: section.name, theme: snapshot.templateName });
    return (
      <section className="bq-wrap py-10">
        <div className="mx-auto max-w-[720px]">
          {title ? <h2 className="bq-h text-[28px]" style={look.headingStyle}>{title}</h2> : null}
          {body ? <p className="mt-3 whitespace-pre-line text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
        </div>
      </section>
    );
  }

  /** What the ready-made blocks (./blocks) get to draw with: the same data and actions as the sections above. */
  function blockContext(section: TemplateSectionNode): BlockContext {
    return {
      section,
      copy: copyOf(section),
      settings: section.settings ?? {},
      items: section.items ?? [],
      look,
      store,
      shopper,
      products,
      live,
      editor: !live && !props.demo,
      headingId: `${uid}-${section.id}`,
      currentPage: current,
      go,
      openProduct,
      productHref,
      shopCollection,
      shopCategory,
      addToCart: live ? props.onAddToCart : undefined,
      openCart: props.onOpenCart,
      wished,
      toggleWish,
      visitorKey: props.visitorKey,
      editorHint,
      say,
    };
  }

  function render(section: TemplateSectionNode): React.ReactNode {
    if (isStoreBlock(section.kind)) return <StoreBlock ctx={blockContext(section)} />;
    if (section.kind === LAYOUT_ROW_KIND) {
      const editing = live || props.demo ? undefined : { selectedElementId: props.selectedElementId, onSelectElement: props.onSelectElement, onAddToColumn: props.onAddToColumn, onMoveElement: props.onMoveElement, text: say };
      return <LayoutRow ctx={blockContext(section)} editing={editing} />;
    }
    switch (section.kind) {
      case "hero-split":
        return hero(section);
      case "page-header":
        return pageHeader(section);
      case "category-grid":
      case "category-list":
        return categoryTiles(section);
      case "featured-products":
        if (isShopGridSection(section, current)) return shopGrid(section);
        if (section.settings?.source === "related") return null;
        return productRail(section);
      case "testimonials":
        return reviewsSection(section);
      case "payday-countdown":
        return <Countdown settings={section.settings} look={look} copy={copyOf(section)} onShop={() => go("products")} editor={!live && !props.demo} say={say} />;
      case "story-split":
      case "about-section":
        return story(section);
      case "faq":
        return faq(section);
      case "newsletter":
        return newsletter(section);
      case "contact-form":
        return contact(section);
      case "wishlist-grid":
        return wishlistSection(section);
      case "product-detail":
        return productDetail();
      case "cart-summary":
        return (
          <section className="bq-wrap py-12 text-center">
            <h1 className="bq-h text-[30px]" style={look.headingStyle}>{text(copyOf(section).title) || "Your bag"}</h1>
            <p className="mt-2 text-[14.5px]" style={{ color: t.muted }}>{props.cartCount ? `${props.cartCount} ${props.cartCount === 1 ? "item" : "items"} in your bag.` : "Your bag is empty."}</p>
            <button type="button" className="bq-btn mt-5" style={look.primaryButton} onClick={() => (props.cartCount ? props.onOpenCart?.() : go("products"))}>{props.cartCount ? "View bag" : "Start shopping"}</button>
          </section>
        );
      case "spin-wheel":
      case "scratch-card":
      case "reward-progress":
      case "loyalty-banner":
        return (
          <GameSection
            kind={section.kind as GameSectionKind}
            section={section}
            store={store}
            mode={live ? "live" : "editor"}
            colors={{ ink: t.ink, muted: t.muted, border: t.border, paper: t.paperBg, card: look.raised, cta: t.ctaBg, ctaText: t.ctaText, accent: t.accent, heading: look.headingFont, radius: look.cardRadius }}
          />
        );
      case "checkout-form":
        if (!live) {
          return (
            <CheckoutPreview
              theme={checkoutThemeFromLook(look)}
              settings={readCheckoutPageSettings(section, themeId)}
              store={store}
              nav={checkoutNavLinks(snapshot)}
              device={props.device}
            />
          );
        }
        return (
          <section className="bq-wrap py-12 text-center">
            <h1 className="bq-h text-[30px]" style={look.headingStyle}>Checkout</h1>
            {live ? (
              <Link href={getPublicStorefrontPath(basePath, "/checkout")} className="bq-btn mt-5" style={look.primaryButton}>Go to checkout</Link>
            ) : (
              <p className="mt-2 text-[14.5px]" style={{ color: t.muted }}>Shoppers check out on the secure checkout page.</p>
            )}
          </section>
        );
      default:
        return generic(section);
    }
  }

  // ─── Chrome ────────────────────────────────────────────────────────────────

  const pageHref = (key: string) => (live ? storefrontPageHref(basePath, key) ?? undefined : undefined);
  const menuCtx: MenuContext = {
    hasPage: (key) => Boolean(PAGE_LABELS[key]) && pageTypes.has(key),
    pageLabel: (key) => PAGE_LABELS[key],
    pageHref,
    goPage: go,
    categories,
    categoryHref: (slug) => (live ? storefrontPageHref(basePath, "products", new URLSearchParams({ category: slug })) ?? undefined : undefined),
    goCategory: shopCategory,
    products,
    productHref: (id) => (live ? getPublicStorefrontPath(basePath, `/product/${id}`) : undefined),
    storeHref: (path) => (live ? getPublicStorefrontPath(basePath, path) : undefined),
    goProduct: openProduct,
    current,
  };
  const menu = resolveMenu(readMenu(headerCopy), menuCtx);
  // The phone menu: its own items when the seller chose them (Navigation page or builder), else the main menu.
  const ownMobileMenu = readMobileMenu(headerCopy, headerSection?.settings);
  const mobileMenuItems = ownMobileMenu ? resolveMenu(ownMobileMenu, menuCtx) : undefined;
  // The footer links the seller picked, else the theme's usual ones.
  const savedFooterMenu = readFooterMenu(copyOf(footerSection));
  const defaultFooterLinks: ChromeLink[] = ["products", "faq", "about", "contact"]
    .filter((key) => pageTypes.has(key))
    .map((key) => ({ key, label: key === "faq" ? "Delivery and FAQ" : PAGE_LABELS[key]!, onSelect: () => go(key), href: pageHref(key) }));
  const footerLinks: ChromeLink[] = savedFooterMenu ? chromeLinksFromMenu(resolveMenu(savedFooterMenu, { ...menuCtx, categoriesUnderShop: false })) : defaultFooterLinks;
  const policyLinks: ChromeHref[] = live ? legalLinks(store.brandSettings).map((link) => ({ key: link.key, label: link.title, href: getPublicStorefrontPath(basePath, legalPagePath(link.key)) })) : [];
  // Seller guidance saved by older templates ("Add your shipping or payment message here.") counts as empty.
  const announcementText = shopperCopy(copyOf(announcementSection).text, store.name) || shopper.announcement;
  const logoText = text(headerCopy.logoText) && text(headerCopy.logoText) !== "Store" ? text(headerCopy.logoText) : store.name;
  const showNav = (live || props.device === "mobile") && !checkoutPreview;
  const editorStyle: React.CSSProperties = live ? {} : { minHeight: "100%" };
  // "Sidebar" header (Àga): on wide screens the header is a column on the left and the rest of the page sits beside it.
  const sidebarHeader = headerLayout === "sidebar";
  const announcementNode = announcementSection ? wrap(announcementSection, announcementText ? <AnnouncementBar text={announcementText} look={look} /> : live || props.demo ? null : (
    <div className="px-4 py-2 text-center text-[12px]" style={{ ...look.announcement, opacity: 0.55 }}>{say("Announcement shows your free-delivery and pay-on-delivery settings (none set yet)")}</div>
  )) : null;

  return (
    <div className={`bq ${BOUTIQUE_FONT_CLASS}`} data-pdp={pdpLayout(look, snapshot)} data-floating-nav={showNav && live ? "" : undefined} style={{ ...lookVars(look), ...editorStyle }} onClick={live ? undefined : () => props.onSelectSection?.(null)}>
      <style>{BOUTIQUE_CSS}</style>
      <a href="#bq-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to products</a>
      <div className={sidebarHeader ? "bq-shell" : "contents"}>
      {sidebarHeader ? null : announcementNode}
      <div className={sidebarHeader ? "bq-shell-side" : "contents"}>
      {headerSection ? wrap(headerSection, (
        <BoutiqueHeader
          store={store}
          logoText={logoText}
          look={look}
          menu={menu}
          menuStyle={menuStyleOf(headerSection.settings?.menuStyle)}
          mobileMenu={mobileMenuStyleOf(headerSection.settings?.mobileMenu)}
          mobileItems={mobileMenuItems}
          mobileExtra={live ? [{ id: "track", label: "Track an order", onSelect: () => setSheet("account"), children: [] }] : undefined}
          interactive={live}
          onHome={() => go("home")}
          onSearch={live ? () => setSheet("search") : () => undefined}
          onWishlist={live ? (props.onToggleWishlist ? () => setSheet("wishlist") : undefined) : () => undefined}
          onBag={live ? props.onOpenCart : () => undefined}
          cartCount={props.cartCount}
          wishlistCount={wished.length}
          cartLabel={text(headerCopy.cartLabel) && text(headerCopy.cartLabel) !== "Cart" ? text(headerCopy.cartLabel) : "My bag"}
          centred={headerLayout === "centered" || (headerLayout !== "split" && headerLayout !== "bold" && headerLayout !== "sidebar" && look.centredHeader)}
          bold={headerLayout === "bold"}
          sidebar={sidebarHeader}
          market={marketHeaderOf(headerLayout)}
          categoryBar={headerSection.settings?.categoryBar === true ? categories.slice(0, 10).map((category) => ({ id: category.slug, label: category.name, onSelect: () => shopCategory(category.slug), children: [] })) : null}
        />
      )) : null}
      </div>
      <div className={sidebarHeader ? "bq-shell-main" : "contents"}>
      {sidebarHeader ? announcementNode : null}
      <main id="bq-main" className={showNav ? "bq-page" : undefined} tabIndex={-1}>
        {groupHiddenRows(content).map((entry) => ("hidden" in entry ? <HiddenLayoutRowDrops key={`hidden:${entry.hidden[0]!.id}`} sections={entry.hidden} text={say} /> : wrap(entry.section, render(entry.section))))}
        {/* Builder: room for the "Add your first section" button on an empty page. */}
        {!live && !props.demo && shownContent.length === 0 ? <div aria-hidden style={{ minHeight: 280 }} /> : null}
      </main>
      {footerSection ? wrap(footerSection, (
        <BoutiqueFooter store={store} look={look} shopper={shopper} links={footerLinks} showLogo={footerSection.settings?.showLogo !== false} summary={text(copyOf(footerSection).summary)} onTrackOrder={live ? () => setSheet("account") : undefined} legalLinks={policyLinks} editor={!live && !props.demo} say={say} />
      )) : null}
      </div>
      </div>
      {showNav ? (
        <ShopperBottomNav
          storeSlug={store.slug}
          storeName={store.name}
          basePath={basePath}
          products={products}
          wishlistIds={wished}
          onToggleWishlist={props.onToggleWishlist}
          cartCount={props.cartCount}
          onOpenBag={props.onOpenCart}
          onHome={() => go("home")}
          colors={navColors(look)}
          placement={live ? "fixed" : "inline"}
          interactive={live}
          initialQuery={props.initialQuery}
          activeTab={current === "home" ? "home" : current === "wishlist" ? "wishlist" : undefined}
          sheet={live ? sheet : null}
          onSheetChange={setSheet}
        />
      ) : null}
    </div>
  );
}
