// Store health: how ready a store is to sell, as a 0–100 score from a checklist of real facts (products,
// photos, prices, logo, pages, delivery, payments, policies, domain, reviews…). Each item is worth points;
// the score is the share of points earned among the items that apply to this store.
//
// Pure (runtime imports are other pure modules only), so Rex Studio's server page, its live client view and
// tests/behaviour.test.mjs all agree. Draft facts are re-derived on the client after every Rex change.

import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode } from "@/lib/store-templates";
import { isBoutiqueTheme } from "./store-templates/boutique-themes.ts";
import { paydayWindow } from "./storefront/shopper-info.ts";

// ─── Pages ──────────────────────────────────────────────────────────────────────────────────────────────

export type StorePageKey = "home" | "product" | "collections" | "about" | "faq";
export type StorePageState = "written" | "empty" | "missing";

export interface StorePageStatus {
  key: StorePageKey;
  label: string;
  /** The draft page this tab shows (null when the draft has none yet). */
  pageType: TemplatePageSeed["pageType"] | null;
  state: StorePageState;
}

/** The pages Rex Studio shows as tabs, in order. Collections falls back to the shop page. */
export const STORE_PAGE_TABS: Array<{ key: StorePageKey; label: string; pageTypes: Array<TemplatePageSeed["pageType"]> }> = [
  { key: "home", label: "Home", pageTypes: ["home"] },
  { key: "product", label: "Product pages", pageTypes: ["product"] },
  { key: "collections", label: "Collections", pageTypes: ["categories", "products"] },
  { key: "about", label: "About us", pageTypes: ["about"] },
  { key: "faq", label: "Questions", pageTypes: ["faq"] },
];

const CHROME_KINDS = new Set(["header", "footer", "announcement-bar"]);

