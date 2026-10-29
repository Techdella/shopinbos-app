// Rex Studio edits: Rex replies with a small JSON plan (switch theme, recolour, write or add sections, add a
// page) and this module validates it and applies it to the editor DRAFT. It never touches products, prices,
// orders or the published store, and it never puts made-up reviews on a page.
// Pure (zod only; template helpers are passed in), unit-tested in tests/behaviour.test.mjs.

import { z } from "zod";
import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode, ThemeTokenSet } from "@/lib/store-templates";

const PAGE_TYPES = ["home", "products", "product", "categories", "cart", "checkout", "wishlist", "blog", "about", "contact", "faq"] as const;
type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_TITLES: Record<PageType, string> = {
  home: "Home",
  products: "Shop",
  product: "Product",
  categories: "Collections",
  cart: "Bag",
  checkout: "Checkout",
  wishlist: "Wishlist",
  blog: "Blog",
  about: "About us",
  contact: "Contact",
  faq: "Questions",
};

/** Sections Rex may add, per renderer. The 2026 themes render a smaller, curated set. */
export const BOUTIQUE_SECTION_KINDS = ["hero-split", "category-grid", "featured-products", "testimonials", "payday-countdown", "story-split", "faq", "newsletter", "contact-form"];
export const CLASSIC_SECTION_KINDS = [
  "hero-split", "category-grid", "featured-products", "testimonials", "story-split", "about-section", "text-columns",
  "promo-banner", "trust-strip", "faq", "newsletter", "contact-form",
];

/** Sections whose items come from the store's own data; Rex never writes their items. */
const DATA_KINDS = new Set(["testimonials", "featured-products", "product-detail", "category-grid", "category-list", "cart-summary", "wishlist-grid", "checkout-form"]);
/** Library sections whose sample items are placeholders: they start empty unless Rex writes real ones. */
const PLACEHOLDER_ITEM_KINDS = new Set(["text-columns", "trust-strip", "blog-index", "delivery-info", "promo-banner", "story-split", "about-section"]);
const LOCKED_KINDS = new Set(["header", "footer", "announcement-bar"]);

const HEX = /^#[0-9a-fA-F]{6}$/;
const HTTPS_URL = /^https:\/\/\S+$/;

const shortText = (max: number) => z.preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().trim().max(max));

const CopySchema = z
  .record(z.string(), z.unknown())
  .transform((raw) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key)) continue;
      if (typeof value === "string") out[key] = value.trim().slice(0, 1500);
      else if (typeof value === "number") out[key] = String(value);
    }
    return out;
  });

const ItemSchema = z
  .record(z.string(), z.unknown())
  .transform((raw) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key) || typeof value !== "string") continue;
      if (key === "imageUrl") {
        if (HTTPS_URL.test(value.trim())) out.imageUrl = value.trim().slice(0, 2000);
        continue;
      }
      out[key] = value.trim().slice(0, 800);
    }
    return out;
  });

const OpSchema = z.object({
  action: z.enum(["update", "add", "remove", "hide", "show", "move", "duplicate"]),
  page: z.enum(PAGE_TYPES),
  kind: shortText(40),
  sectionId: shortText(80).optional().catch(undefined),
  copy: CopySchema.optional().catch(undefined),
  items: z.array(ItemSchema).max(12).optional().catch(undefined),
  imageUrl: z.string().trim().max(2000).regex(HTTPS_URL).optional().catch(undefined),
  position: z.enum(["top", "bottom"]).optional().catch(undefined),
  /** Put the section (added, moved or duplicated) right after / before this section id. */
  after: shortText(80).optional().catch(undefined),
  before: shortText(80).optional().catch(undefined),
  /** Any field the builder's inspector shows for the section, by id ({"layout": "full-bleed", "spacing": "roomy"}). */
  fields: z.record(z.string(), z.unknown()).optional().catch(undefined),
  summary: shortText(90).optional().catch(undefined),
});

