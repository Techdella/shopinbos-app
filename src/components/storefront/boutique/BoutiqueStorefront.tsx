"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import type { BoutiqueThemeId, StoreEditorSnapshot, TemplateSectionNode } from "@/lib/store-templates";
import {
  countdownParts,
  deliveryLines,
  formatStoreMoney,
  freeDeliveryPromise,
  lagosDayLabel,
  paydayLastDay,
  paydayWindow,
  readPaydaySettings,
  readShopperInfo,
  whatsappLink,
  type StorefrontShopperInfo,
} from "@/lib/storefront/shopper-info";
import { bestSellers, productCategories, searchProducts, type ShopperProduct } from "../shopper/catalog";
import { ShopperBottomNav, type ShopperSheet } from "../shopper/ShopperBottomNav";
import { AnnouncementBar, BoutiqueFooter, BoutiqueHeader, SectionTitle, type ChromeLink } from "./BoutiqueChrome";
import { BoutiqueProductView } from "./BoutiqueProductView";
import { BOUTIQUE_CSS, boutiqueLook, lookVars, navColors, type BoutiqueLook } from "./look";
import { ProductTile } from "./ProductTile";

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
  cartCount: number;
  onOpenCart?: () => void;
  onAddToCart?: (productId: string) => void;
  visitorKey?: string;
  wishlistProductIds: string[];
  onToggleWishlist?: (productId: string) => void;
  /** ?q= from the URL opens search with this query. */
  initialQuery?: string;
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

/** Faq answers left blank by the seller come from their own delivery and payment settings. */
export function faqAnswer(item: Record<string, unknown>, shopper: StorefrontShopperInfo, currency: string) {
  const written = text(item.answer);
  if (written) return written;
  if (item.answerSource === "delivery") {
    const lines = deliveryLines(shopper, currency);
    if (!lines.length) return "";
    const promise = freeDeliveryPromise(shopper.delivery);
    return `${lines.map((line) => `${line.place}: ${line.detail}`).join(". ")}.${promise ? ` ${promise}.` : ""}`;
  }
  if (item.answerSource === "payment") {
    const others = shopper.paymentLabels.filter((label) => label !== "Pay on delivery");
    if (shopper.payOnDelivery) {
      return `Yes. Pay on delivery is available${shopper.payOnDeliveryLimit ? ` for orders up to ${formatStoreMoney(shopper.payOnDeliveryLimit, currency)}` : ""}.${others.length ? ` You can also pay by ${others.join(", ").toLowerCase()}.` : ""}`;
    }
    return others.length ? `Not at the moment. You can pay by ${others.join(", ").toLowerCase()} at checkout.` : "";
  }
  return "";
}