function copyOf(section: TemplateSectionNode): Record<string, unknown> {
  return (section.blocks?.find((block) => block.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function visibleContent(page: TemplatePageSeed) {
  return page.sections.filter((section) => section.visible !== false && !CHROME_KINDS.has(section.kind));
}

/** Whether a page has real content for its job (an About page with only a heading isn't written yet). */
export function isPageWritten(key: StorePageKey, page: TemplatePageSeed): boolean {
  const sections = visibleContent(page);
  if (key === "product") return sections.some((section) => section.kind === "product-detail");
  if (key === "collections") return sections.some((section) => ["category-grid", "category-list", "featured-products"].includes(section.kind));
  if (key === "faq") {
    return sections.some((section) => section.kind === "faq" && (section.items ?? []).some((item) => textOf(item.question)));
  }
  if (key === "about") {
    return sections.some((section) => {
      if (!["story-split", "about-section", "text-columns", "rich-text"].includes(section.kind)) return false;
      const body = textOf(copyOf(section).body);
      const columns = (section.items ?? []).map((item) => textOf(item.body)).join(" ");
      return body.length >= 40 || columns.length >= 40;
    });
  }
  return sections.length > 0;
}

export function storePageStatuses(snapshot: StoreEditorSnapshot | null): StorePageStatus[] {
  return STORE_PAGE_TABS.map((tab) => {
    const page = tab.pageTypes.map((type) => snapshot?.pages.find((entry) => entry.pageType === type)).find(Boolean) ?? null;
    if (!page) return { key: tab.key, label: tab.label, pageType: null, state: "missing" as const };
    return { key: tab.key, label: tab.label, pageType: page.pageType, state: isPageWritten(tab.key, page) ? ("written" as const) : ("empty" as const) };
  });
}

// ─── Facts ──────────────────────────────────────────────────────────────────────────────────────────────

export interface DraftHealthFacts {
  themeId: string | null;
  pages: StorePageStatus[];
  homeHasReviews: boolean;
  homeHasPayday: boolean;
  /** The theme can show a payday countdown (the 2026 boutique themes). */
  supportsPayday: boolean;
  /** A logo is set on the draft's header (counts as well as Store.logoUrl). */
  headerLogo: boolean;
}

export function draftHealthFacts(snapshot: StoreEditorSnapshot | null): DraftHealthFacts {
  const home = snapshot?.pages.find((page) => page.pageType === "home");
  const homeSections = home ? visibleContent(home) : [];
  const header = home?.sections.find((section) => section.kind === "header");
  return {
    themeId: snapshot?.templateId ?? null,
    pages: storePageStatuses(snapshot),
    homeHasReviews: homeSections.some((section) => section.kind === "testimonials"),
    homeHasPayday: homeSections.some((section) => section.kind === "payday-countdown"),
    supportsPayday: isBoutiqueTheme(snapshot?.templateId),
    headerLogo: Boolean(textOf(header?.settings?.logoUrl)),
  };
}

export interface StoreHealthFacts {
  /** Published products (what shoppers can buy). */
  products: number;
  productsWithPhoto: number;
  productsWithPrice: number;
  hasLogo: boolean;
  /** Active delivery zones, or 1 when the store uses a flat delivery fee. */
  deliveryOptions: number;
  /** Payment methods the seller turned on (card, transfer, pay on delivery). */
  paymentMethods: number;
  approvedReviews: number;
  hasCustomDomain: boolean;
  hasReturnPolicy: boolean;
  hasDeliveryPolicy: boolean;
  hasWhatsapp: boolean;
  draft: DraftHealthFacts;
}

// ─── Score ──────────────────────────────────────────────────────────────────────────────────────────────

export type StoreHealthItemId =
  | "products" | "photos" | "prices" | "logo" | "about" | "reviews-section" | "first-review"
  | "delivery" | "payments" | "faq" | "policies" | "domain" | "whatsapp" | "payday";

export interface StoreHealthItem {
  id: StoreHealthItemId;
  /** What to do, as Rex suggests it ("Write an About page so buyers trust you"). */
  label: string;
  points: number;
  done: boolean;
  /** Rex can do it from the chat: send this to Rex. */
  rexPrompt?: string;
  /** Otherwise the seller does it here. */
  href?: string;
}

export interface StoreHealth {
  score: number;
  earned: number;
  possible: number;
  items: StoreHealthItem[];
  /** Missing items, most points first (Rex-doable first on a tie). */
  missing: StoreHealthItem[];
}

function ordinal(day: number) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}

/** "Run a payday sale, the 25th is close" within ten days of payday (Lagos time), else a plain label. */
export function paydayLabel(now: Date) {
  const window = paydayWindow(now);
  const day = new Date(window.start.getTime() + 60 * 60 * 1000).getUTCDate();
  if (window.phase === "live") return "Run a payday sale, it's payday week";
  const days = (window.start.getTime() - now.getTime()) / 86_400_000;
  return days <= 10 ? `Run a payday sale, the ${ordinal(day)} is close` : "Set up a payday sale";
}

export function computeStoreHealth(facts: StoreHealthFacts, now = new Date()): StoreHealth {
  const page = (key: StorePageKey) => facts.draft.pages.find((entry) => entry.key === key)?.state ?? "missing";
  const hasProducts = facts.products > 0;
  const items: StoreHealthItem[] = [
    { id: "products", label: "Add your first product", points: 12, done: hasProducts, href: "/products/new" },
    { id: "photos", label: "Give every product a photo", points: 10, done: hasProducts && facts.productsWithPhoto >= facts.products, href: "/products" },
    { id: "prices", label: "Set a price on every product", points: 6, done: hasProducts && facts.productsWithPrice >= facts.products, href: "/products" },
    { id: "logo", label: "Add your logo", points: 8, done: facts.hasLogo || facts.draft.headerLogo, href: "/studio/logo" },
    {
      id: "about",
      label: "Write an About page so buyers trust you",
      points: 8,
      done: page("about") === "written",
      rexPrompt: "Write my About us page: who we are, what we make and why buyers can trust us.",
    },
    {
      id: "reviews-section",
      label: "Add reviews to the homepage",
      points: 8,
      done: facts.draft.homeHasReviews,
      rexPrompt: "Add customer reviews to my homepage.",
    },
    { id: "first-review", label: "Get your first customer review", points: 4, done: facts.approvedReviews > 0, href: "/home/reviews" },
    { id: "delivery", label: "Set where you deliver and what it costs", points: 10, done: facts.deliveryOptions > 0, href: "/home/shipping" },
    { id: "payments", label: "Choose how customers pay", points: 10, done: facts.paymentMethods > 0, href: "/home/payments" },
    {
      id: "faq",
      label: "Answer the questions buyers ask",
      points: 6,
      done: page("faq") === "written",
      rexPrompt: "Write my Questions page with the questions buyers ask about delivery, payment and returns.",
    },
    { id: "policies", label: "Add your returns and delivery policies", points: 6, done: facts.hasReturnPolicy && facts.hasDeliveryPolicy, href: "/home/legal" },
    { id: "domain", label: "Connect your own domain", points: 4, done: facts.hasCustomDomain, href: "/home/domain" },
    { id: "whatsapp", label: "Add your WhatsApp number for orders", points: 4, done: facts.hasWhatsapp, href: "/home/marketing/chat" },
  ];
  if (facts.draft.supportsPayday) {
    items.push({ id: "payday", label: paydayLabel(now), points: 4, done: facts.draft.homeHasPayday, rexPrompt: "Set up a payday sale on my homepage." });
  }

  const possible = items.reduce((sum, item) => sum + item.points, 0);
  const earned = items.filter((item) => item.done).reduce((sum, item) => sum + item.points, 0);
  const missing = items
    .filter((item) => !item.done)
    .sort((a, b) => b.points - a.points || Number(Boolean(b.rexPrompt)) - Number(Boolean(a.rexPrompt)));
  return { score: possible ? Math.round((earned / possible) * 100) : 0, earned, possible, items, missing };
}

// ─── Rex's suggestion chips ─────────────────────────────────────────────────────────────────────────────

const THEME_NAMES: Record<string, string> = { breeze: "Afẹ́fẹ́", noir: "Dúdú", plain: "Jẹ́jẹ́" };

/** Chips under Rex's chat, from what the store is missing right now. */
export function rexSuggestionChips(facts: StoreHealthFacts, options: { hasDraft: boolean; exclude?: string[] } = { hasDraft: true }): string[] {
  if (!options.hasDraft) return ["Build my store", "Make the homepage feel premium"];
  const draft = facts.draft;
  const about = draft.pages.find((page) => page.key === "about")?.state;
  const chips = [
    draft.themeId !== "noir" ? "Make the homepage feel premium" : null,
    !draft.homeHasReviews ? "Add customer reviews" : null,
    draft.supportsPayday && !draft.homeHasPayday ? "Set up a payday sale" : null,
    about !== "written" ? "Write the About us page" : null,
    "Write the homepage in Pidgin",
    `Try the ${THEME_NAMES[draft.themeId === "breeze" ? "plain" : "breeze"]} template`,
  ].filter((chip): chip is string => Boolean(chip));
  const exclude = new Set((options.exclude ?? []).map((entry) => entry.trim().toLowerCase()));
  return chips.filter((chip) => !exclude.has(chip.toLowerCase())).slice(0, 5);
}