/** Theme choices the 2026 (boutique) themes read (src/components/storefront/boutique/look.ts applyLookChoices). */
export const REX_FONT_PAIRS = ["theme", "classic", "modern", "clean", "bold"] as const;
export const REX_BUTTON_SHAPES = ["theme", "square", "rounded", "pill"] as const;
export const REX_PAGE_WIDTHS = ["narrow", "standard", "wide"] as const;
export const REX_PRODUCT_RATIOS = ["theme", "portrait", "square", "landscape"] as const;
const BOUTIQUE_ONLY_TOKENS = ["fontPair", "buttonShape", "pageWidth", "productRatio"] as const;
/** Store-wide layouts for the classic templates (snapshot.layoutFamily); the 2026 themes have their own. */
export const REX_LAYOUTS = [
  "minimal-showcase", "editorial-boutique", "fashion-runway", "food-market", "home-living", "electronics-grid", "book-lifestyle", "pet-lifestyle", "marketplace-grid",
] as const;
const LAYOUT_NAMES: Record<(typeof REX_LAYOUTS)[number], string> = {
  "minimal-showcase": "Minimal showcase",
  "editorial-boutique": "Editorial boutique",
  "fashion-runway": "Fashion runway",
  "food-market": "Food market",
  "home-living": "Home and living",
  "electronics-grid": "Electronics grid",
  "book-lifestyle": "Books and lifestyle",
  "pet-lifestyle": "Pets",
  "marketplace-grid": "Marketplace grid",
};

const TokensSchema = z
  .object({
    heroBg: z.string().regex(HEX),
    heroText: z.string().regex(HEX),
    accent: z.string().regex(HEX),
    ctaBg: z.string().regex(HEX),
    ctaText: z.string().regex(HEX),
    paperBg: z.string().regex(HEX),
    cardBg: z.string().regex(HEX),
    ink: z.string().regex(HEX),
    muted: z.string().regex(HEX),
    border: z.string().regex(HEX),
    headingStyle: z.enum(["serif", "grotesk"]),
    radius: z.enum(["soft", "rounded", "sharp"]),
    fontPair: z.enum(REX_FONT_PAIRS),
    buttonShape: z.enum(REX_BUTTON_SHAPES),
    pageWidth: z.enum(REX_PAGE_WIDTHS),
    productRatio: z.enum(REX_PRODUCT_RATIOS),
  })
  .partial();

export const RexStudioPlanSchema = z.object({
  reply: shortText(1200).catch(""),
  theme: shortText(60).nullable().optional().catch(null),
  tokens: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .catch(null)
    .transform((raw) => {
      if (!raw) return null;
      // Keep each valid token; drop the rest instead of failing the whole plan.
      const out: Partial<ThemeTokenSet> = {};
      for (const [key, value] of Object.entries(raw)) {
        const parsed = TokensSchema.safeParse({ [key]: typeof value === "string" ? value.trim() : value });
        if (parsed.success) Object.assign(out, parsed.data);
      }
      return Object.keys(out).length ? out : null;
    }),
  tokensSummary: shortText(90).optional().catch(undefined),
  /** Classic templates: the store-wide layout. Ignored on the 2026 themes. */
  layout: z.enum(REX_LAYOUTS).nullable().optional().catch(null),
  pages: z
    .array(
      z.object({
        page: z.enum(PAGE_TYPES),
        title: shortText(60).optional().catch(undefined),
        metaTitle: shortText(70).optional().catch(undefined),
        metaDescription: shortText(180).optional().catch(undefined),
      }),
    )
    .max(11)
    .catch([]),
  ops: z
    .array(z.unknown())
    .max(20)
    .catch([])
    .transform((list) => list.map((op) => OpSchema.safeParse(op)).filter((result) => result.success).map((result) => result.data)),
});

export type RexStudioPlan = z.infer<typeof RexStudioPlanSchema>;
export type RexStudioOp = RexStudioPlan["ops"][number];

export function parseRexStudioPlan(raw: unknown): RexStudioPlan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const parsed = RexStudioPlanSchema.safeParse({ pages: [], ops: [], ...(raw as Record<string, unknown>) });
  return parsed.success ? parsed.data : null;
}

