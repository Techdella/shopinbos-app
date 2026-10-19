// Section content that both storefront renderers and the builder read the same way: hero slides, media links
// (uploads, YouTube) and the in-memory upgrade of older saved sections. Pure data helpers with no runtime imports,
// so tests load this file without a bundler.
//
// Backwards compatibility: stores saved before slides had their own words keep working. A slide item that has no
// "heading", "text", "buttonLabel" or "link" of its own shows the section's heading, text and button, exactly as the
// old single-overlay slider did. migrateSection() writes those values onto the slides when a section is opened in
// the builder, so the panel shows what the shopper sees.

import type { StoreEditorSnapshot, TemplateSectionNode } from "./types";

/** Hero layouts that show a list of slides (2026 themes: "plain-slides"; older templates: "slideshow"). */
export const SLIDER_HERO_LAYOUTS = ["plain-slides", "slideshow"];

export const MAX_SLIDES = 6;

export function isSliderLayout(layout: unknown) {
  return typeof layout === "string" && SLIDER_HERO_LAYOUTS.includes(layout);
}

export type SlideLinkType = "page" | "product" | "url";

export interface SlideLink {
  type: SlideLinkType;
  value: string;
}

export type SlideTextTone = "light" | "dark";
export type SlideTextPosition = "left" | "center" | "right";

export interface HeroSlide {
  /** Image, uploaded video or YouTube link. Empty while the seller hasn't picked one. */
  mediaUrl: string;
  mediaType: "image" | "video" | "youtube" | "none";
  alt: string;
  heading: string;
  text: string;
  buttonLabel: string;
  link: SlideLink;
  textTone: SlideTextTone;
  textPosition: SlideTextPosition;
}

const SLIDE_KEYS = ["heading", "text", "buttonLabel", "link"] as const;

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isVideoFile(src: string) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(src);
}

/** https://youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID or /embed/ID → the video id. */
export function youTubeId(src: string): string | null {
  const url = src.trim();
  const match =
    url.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtu\.be\/([\w-]{6,})/i) ??
    url.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)([\w-]{6,})/i);
  return match ? match[1]! : null;
}

