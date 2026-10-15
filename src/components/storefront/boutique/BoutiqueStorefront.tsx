"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { legalLinks, legalPagePath } from "@/lib/legal/pages";
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
import { bestSellers, productCategories, relatedProducts, searchProducts, type ShopperProduct } from "../shopper/catalog";
import { ShopperBottomNav, type ShopperSheet } from "../shopper/ShopperBottomNav";
import { AnnouncementBar, BoutiqueFooter, BoutiqueHeader, SectionTitle, type ChromeHref, type ChromeLink } from "./BoutiqueChrome";
import { BoutiqueProductView, type BoutiqueProductDetail } from "./BoutiqueProductView";
import { pdpSettingsForSnapshot } from "./pdp/pdp-logic";
import { samplePdpProduct } from "./pdp/sample-product";
import { BOUTIQUE_FONT_CLASS } from "./fonts";
import { BOUTIQUE_CSS, boutiqueLook, lookVars, navColors, pdpLayout, type BoutiqueLook } from "./look";
import { ProductTile } from "./ProductTile";
import { GameSection } from "../gamification/GameSection";
import { HeroSlider, slideAlign } from "../HeroSlider";
import { readHeroSlides, readProductLimit, readSlideLink, readSlideTiming, type HeroSlide, type SlideLink } from "@/lib/store-templates/section-content";
import type { GameSectionKind } from "@/lib/gamification/logic";

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
  const headerLayout = text(headerSection?.settings?.layout);
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
    if (live || props.demo) return <div key={section.id}>{node}</div>;
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
    if (live || props.demo) return null;
    return (
      <div className="bq-wrap py-6">
        <div className="rounded-[12px] border border-dashed px-4 py-5 text-center text-[13px]" style={{ borderColor: t.border, color: t.muted }}>{message}</div>
      </div>
    );
  }

  // ─── Sections ──────────────────────────────────────────────────────────────

  function hero(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const layout = text(section.settings?.layout) || look.defaultHero;
    const uploaded = itemImages(section);
    const fromProducts = products.map((product) => product.images[0]).filter(Boolean) as string[];
    const slides = (uploaded.length ? uploaded : fromProducts).slice(0, 3);
    const image = slides[0];
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
          setFilter((prev) => ({ ...prev, q, category: "all", collection: "" }));
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
      const pool = [...new Set([...uploaded, ...fromProducts])];
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
              {!whatsapp && !live && !props.demo ? <p className="text-[12.5px] opacity-70">Add your WhatsApp number in Live chat settings to show Order on WhatsApp here.</p> : null}
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
        : (fromProducts.length ? fromProducts.slice(0, 3) : [""]).map((src) => ({
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

  function productRail(section: TemplateSectionNode) {
    const copy = copyOf(section);
    const railLayout = text(section.settings?.layout);
    const list = sectionProducts(section).slice(0, readProductLimit(section.settings, railLayout === "dense" ? 12 : 8));
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
        <div className={railLayout === "tiles" ? "bq-tiles" : railLayout === "dense" ? "bq-dense" : "bq-rail"} ref={(el) => { railRefs.current[section.id] = el; }}>
          {list.map((product, i) => (
            <ProductTile key={product.id} product={product} look={look} href={productHref(product.id)} onOpen={live ? undefined : () => openProduct(product.id)} wished={wished.includes(product.id)} onToggleWishlist={toggleWish} eager={i < 2} />
          ))}
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
    const collection = shopper.collections.find((entry) => entry.id === filter.collection);
    let list = searchProducts(products, filter.q);
    if (collection) list = list.filter((product) => collection.productIds.includes(product.id));
    else if (filter.category !== "all") list = list.filter((product) => product.category?.slug === filter.category);
    if (filter.sort === "price-low") list = [...list].sort((a, b) => a.retailPrice - b.retailPrice);
    if (filter.sort === "price-high") list = [...list].sort((a, b) => b.retailPrice - a.retailPrice);
    if (filter.sort === "rating") list = bestSellers(list);
    const headingId = `${uid}-${section.id}`;
    const chip = (key: string, label: string, active: boolean, onClick: () => void) => (
      <button key={key} type="button" aria-pressed={active} onClick={onClick} className="shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium" style={{ borderColor: active ? t.ink : t.border, background: active ? t.ink : "transparent", color: active ? t.paperBg : t.ink, cursor: "pointer" }}>
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
    const image = itemImages(section)[0] ?? products[1]?.images[0] ?? products[0]?.images[0];
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
              <button type="submit" className="bq-btn" style={look.solidButton} disabled={status === "sending" || (!form.email.trim() && !form.phone.trim())}>
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
        return <Countdown settings={section.settings} look={look} copy={copyOf(section)} onShop={() => go("products")} editor={!live && !props.demo} />;
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
  const pageHref = (key: string) => (live ? getPublicStorefrontPath(basePath, key === "home" ? "/" : `/?page=${key}`) : undefined);
  const links: ChromeLink[] = navKeys.map((key) => ({ key, label: PAGE_LABELS[key]!, onSelect: () => go(key), current: current === key, href: pageHref(key) }));
  const footerLinks: ChromeLink[] = ["products", "faq", "about", "contact"]
    .filter((key) => pageTypes.has(key))
    .map((key) => ({ key, label: key === "faq" ? "Delivery and FAQ" : PAGE_LABELS[key]!, onSelect: () => go(key), href: pageHref(key) }));
  const policyLinks: ChromeHref[] = live ? legalLinks(store.brandSettings).map((link) => ({ key: link.key, label: link.title, href: getPublicStorefrontPath(basePath, legalPagePath(link.key)) })) : [];
  const announcementText = text(copyOf(announcementSection).text) || shopper.announcement;
  const logoText = text(headerCopy.logoText) && text(headerCopy.logoText) !== "Store" ? text(headerCopy.logoText) : store.name;
  const showNav = live || props.device === "mobile";
  const editorStyle: React.CSSProperties = live ? {} : { minHeight: "100%" };

  return (
    <div className={`bq ${BOUTIQUE_FONT_CLASS}`} data-pdp={pdpLayout(look, snapshot)} style={{ ...lookVars(look), ...editorStyle }} onClick={live ? undefined : () => props.onSelectSection?.(null)}>
      <style>{BOUTIQUE_CSS}</style>
      <a href="#bq-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to products</a>
      {announcementSection ? wrap(announcementSection, announcementText ? <AnnouncementBar text={announcementText} look={look} /> : live || props.demo ? null : (
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
          onWishlist={live ? (props.onToggleWishlist ? () => setSheet("wishlist") : undefined) : () => undefined}
          onBag={live ? props.onOpenCart : () => undefined}
          cartCount={props.cartCount}
          wishlistCount={wished.length}
          cartLabel={text(headerCopy.cartLabel) && text(headerCopy.cartLabel) !== "Cart" ? text(headerCopy.cartLabel) : "My bag"}
          centred={headerLayout === "centered" || (headerLayout !== "split" && headerLayout !== "bold" && look.centredHeader)}
        />
      )) : null}
      <main id="bq-main" className={showNav ? "bq-page" : undefined} tabIndex={-1}>
        {content.map((section) => wrap(section, render(section)))}
      </main>
      {footerSection ? wrap(footerSection, (
        <BoutiqueFooter store={store} look={look} shopper={shopper} links={footerLinks} summary={text(copyOf(footerSection).summary)} onTrackOrder={live ? () => setSheet("account") : undefined} legalLinks={policyLinks} />
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