export interface ApplyContext {
  storeName: string;
  /** A fresh snapshot of a theme (template id), or null when the id isn't a theme. */
  themeSnapshot: (themeId: string) => StoreEditorSnapshot | null;
  themeName: (themeId: string) => string | null;
  /** Moves the seller's content onto the new theme's seed (defaults to `switchTheme` below). */
  switchTheme?: (current: StoreEditorSnapshot, seed: StoreEditorSnapshot) => StoreEditorSnapshot;
  /** A library section of this kind, with a fresh id. */
  createSection: (kind: string) => TemplateSectionNode;
  /** The section kinds the theme can render. */
  allowedKinds: (themeId: string) => string[];
  /** Approved reviews for themes that read reviews from section items (never invented). */
  reviewItems: Array<{ quote: string; person: string }>;
  /** A 2026 (boutique) theme: reads fontPair, buttonShape, pageWidth and productRatio, and has no store layout to pick. */
  isBoutique?: (themeId: string) => boolean;
  /** Sets inspector fields on a section (src/lib/ai/rex/section-fields.ts); returns the field ids changed. */
  applyFields?: (section: TemplateSectionNode, fields: Record<string, unknown>, themeId: string) => string[];
  now?: string;
}

export interface ApplyResult {
  snapshot: StoreEditorSnapshot;
  /** What actually changed, for Rex's checklist. Empty when nothing changed. */
  changes: string[];
  themeChanged: boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function copyBlock(section: TemplateSectionNode) {
  let block = section.blocks.find((entry) => entry.type === "copy");
  if (!block) {
    block = { id: `${section.id}-copy`, type: "copy", content: {} };
    section.blocks = [block, ...section.blocks];
  }
  return block;
}

function setHeroImage(section: TemplateSectionNode, imageUrl: string) {
  const items = section.items?.length ? [...section.items] : [{}];
  items[0] = { ...items[0], imageUrl };
  section.items = items;
}

const CARRY_COPY_KINDS = new Set(["hero-split", "story-split", "about-section", "text-columns", "faq", "contact-form", "newsletter", "promo-banner"]);

/** A new theme, keeping the seller's words (hero, story, questions), extra pages and page titles. */
export function switchTheme(current: StoreEditorSnapshot, next: StoreEditorSnapshot): StoreEditorSnapshot {
  const result = clone(next);
  result.pages = result.pages.map((page) => {
    const old = current.pages.find((entry) => entry.pageType === page.pageType);
    if (!old) return page;
    return {
      ...page,
      seo: old.seo?.metaDescription ? old.seo : page.seo,
      sections: page.sections.map((section) => {
        if (!CARRY_COPY_KINDS.has(section.kind)) return section;
        const match = old.sections.find((entry) => entry.kind === section.kind);
        if (!match) return section;
        const oldCopy = (match.blocks.find((entry) => entry.type === "copy")?.content ?? {}) as Record<string, unknown>;
        const kept = Object.fromEntries(Object.entries(oldCopy).filter(([, value]) => typeof value === "string" && value.trim()));
        const updated = clone(section);
        const block = copyBlock(updated);
        block.content = { ...block.content, ...kept };
        const keptItems = (match.items ?? []).filter((item) => Object.values(item).some((value) => typeof value === "string" && value.trim()));
        if (section.kind === "faq" && keptItems.length) updated.items = clone(keptItems);
        if (section.kind !== "faq" && keptItems.some((item) => typeof item.imageUrl === "string")) updated.items = clone(keptItems);
        return updated;
      }),
    };
  });
  for (const page of current.pages) {
    if (!result.pages.some((entry) => entry.pageType === page.pageType)) result.pages.push(clone(page));
  }
  return result;
}

function chromeFrom(snapshot: StoreEditorSnapshot) {
  const home = snapshot.pages.find((page) => page.pageType === "home") ?? snapshot.pages[0];
  const sections = home?.sections ?? [];
  return {
    top: sections.filter((section) => section.kind === "announcement-bar" || section.kind === "header").map(clone),
    bottom: sections.filter((section) => section.kind === "footer").map(clone),
  };
}

function newPage(snapshot: StoreEditorSnapshot, pageType: PageType, title: string, storeName: string): TemplatePageSeed {
  const chrome = chromeFrom(snapshot);
  return {
    id: `rex-${pageType}-${Math.random().toString(36).slice(2, 7)}`,
    pageType,
    title,
    slug: pageType === "home" ? "home" : pageType,
    sections: [...chrome.top, ...chrome.bottom],
    seo: { metaTitle: `${title} | ${storeName}`.slice(0, 70), metaDescription: "" },
  };
}

function paydaySection(): TemplateSectionNode {
  const id = `payday-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    kind: "payday-countdown",
    name: "Payday Countdown",
    visible: true,
    blocks: [{ id: `${id}-copy`, type: "copy", content: { eyebrow: "Payday edit", title: "", discountLabel: "", body: "", primaryCta: "Shop the edit" } }],
    settings: { paydayRule: "day-of-month", paydayDay: 25, weekendToFriday: true, saleEnds: "sunday", saleDays: 3 },
  };
}

function insertIndex(page: TemplatePageSeed, position: "top" | "bottom" | undefined) {
  if (position === "top") {
    let index = 0;
    while (index < page.sections.length && LOCKED_KINDS.has(page.sections[index].kind) && page.sections[index].kind !== "footer") index++;
    // After the hero when there is one: "top" means first thing under the banner.
    if (page.sections[index]?.kind === "hero-split") index++;
    return index;
  }
  const footer = page.sections.findIndex((section) => section.kind === "footer");
  const newsletter = page.sections.findIndex((section) => section.kind === "newsletter");
  if (position !== "bottom" && newsletter !== -1) return newsletter;
  return footer === -1 ? page.sections.length : footer;
}

/** Where a section goes: right after / before a named section, else top or bottom (never above the header). */
function placeIndex(page: TemplatePageSeed, op: { after?: string; before?: string; position?: "top" | "bottom" }) {
  const after = op.after ? page.sections.findIndex((section) => section.id === op.after) : -1;
  if (after !== -1 && page.sections[after].kind !== "footer") return after + 1;
  const before = op.before ? page.sections.findIndex((section) => section.id === op.before) : -1;
  if (before !== -1 && !["announcement-bar", "header"].includes(page.sections[before].kind)) return before;
  return insertIndex(page, op.position);
}

function humanKind(kind: string) {
  const names: Record<string, string> = {
    "hero-split": "the banner",
    testimonials: "customer reviews",
    "payday-countdown": "a payday countdown",
    "story-split": "your story",
    "about-section": "an about section",
    "text-columns": "a text section",
    "promo-banner": "a promotion banner",
    "trust-strip": "a trust strip",
    faq: "questions",
    newsletter: "a newsletter sign-up",
    "contact-form": "a contact form",
    "featured-products": "your products",
    "category-grid": "your categories",
  };
  return names[kind] ?? kind.replace(/-/g, " ");
}

function pageName(pageType: PageType, page?: TemplatePageSeed) {
  return pageType === "home" ? "the homepage" : `the ${page?.title || PAGE_TITLES[pageType]} page`;
}

/** Applies a validated plan to a copy of the draft. Ops that don't fit the theme are skipped, not forced. */
export function applyRexStudioPlan(draft: StoreEditorSnapshot, plan: RexStudioPlan, context: ApplyContext): ApplyResult {
  let snapshot = clone(draft);
  const changes: string[] = [];
  let themeChanged = false;

  if (plan.theme && plan.theme !== snapshot.templateId) {
    const fresh = context.themeSnapshot(plan.theme);
    if (fresh) {
      snapshot = (context.switchTheme ?? switchTheme)(snapshot, fresh);
      themeChanged = true;
      changes.push(`Switched to the ${context.themeName(plan.theme) ?? plan.theme} theme`);
    }
  }

  const boutique = context.isBoutique?.(snapshot.templateId) ?? false;
  if (plan.tokens) {
    const tokens = { ...plan.tokens };
    // Classic templates don't read the 2026 themes' choices: leave them out rather than report a change nobody sees.
    if (!boutique) for (const key of BOUTIQUE_ONLY_TOKENS) delete tokens[key];
    const before = JSON.stringify(snapshot.themeTokens);
    snapshot.themeTokens = { ...snapshot.themeTokens, ...tokens };
    if (JSON.stringify(snapshot.themeTokens) !== before) changes.push(plan.tokensSummary || "Updated your colours and fonts");
  }

  if (plan.layout && !boutique && plan.layout !== snapshot.layoutFamily) {
    snapshot.layoutFamily = plan.layout;
    changes.push(`Changed the store layout to ${LAYOUT_NAMES[plan.layout]}`);
  }

  for (const entry of plan.pages) {
    let page = snapshot.pages.find((item) => item.pageType === entry.page);
    if (!page) {
      page = newPage(snapshot, entry.page, entry.title || PAGE_TITLES[entry.page], context.storeName);
      snapshot.pages.push(page);
      changes.push(`Added the ${page.title} page`);
    } else if (entry.title && entry.title !== page.title) {
      page.title = entry.title;
    }
    if (entry.metaTitle || entry.metaDescription) {
      page.seo = {
        metaTitle: entry.metaTitle || page.seo?.metaTitle || `${page.title} | ${context.storeName}`.slice(0, 70),
        metaDescription: entry.metaDescription || page.seo?.metaDescription || "",
      };
      changes.push(`Wrote the search title and description for ${pageName(entry.page, page)}`);
    }
  }

  const allowed = new Set(context.allowedKinds(snapshot.templateId));
  for (const op of plan.ops) {
    let page = snapshot.pages.find((item) => item.pageType === op.page);
    if (!page && (op.action === "add" || op.action === "update")) {
      page = newPage(snapshot, op.page, PAGE_TITLES[op.page], context.storeName);
      snapshot.pages.push(page);
      changes.push(`Added the ${page.title} page`);
    }
    if (!page) continue;
    const target = (op.sectionId ? page.sections.find((section) => section.id === op.sectionId) : null)
      ?? page.sections.find((section) => section.kind === op.kind)
      ?? null;

    if (op.action === "move" || op.action === "duplicate") {
      if (!target || LOCKED_KINDS.has(target.kind)) continue;
      if (op.action === "move") {
        page.sections = page.sections.filter((section) => section !== target);
        page.sections.splice(placeIndex(page, op), 0, target);
        changes.push(op.summary || `Moved ${humanKind(target.kind)} on ${pageName(op.page, page)}`);
      } else {
        const copy = clone(target);
        copy.id = `${target.kind}-${Math.random().toString(36).slice(2, 8)}`;
        copy.blocks = copy.blocks.map((block, index) => ({ ...block, id: `${copy.id}-b${index}` }));
        page.sections.splice(op.after || op.before || op.position ? placeIndex(page, op) : page.sections.indexOf(target) + 1, 0, copy);
        changes.push(op.summary || `Copied ${humanKind(target.kind)} on ${pageName(op.page, page)}`);
      }
      continue;
    }

    if (op.action === "remove" || op.action === "hide" || op.action === "show") {
      if (!target || LOCKED_KINDS.has(target.kind)) continue;
      if (op.action === "remove") page.sections = page.sections.filter((section) => section !== target);
      else target.visible = op.action === "show";
      changes.push(op.summary || `${op.action === "show" ? "Showed" : op.action === "hide" ? "Hid" : "Removed"} ${humanKind(target.kind)} on ${pageName(op.page, page)}`);
      continue;
    }

    let section = op.action === "update" ? target : null;
    let added = false;
    if (!section) {
      if (!allowed.has(op.kind)) continue;
      if (op.kind === "testimonials" && target) {
        // Already there: just make sure it's visible.
        target.visible = true;
        section = target;
      } else {
        section = op.kind === "payday-countdown" ? paydaySection() : clone(context.createSection(op.kind));
        section.visible = true;
        if (op.kind === "testimonials") {
          section.items = context.reviewItems.slice(0, 6).map((review) => ({ ...review }));
          section.settings = { ...section.settings, source: "product-reviews" };
        } else if (op.kind === "faq" && !op.items?.length) {
          // Answers left blank are filled from the store's own delivery, payment and returns settings.
          section.items = [
            { question: "How fast is delivery?", answer: "", answerSource: "delivery" },
            { question: "Can I pay on delivery?", answer: "", answerSource: "payment" },
            { question: "What if it doesn't fit?", answer: "", answerSource: "returns" },
          ];
        } else if (PLACEHOLDER_ITEM_KINDS.has(op.kind)) {
          section.items = [];
        }
        page.sections.splice(placeIndex(page, op), 0, section);
        added = true;
      }
    }

    const before = JSON.stringify(section);
    if (op.copy && Object.keys(op.copy).length) {
      const block = copyBlock(section);
      block.content = { ...block.content, ...op.copy };
    }
    if (op.items && !DATA_KINDS.has(section.kind)) section.items = op.items.map((item) => ({ ...item }));
    if (op.imageUrl) setHeroImage(section, op.imageUrl);
    if (op.fields && Object.keys(op.fields).length && !LOCKED_KINDS.has(section.kind)) context.applyFields?.(section, op.fields, snapshot.templateId);
    if (!added && JSON.stringify(section) === before) continue;
    changes.push(op.summary || (added ? `Added ${humanKind(section.kind)} to ${pageName(op.page, page)}` : `Rewrote ${humanKind(section.kind)} on ${pageName(op.page, page)}`));
  }

  if (!changes.length) return { snapshot: draft, changes, themeChanged: false };
  snapshot.updatedAt = context.now ?? new Date().toISOString();
  return { snapshot, changes: Array.from(new Set(changes)).slice(0, 8), themeChanged };
}

/** The draft as Rex reads it: pages, then each section's id, kind and words (long text trimmed). */
export function summariseDraftForRex(draft: StoreEditorSnapshot, boutique = false, describe?: (section: TemplateSectionNode) => Record<string, string>) {
  const tokens = draft.themeTokens;
  return {
    theme: draft.templateId,
    headingStyle: tokens.headingStyle,
    // The look choices this theme reads, as the builder's Theme settings show them.
    style: boutique
      ? { fontPair: tokens.fontPair ?? "theme", buttonShape: tokens.buttonShape ?? "theme", pageWidth: tokens.pageWidth ?? "standard", productRatio: tokens.productRatio ?? "theme" }
      : { corners: tokens.radius, layout: draft.layoutFamily },
    colours: { heroBg: draft.themeTokens.heroBg, accent: draft.themeTokens.accent, paperBg: draft.themeTokens.paperBg, ink: draft.themeTokens.ink },
    pages: draft.pages.map((page) => ({
      page: page.pageType,
      title: page.title,
      seo: page.seo ?? null,
      sections: page.sections
        .filter((section) => !LOCKED_KINDS.has(section.kind))
        .map((section) => {
          const copy = (section.blocks.find((block) => block.type === "copy")?.content ?? {}) as Record<string, unknown>;
          const words = Object.fromEntries(
            Object.entries(copy)
              .filter(([, value]) => typeof value === "string" && value.trim())
              .map(([key, value]) => [key, (value as string).slice(0, 300)]),
          );
          return {
            id: section.id,
            kind: section.kind,
            ...(section.visible === false ? { hidden: true } : {}),
            copy: words,
            ...(describe ? { fields: describe(section) } : {}),
            ...(DATA_KINDS.has(section.kind) ? {} : section.items?.length ? { items: section.items.slice(0, 8).map((item) => Object.fromEntries(Object.entries(item).filter(([, value]) => typeof value === "string").map(([key, value]) => [key, (value as string).slice(0, 200)]))) } : {}),
          };
        }),
    })),
  };
}