/** Muted, looping, no-controls embed for a background or slide video. */
export function youTubeEmbedUrl(src: string, options: { background?: boolean } = {}) {
  const id = youTubeId(src);
  if (!id) return null;
  const params = options.background
    ? `autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0`
    : "playsinline=1&modestbranding=1&rel=0";
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

export function mediaKind(src: string): HeroSlide["mediaType"] {
  if (!src) return "none";
  if (youTubeId(src)) return "youtube";
  if (isVideoFile(src)) return "video";
  return "image";
}

/** The picture or video an item carries, whichever key an older or newer save used. */
export function itemMediaUrl(item: Record<string, unknown> | undefined | null) {
  if (!item) return "";
  return str(item.videoUrl) || str(item.imageUrl) || str(item.resolvedSrc) || str(item.originalSrc);
}

/** Media fields to store on an item when the seller uploads, picks or pastes a link. */
export function mediaItemFields(url: string): Record<string, unknown> {
  const clean = url.trim();
  const kind = mediaKind(clean);
  return {
    imageUrl: clean,
    originalSrc: clean,
    resolvedSrc: clean,
    videoUrl: kind === "video" || kind === "youtube" ? clean : undefined,
  };
}

const PAGE_ACTIONS = new Set(["home", "products", "categories", "about", "contact", "faq", "blog", "wishlist", "cart", "checkout", "whatsapp"]);

/** A slide's button link. Older slides used the section's "Button opens" setting. */
export function readSlideLink(raw: unknown, settings?: Record<string, unknown>): SlideLink {
  if (raw && typeof raw === "object") {
    const link = raw as Record<string, unknown>;
    const type = link.type === "product" || link.type === "url" ? link.type : "page";
    const value = str(link.value);
    if (type === "page") return { type, value: value || "products" };
    return { type, value };
  }
  if (typeof raw === "string" && raw.trim()) {
    const value = raw.trim();
    if (/^(https?:)?\/\//i.test(value) || value.startsWith("/")) return { type: "url", value };
    return { type: "page", value };
  }
  const action = str(settings?.primaryButtonAction);
  if (action === "external") return { type: "url", value: str(settings?.primaryButtonUrl) };
  if (action && PAGE_ACTIONS.has(action)) return { type: "page", value: action };
  return { type: "page", value: "products" };
}

function copyOf(section: TemplateSectionNode): Record<string, unknown> {
  return (section.blocks?.find((block) => block.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

function isSlideItem(item: Record<string, unknown>) {
  return Boolean(itemMediaUrl(item)) || SLIDE_KEYS.some((key) => key in item);
}

/** The slides a slider hero shows, with older saves read the way they used to look. */
export function readHeroSlides(section: TemplateSectionNode): HeroSlide[] {
  const copy = copyOf(section);
  return (section.items ?? []).filter(isSlideItem).slice(0, MAX_SLIDES).map((item) => {
    const mediaUrl = itemMediaUrl(item);
    const own = (key: string, fallback: unknown) => (typeof item[key] === "string" ? str(item[key]) : str(fallback));
    return {
      mediaUrl,
      mediaType: mediaKind(mediaUrl),
      alt: str(item.alt),
      heading: own("heading", copy.title),
      text: own("text", copy.body),
      buttonLabel: own("buttonLabel", copy.primaryCta),
      link: readSlideLink(item.link, section.settings),
      textTone: item.textTone === "dark" ? "dark" : "light",
      textPosition: item.textPosition === "center" || item.textPosition === "right" ? item.textPosition : "left",
    };
  });
}

/** A new, empty slide (the panel's "Add slide"). */
export function newSlideItem(): Record<string, unknown> {
  return { imageUrl: "", heading: "", text: "", buttonLabel: "Shop now", link: { type: "page", value: "products" }, textTone: "light", textPosition: "left" };
}

export interface SlideTiming {
  autoplay: boolean;
  seconds: number;
}

export function readSlideTiming(settings: Record<string, unknown> | undefined): SlideTiming {
  const raw = Number(settings?.slideSeconds);
  return {
    autoplay: settings?.slideAutoplay !== false,
    seconds: Number.isFinite(raw) && raw > 0 ? Math.min(15, Math.max(3, Math.round(raw))) : 6,
  };
}

/** How many products a product section shows (featured products, rails, grids). */
export function readProductLimit(settings: Record<string, unknown> | undefined, fallback: number) {
  return readOptionalProductLimit(settings) ?? fallback;
}

/**
 * The product count the seller set ("How many products"), or null when they haven't set one. Renderers use it to
 * tell an explicit choice (always honoured, even on the shop page) from the layout's own default.
 */
export function readOptionalProductLimit(settings: Record<string, unknown> | undefined): number | null {
  const raw = settings?.limit;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.min(24, Math.max(1, Math.round(value))) : null;
}

/** Product section layouts (2026 themes) that are the full shop: every product, search, sort and filters. */
export const SHOP_GRID_LAYOUT = "grid";

/**
 * True when a product section shows the full shop grid. Sections saved before layouts were offered on the shop
 * page have no layout there and keep showing the full shop.
 */
export function isShopGridSection(section: Pick<TemplateSectionNode, "settings">, pageType: string) {
  const layout = str(section.settings?.layout);
  return layout === SHOP_GRID_LAYOUT || (!layout && pageType === "products");
}

export type ShopView = "grid" | "list" | "large";
export type ShopFilters = "top" | "sidebar" | "none";
export type ShopColumns = "auto" | "2" | "3" | "4" | "5";

export interface ShopGridOptions {
  /** Cards in a grid, rows with a description, or two big cards a row. */
  view: ShopView;
  /** Cards a row on computers; "auto" keeps the theme's own grid. Phones show two (one for large cards). */
  columns: ShopColumns;
  /** Search, sort and category filters above the products, in a side column, or hidden. */
  filters: ShopFilters;
  /** Products shown before a "Show more" button; null shows them all. */
  pageSize: number | null;
}

export const SHOP_PAGE_SIZES = [8, 12, 16, 24, 36, 48];

export function readShopGridOptions(settings: Record<string, unknown> | undefined): ShopGridOptions {
  const view = str(settings?.shopView);
  const columns = str(settings?.columns);
  const placement = str(settings?.filterPlacement);
  const size = Number(settings?.pageSize);
  return {
    view: view === "list" || view === "large" ? view : "grid",
    columns: columns === "2" || columns === "3" || columns === "4" || columns === "5" ? columns : "auto",
    // Older shop grids saved `filters: false` to hide the filters.
    filters: placement === "sidebar" || placement === "none" || placement === "top" ? placement : settings?.filters === false ? "none" : "top",
    pageSize: Number.isFinite(size) && size > 0 ? Math.min(96, Math.max(4, Math.round(size))) : null,
  };
}

export interface ProductCardOptions {
  /** Stars and review count under the price (only products with real reviews show them). */
  showRating: boolean;
  /** An "Add to bag" button on the card. */
  quickAdd: boolean;
  /** The product's second photo when a shopper points at the card. */
  hoverImage: boolean;
}

export function readProductCardOptions(settings: Record<string, unknown> | undefined): ProductCardOptions {
  return {
    showRating: settings?.showRating === true,
    quickAdd: settings?.quickAdd === true,
    hoverImage: settings?.hoverImage === true,
  };
}

/** End time for a promo countdown: a valid future-or-past date, or null when the seller hasn't set one. */
export function readCountdownEnd(settings: Record<string, unknown> | undefined): Date | null {
  const raw = str(settings?.endsAt);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface MigrateOptions {
  /** The theme's own banner layout, used when a hero has no layout saved (the 2026 "plain" theme defaults to slides). */
  heroDefault?: string;
}

const LEGACY_LAYOUTS: Record<string, Record<string, string>> = {
  "hero-split": { "full-bleed-split": "full-bleed" },
  // Dúdú and Turare were seeded with their own name for the side-by-side story.
  "story-split": { "noir-split": "boutique" },
};

/**
 * Upgrades an older saved section in memory (never in the published copy until the seller publishes again):
 * - pictures saved only as originalSrc/resolvedSrc gain imageUrl (and videoUrl for video files);
 * - renamed layouts are mapped to their current name, and trust bars styled by "tone" get that look as their layout;
 * - slider heroes get each slide's heading, text, button and link written onto the slide, copied from the
 *   section-wide values they used to share, so the panel's slide list shows what shoppers see.
 * Returns the same object when nothing needs changing.
 */
export function migrateSection(section: TemplateSectionNode, options: MigrateOptions = {}): TemplateSectionNode {
  let next = section;
  const layout = str(section.settings?.layout);
  const renamed = layout ? LEGACY_LAYOUTS[section.kind]?.[layout] : undefined;
  if (renamed) next = { ...next, settings: { ...(next.settings ?? {}), layout: renamed } };
  // Older trust bars chose their look from a "tone" (the renderer still does); saving it as the layout lets the
  // panel show the style the shopper actually sees.
  if (section.kind === "trust-strip" && !layout) {
    next = { ...next, settings: { ...(next.settings ?? {}), layout: section.settings?.tone === "premium-retail" ? "icon-row" : "metric-cards" } };
  }

  const items = next.items;
  if (Array.isArray(items) && items.length) {
    let itemsChanged = false;
    let list = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      if (str(item.imageUrl) || str(item.videoUrl)) {
        const url = str(item.imageUrl);
        if (url && !str(item.videoUrl) && isVideoFile(url)) {
          itemsChanged = true;
          return { ...item, videoUrl: url };
        }
        return item;
      }
      const legacy = str(item.resolvedSrc) || str(item.originalSrc);
      if (!legacy) return item;
      itemsChanged = true;
      return { ...item, imageUrl: legacy, ...(isVideoFile(legacy) ? { videoUrl: legacy } : {}) };
    });

    const heroLayout = str(next.settings?.layout) || (next.kind === "hero-split" ? options.heroDefault ?? "" : "");
    if (next.kind === "hero-split" && isSliderLayout(heroLayout)) {
      const copy = copyOf(next);
      list = list.map((item) => {
        if (!isSlideItem(item) || SLIDE_KEYS.every((key) => key in item)) return item;
        itemsChanged = true;
        return {
          ...item,
          heading: typeof item.heading === "string" ? item.heading : str(copy.title),
          text: typeof item.text === "string" ? item.text : str(copy.body),
          buttonLabel: typeof item.buttonLabel === "string" ? item.buttonLabel : str(copy.primaryCta) || "Shop now",
          link: item.link && typeof item.link === "object" ? item.link : readSlideLink(item.link, next.settings),
        };
      });
    }
    if (itemsChanged) next = { ...next, items: list };
  }
  return next;
}

export function migrateSnapshot<T extends StoreEditorSnapshot | null>(snapshot: T, options: MigrateOptions = {}): T {
  if (!snapshot || !Array.isArray(snapshot.pages)) return snapshot;
  let changed = false;
  const pages = snapshot.pages.map((page) => {
    if (!Array.isArray(page.sections)) return page;
    let pageChanged = false;
    const sections = page.sections.map((section) => {
      let next = migrateSection(section, options);
      // The shop page's product section always showed the full shop grid, whatever its layout said; one saved
      // without a layout gets "grid" written, so the panel shows (and keeps) what shoppers see.
      if (page.pageType === "products" && next.kind === "featured-products" && !str(next.settings?.layout)) {
        next = { ...next, settings: { ...(next.settings ?? {}), layout: SHOP_GRID_LAYOUT } };
      }
      if (next !== section) pageChanged = true;
      return next;
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, sections };
  });
  return changed ? { ...snapshot, pages } : snapshot;
}