function Countdown({ settings, look, copy, onShop, editor }: { settings: unknown; look: BoutiqueLook; copy: Record<string, unknown>; onShop: () => void; editor: boolean }) {
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
          {editor ? <p className="mt-1 text-[12px] opacity-60">Payday: {config.rule === "day-of-month" ? `the ${config.day}${config.weekendToFriday ? " (Friday before if it's a weekend)" : ""}` : config.rule === "last-friday" ? "last Friday of the month" : "last weekday of the month"}; runs {config.ends === "sunday" ? "until Sunday" : `${config.days} days`}.</p> : null}
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

export function BoutiqueStorefront(props: BoutiqueStorefrontProps) {
  const { themeId, store, snapshot, mode } = props;
  const live = mode === "live";
  const look = useMemo(() => boutiqueLook(themeId, snapshot.themeTokens), [themeId, snapshot.themeTokens]);
  const t = look.tokens;
  const shopper = useMemo(() => readShopperInfo(store.shopper), [store.shopper]);
  const products = store.storeProducts;
  const basePath = props.storeBasePath ?? "";
  const [sheet, setSheet] = useState<ShopperSheet>(live && props.initialQuery ? "search" : null);
  const [filter, setFilter] = useState<{ category: string; collection: string; q: string; sort: string }>({ category: "all", collection: "", q: "", sort: "featured" });
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [heroSlide, setHeroSlide] = useState(0);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [form, setForm] = useState<{ newsletter: string; name: string; email: string; phone: string; message: string }>({ newsletter: "", name: "", email: "", phone: "", message: "" });
  const [formStatus, setFormStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const railRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const uid = useId();

  const current = normalizePage(props.currentPage);
  const page = snapshot.pages.find((entry) => entry.pageType === current) ?? snapshot.pages.find((entry) => entry.pageType === "home") ?? snapshot.pages[0];
  const sections = (page?.sections ?? []).filter((entry) => entry.visible !== false);
  const announcementSection = sections.find((entry) => entry.kind === "announcement-bar");
  const headerSection = sections.find((entry) => entry.kind === "header");
  const footerSection = [...sections].reverse().find((entry) => entry.kind === "footer");
  const content = sections.filter((entry) => !["announcement-bar", "header", "footer"].includes(entry.kind));
  const headerCopy = copyOf(headerSection);
  const pageTypes = new Set(snapshot.pages.map((entry) => entry.pageType as string));
  const categories = useMemo(() => productCategories(products), [products]);
  const wished = props.wishlistProductIds;

  const productHref = (id: string) => (live ? getPublicStorefrontPath(basePath, `/product/${id}`) : undefined);
  const openProduct = (id: string) => {
    setSelectedProductId(id);
    props.onNavigate("product");
  };
  const toggleWish = live ? props.onToggleWishlist : undefined;

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
    setFilter((prev) => ({ ...prev, category: slug, collection: "" }));
    go("products");
  }

  function shopCollection(id: string) {
    setFilter((prev) => ({ ...prev, collection: id, category: "all" }));
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
    if (live) return <div key={section.id}>{node}</div>;
    const selected = props.selectedSectionId === section.id;
    return (
      <div
        key={section.id}
        data-section-id={section.id}
        onClick={(event) => {
          event.stopPropagation();
          props.onSelectSection?.(section.id);
        }}
        style={{ outline: selected ? "2.5px solid #0E9E85" : "2px solid transparent", outlineOffset: -2, cursor: "pointer", position: "relative" }}
      >
        {node}
      </div>
    );
  }

  function editorHint(message: string) {
    if (live) return null;
    return (
      <div className="bq-wrap py-6">
        <div className="rounded-[12px] border border-dashed px-4 py-5 text-center text-[13px]" style={{ borderColor: t.border, color: t.muted }}>{message}</div>
      </div>
    );
  }

  // ─── Sections ──────────────────────────────────────────────────────────────

  function hero(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const layout = text(section.settings?.layout) || (themeId === "noir" ? "noir-center" : themeId === "plain" ? "plain-slides" : "breeze-banner");
    const uploaded = itemImages(section);
    const fromProducts = products.map((product) => product.images[0]).filter(Boolean) as string[];
    const slides = (uploaded.length ? uploaded : fromProducts).slice(0, 3);
    const image = layout === "plain-slides" ? slides[heroSlide % Math.max(slides.length, 1)] : slides[0];
    const title = text(copy.title) || store.name;
    const body = text(copy.body) || (layout === "plain-slides" ? "" : text(store.description));
    const cta = text(copy.primaryCta) || "Shop now";
    const action = text(section.settings?.primaryButtonAction) || "products";
    const headingId = `${uid}-hero`;

    const img = image ? <img src={image} alt="" width={1600} height={900} loading="eager" fetchPriority="high" decoding="async" /> : null;

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
      return (
        <section aria-labelledby={headingId} aria-roledescription={slides.length > 1 ? "carousel" : undefined}>
          <div className="bq-hero bq-media" style={{ borderRadius: 0, margin: 0, background: look.placeholder }}>
            {img}
            <div className="absolute inset-0" style={{ background: image ? "linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0) 60%)" : "transparent" }} />
            <div className="bq-wrap absolute inset-x-0 bottom-0 pb-8" style={{ color: image ? "#fff" : t.ink }}>
              {text(copy.eyebrow) ? <p className="text-[12px] font-bold uppercase" style={{ letterSpacing: "0.22em" }}>{text(copy.eyebrow)}</p> : null}
              <h1 id={headingId} className="bq-h mt-2" style={{ ...look.headingStyle, fontSize: "clamp(32px, 5cqi, 52px)" }}>{title}</h1>
              {body ? <p className="mt-2 max-w-[520px] text-[15px] opacity-90">{body}</p> : null}
              <div className="mt-4 flex items-center gap-4">
                <button type="button" className="bq-btn" style={image ? { background: "#fff", color: "#111", border: "1.5px solid #fff" } : look.primaryButton} onClick={() => go(action)}>{cta}</button>
                {slides.length > 1 ? (
                  <div className="flex gap-1.5">
                    {slides.map((src, i) => (
                      <button key={src} type="button" onClick={() => setHeroSlide(i)} aria-label={`Show slide ${i + 1} of ${slides.length}`} aria-current={i === heroSlide % slides.length ? "true" : undefined} className="h-6 border-0 bg-transparent p-0" style={{ cursor: "pointer" }}>
                        <span className="block h-[3px] rounded-full" style={{ width: i === heroSlide % slides.length ? 22 : 10, background: image ? "#fff" : t.ink, opacity: i === heroSlide % slides.length ? 1 : 0.5 }} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
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

  function categoryTiles(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const tiles = shopper.collections.length
      ? shopper.collections.map((collection) => ({
          key: collection.id,
          name: collection.name,
          image: collection.imageUrl ?? products.find((product) => collection.productIds.includes(product.id))?.images[0] ?? null,
          onSelect: () => shopCollection(collection.id),
        }))
      : categories.map((category) => ({ key: category.slug, name: category.name, image: category.imageUrl, onSelect: () => shopCategory(category.slug) }));
    if (!tiles.length) return editorHint("Category tiles appear once your products have categories or you create collections.");
    const headingId = `${uid}-${section.id}`;
    return (
      <section aria-labelledby={headingId} className="bq-wrap pt-8">
        <SectionTitle look={look} id={headingId}>{text(copy.title) || "Shop by category"}</SectionTitle>
        <div className="bq-cats">
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
    // Hand-picked products first (template apply maps a few), then the rest by reviews and newness.
    return [...mapped, ...bestSellers(products).filter((product) => !mapped.includes(product))];
  }

  function productRail(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const list = sectionProducts(section).slice(0, 8);
    const headingId = `${uid}-${section.id}`;
    if (!list.length) {
      return live ? (
        <section className="bq-wrap py-10 text-center" aria-labelledby={headingId}>
          <h2 id={headingId} className="bq-h text-[24px]" style={look.headingStyle}>{text(copy.title) || "Best sellers"}</h2>
          <p className="mt-2 text-[14.5px]" style={{ color: t.muted }}>New pieces are on the way. Check back soon.</p>
        </section>
      ) : editorHint("Your best sellers show here once you add products.");
    }
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
          <button type="button" className="bq-icon-btn" style={{ background: look.id === "plain" ? t.ink : t.accent, color: look.dark ? "#0A0A0A" : "#fff", width: 36, height: 36 }} onClick={() => scroll(1)} aria-label={`Scroll ${text(copy.title) || "products"} forward`}>
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
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-10" style={look.dark ? { background: t.paperBg } : undefined}>
        <SectionTitle look={look} id={headingId} action={<>{shopAll}{arrows}</>}>{text(copy.title) || "Best sellers"}</SectionTitle>
        <div className="bq-rail" ref={(el) => { railRefs.current[section.id] = el; }}>
          {list.map((product, i) => (
            <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 2} />
          ))}
        </div>
      </section>
    );
  }

  function shopGrid(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const collection = shopper.collections.find((entry) => entry.id === filter.collection);
    let list = searchProducts(products, filter.q);
    if (collection) list = list.filter((product) => collection.productIds.includes(product.id));
    else if (filter.category !== "all") list = list.filter((product) => product.category?.slug === filter.category);
    if (filter.sort === "price-low") list = [...list].sort((a, b) => a.retailPrice - b.retailPrice);
    if (filter.sort === "price-high") list = [...list].sort((a, b) => b.retailPrice - a.retailPrice);
    if (filter.sort === "rating") list = bestSellers(list);
    const headingId = `${uid}-${section.id}`;
    const chip = (key: string, label: string, active: boolean, onClick: () => void) => (
      <button key={key} type="button" aria-pressed={active} onClick={onClick} className="shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium" style={{ borderColor: active ? t.ink : t.border, background: active ? t.ink : "transparent", color: active ? (look.dark ? "#0A0A0A" : "#fff") : t.ink, cursor: "pointer" }}>
        {label}
      </button>
    );
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-8">
        <SectionTitle look={look} id={headingId}>{collection?.name ?? (filter.category !== "all" ? categories.find((entry) => entry.slug === filter.category)?.name : null) ?? (text(copy.title) || "Shop all")}</SectionTitle>
        <div className="mb-5 grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border px-4" style={{ borderColor: t.border }}>
              <Icon name="search" size={16} color={t.muted} />
              <span className="sr-only">Search products</span>
              <input type="search" value={filter.q} onChange={(event) => setFilter((prev) => ({ ...prev, q: event.target.value }))} placeholder="Search products" className="h-full w-full bg-transparent text-[14.5px] outline-none" style={{ color: t.ink }} />
            </label>
            <label className="flex items-center gap-2 text-[13.5px]" style={{ color: t.muted }}>
              Sort
              <select value={filter.sort} onChange={(event) => setFilter((prev) => ({ ...prev, sort: event.target.value }))} className="h-11 rounded-full border bg-transparent px-3 text-[14px]" style={{ borderColor: t.border, color: t.ink }}>
                <option value="featured">Newest</option>
                <option value="rating">Best rated</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
            </label>
          </div>
          {categories.length || shopper.collections.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter by category">
              {chip("all", "All", filter.category === "all" && !filter.collection, () => setFilter((prev) => ({ ...prev, category: "all", collection: "" })))}
              {shopper.collections.map((entry) => chip(`c-${entry.id}`, entry.name, filter.collection === entry.id, () => setFilter((prev) => ({ ...prev, collection: entry.id, category: "all" }))))}
              {categories.map((entry) => chip(entry.slug, entry.name, filter.category === entry.slug && !filter.collection, () => setFilter((prev) => ({ ...prev, category: entry.slug, collection: "" }))))}
            </div>
          ) : null}
        </div>
        <p className="mb-3 text-[13px]" style={{ color: t.muted }} aria-live="polite">{list.length} {list.length === 1 ? "product" : "products"}</p>
        {list.length ? (
          <div className="bq-shop-grid">
            {list.map((product, i) => (
              <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 4} />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-[14.5px]" style={{ color: t.muted }}>{products.length ? "Nothing matches. Try another word or category." : "Products are on the way. Check back soon."}</p>
        )}
      </section>
    );
  }

  function reviewsSection(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const reviews = shopper.reviews.slice(0, 3);
    if (!reviews.length) return editorHint("Customer reviews appear here once shoppers review their orders. We never show made-up reviews.");
    const headingId = `${uid}-${section.id}`;
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <h2 id={headingId} className="bq-h text-center text-[28px]" style={look.headingStyle}>{text(copy.title) || "What customers say"}</h2>
        {shopper.rating ? (
          <p className="mt-2 text-center text-[13.5px]" style={{ color: t.muted }}>
            <span aria-hidden style={{ color: "#F2A93B", letterSpacing: 1.5 }}>★★★★★</span> {shopper.rating.average.toFixed(1)} from {shopper.rating.count} {shopper.rating.count === 1 ? "review" : "reviews"}
          </p>
        ) : null}
        <ul className="mt-6 grid gap-3 bq-cols-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {reviews.map((review) => (
            <li key={review.id} className="rounded-[14px] p-5" style={{ background: look.dark ? "#1B1B1B" : t.cardBg }}>
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
    const image = itemImages(section)[0] ?? products[1]?.images[0] ?? products[0]?.images[0];
    const body = text(copy.body) || text(store.description);
    const headingId = `${uid}-${section.id}`;
    const onAbout = current === "about";
    return (
      <section aria-labelledby={headingId} className="bq-split" style={{ background: look.dark ? "#1C1B1A" : t.cardBg }}>
        <div className="bq-media" style={{ aspectRatio: "4 / 3", minHeight: "100%" }}>
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
      .filter((item) => item.question && (item.answer || !live));
    if (!items.length) return editorHint("Add questions and answers for shoppers.");
    const headingId = `${uid}-${section.id}`;
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <div className="mx-auto max-w-[720px]">
          <h2 id={headingId} className="bq-h text-center text-[30px]" style={look.headingStyle}>{text(copy.title) || "Questions"}</h2>
          <div className="mt-6">
            {items.map((item) => {
              const open = openFaq === item.id;
              return (
                <div key={item.id} className="border-b" style={{ borderColor: t.border }}>
                  <h3 className="m-0">
                    <button type="button" aria-expanded={open} aria-controls={`${item.id}-a`} onClick={() => setOpenFaq(open ? null : item.id)} className="flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left text-[15px] font-medium" style={{ color: t.ink, cursor: "pointer" }}>
                      {item.question}
                      <Icon name={open ? "minus" : "plus"} size={16} />
                    </button>
                  </h3>
                  <div id={`${item.id}-a`} role="region" hidden={!open} className="pb-4 text-[14.5px] leading-7" style={{ color: t.muted }}>
                    {item.answer || "Write your answer in the editor. Until then this question stays hidden from shoppers."}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  function newsletter(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const status = formStatus.newsletter ?? "idle";
    const headingId = `${uid}-${section.id}`;
    const inputId = `${uid}-newsletter`;
    return (
      <section aria-labelledby={headingId} className="py-12" style={{ background: look.dark ? "#1C1B1A" : look.id === "plain" ? "#F2F2F2" : t.cardBg }}>
        <div className="bq-wrap text-center">
          <h2 id={headingId} className="bq-h text-[28px] @3xl:text-[32px]" style={look.headingStyle}>{text(copy.title) || "Subscribe to new drops"}</h2>
          {text(copy.body) ? <p className="mt-2 text-[14.5px]" style={{ color: t.muted }}>{text(copy.body)}</p> : null}
          <form className="mx-auto mt-5 flex max-w-[460px] flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void submitForm("newsletter"); }}>
            <label htmlFor={inputId} className="sr-only">{text(copy.placeholder) || "WhatsApp number or email"}</label>
            <input id={inputId} required minLength={5} value={form.newsletter} onChange={(event) => setForm((prev) => ({ ...prev, newsletter: event.target.value }))} placeholder={text(copy.placeholder) || "WhatsApp number or email"} className="h-12 min-w-0 flex-1 rounded-[var(--bq-button-radius)] border bg-white px-4 text-[14.5px]" style={{ borderColor: t.border, color: "#111" }} />
            <button type="submit" className="bq-btn" style={look.id === "noir" ? look.secondaryButton : look.primaryButton} disabled={status === "sending"}>
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
    const field = (key: "name" | "email" | "phone", label: string, type = "text") => (
      <label className="grid gap-1 text-[13.5px] font-medium">
        {label}
        <input type={type} value={form[key]} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))} className="h-11 rounded-[10px] border bg-transparent px-3 text-[14.5px]" style={{ borderColor: t.border, color: t.ink }} autoComplete={key === "name" ? "name" : key === "email" ? "email" : "tel"} />
      </label>
    );
    return (
      <section aria-labelledby={headingId} className="bq-wrap py-12">
        <div className="mx-auto max-w-[620px]">
          <h1 id={headingId} className="bq-h text-[32px]" style={look.headingStyle}>{text(copy.title) || "Get in touch"}</h1>
          {text(copy.body) ? <p className="mt-2 text-[15px]" style={{ color: t.muted }}>{text(copy.body)}</p> : null}
          {shopper.whatsappNumber ? (
            <a href={live ? whatsappLink(shopper.whatsappNumber, `Hi ${store.name}`) : undefined} target="_blank" rel="noopener noreferrer" className="bq-btn mt-5" style={{ background: "#25D366", color: "#fff", border: "1.5px solid #25D366" }}>
              <Icon name="whatsapp" size={17} /> Chat on WhatsApp
            </a>
          ) : null}
          <form className="mt-6 grid gap-3" onSubmit={(event) => { event.preventDefault(); void submitForm("contact"); }}>
            {field("name", "Name")}
            <div className="grid gap-3 @3xl:grid-cols-2">{field("email", "Email", "email")}{field("phone", "Phone", "tel")}</div>
            <label className="grid gap-1 text-[13.5px] font-medium">
              Message
              <textarea required value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} rows={5} className="rounded-[10px] border bg-transparent px-3 py-2 text-[14.5px]" style={{ borderColor: t.border, color: t.ink }} />
            </label>
            <div>
              <button type="submit" className="bq-btn" style={look.id === "noir" ? look.secondaryButton : look.primaryButton} disabled={status === "sending" || (!form.email.trim() && !form.phone.trim())}>
                {status === "sending" ? "Sending…" : text(copy.buttonLabel) || "Send message"}
              </button>
            </div>
            <p role="status" className="min-h-5 text-[13px]" style={{ color: status === "error" ? "#B42318" : t.muted }}>
              {status === "sent" ? "Thanks. We'll get back to you soon." : status === "error" ? "That didn't send. Please try again." : !form.email.trim() && !form.phone.trim() ? "Add an email or phone so we can reply." : ""}
            </p>
          </form>
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
    const product = (selectedProductId ? products.find((entry) => entry.id === selectedProductId) : null) ?? products[0];
    if (!product) return editorHint("Add a product to preview the product page.");
    const related = [...products.filter((entry) => entry.id !== product.id && entry.category?.slug && entry.category.slug === product.category?.slug), ...products.filter((entry) => entry.id !== product.id && entry.category?.slug !== product.category?.slug)];
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
      />
    );
  }

  function generic(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const title = text(copy.title);
    const body = text(copy.body) || text(copy.summary);
    if (!title && !body) return editorHint(`"${section.name}" isn't part of the ${snapshot.templateName} theme yet, so shoppers won't see it.`);
    return (
      <section className="bq-wrap py-10">
        <div className="mx-auto max-w-[720px]">
          {title ? <h2 className="bq-h text-[28px]" style={look.headingStyle}>{title}</h2> : null}
          {body ? <p className="mt-3 whitespace-pre-line text-[15px] leading-7" style={{ color: t.muted }}>{body}</p> : null}
        </div>
      </section>
    );
  }

  function render(section: TemplateSectionNode): React.ReactNode {
    switch (section.kind) {
      case "hero-split":
        return hero(section);
      case "category-grid":
      case "category-list":
        return categoryTiles(section);
      case "featured-products":
        if (section.settings?.layout === "grid" || current === "products") return shopGrid(section);
        if (section.settings?.source === "related") return null;
        return productRail(section);
      case "testimonials":
        return reviewsSection(section);
      case "payday-countdown":
        return <Countdown settings={section.settings} look={look} copy={copyOf(section)} onShop={() => go("products")} editor={!live} />;
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
      case "checkout-form":
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

  const navKeys = (Array.isArray(headerCopy.navLinks) ? (headerCopy.navLinks as unknown[]) : ["home", "products", "about", "contact"])
    .map((entry) => normalizePage(String(entry)))
    .filter((entry, index, all) => PAGE_LABELS[entry] && (entry === "home" || pageTypes.has(entry)) && all.indexOf(entry) === index);
  const links: ChromeLink[] = navKeys.map((key) => ({ key, label: PAGE_LABELS[key]!, onSelect: () => go(key), current: current === key }));
  const footerLinks: ChromeLink[] = ["products", "faq", "about", "contact"]
    .filter((key) => pageTypes.has(key))
    .map((key) => ({ key, label: key === "faq" ? "Delivery and FAQ" : PAGE_LABELS[key]!, onSelect: () => go(key) }));
  const announcementText = text(copyOf(announcementSection).text) || shopper.announcement;
  const logoText = text(headerCopy.logoText) && text(headerCopy.logoText) !== "Store" ? text(headerCopy.logoText) : store.name;
  const showNav = live || props.device === "mobile";
  const editorStyle: React.CSSProperties = live ? {} : { minHeight: "100%" };

  return (
    <div className="bq" style={{ ...lookVars(look), ...editorStyle }} onClick={live ? undefined : () => props.onSelectSection?.(null)}>
      <style>{BOUTIQUE_CSS}</style>
      <a href="#bq-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to products</a>
      {announcementSection ? wrap(announcementSection, announcementText ? <AnnouncementBar text={announcementText} look={look} /> : live ? null : (
        <div className="px-4 py-2 text-center text-[12px]" style={{ ...look.announcement, opacity: 0.55 }}>Announcement shows your free-delivery and pay-on-delivery settings (none set yet)</div>
      )) : null}
      {headerSection ? wrap(headerSection, (
        <BoutiqueHeader
          store={store}
          logoText={logoText}
          look={look}
          links={links}
          categories={categories}
          onHome={() => go("home")}
          onShopAll={() => { setFilter((prev) => ({ ...prev, category: "all", collection: "" })); go("products"); }}
          onCategory={shopCategory}
          onSearch={live ? () => setSheet("search") : () => undefined}
          onWishlist={live ? () => setSheet("wishlist") : () => undefined}
          onBag={live ? props.onOpenCart : () => undefined}
          cartCount={props.cartCount}
          wishlistCount={wished.length}
          cartLabel={text(headerCopy.cartLabel) && text(headerCopy.cartLabel) !== "Cart" ? text(headerCopy.cartLabel) : "My bag"}
          centred={headerSection.settings?.layout === "centered" || themeId === "plain"}
        />
      )) : null}
      <main id="bq-main" className={showNav ? "bq-page" : undefined} tabIndex={-1}>
        {content.map((section) => wrap(section, render(section)))}
      </main>
      {footerSection ? wrap(footerSection, (
        <BoutiqueFooter store={store} look={look} shopper={shopper} links={footerLinks} summary={text(copyOf(footerSection).summary)} onTrackOrder={live ? () => setSheet("account") : undefined} />
      )) : null}
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
