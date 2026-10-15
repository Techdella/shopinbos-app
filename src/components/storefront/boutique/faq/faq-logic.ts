// FAQ styles shared by the page FAQ section (2026 themes and classic templates) and the product page's questions.
// The seller picks a style on the FAQ section in the builder; the product page follows it unless the product page
// settings (or one product's own settings) pick another. Pure (relative .ts imports only), so tests load it directly.

import { deliveryLines, formatStoreMoney, freeDeliveryPromise, type StorefrontShopperInfo } from "../../../../lib/storefront/shopper-info.ts";

export type FaqStyle = "plus" | "chevron" | "cards" | "numbered" | "split" | "boxed";

export const FAQ_STYLE_OPTIONS: Array<{ value: FaqStyle; label: string; hint: string }> = [
  { value: "plus", label: "Plus and minus", hint: "Tap a question to open it. A + turns into a −." },
  { value: "chevron", label: "Arrow", hint: "Tap a question to open it. The arrow turns." },
  { value: "cards", label: "Cards", hint: "Every answer showing, in cards. Two across on computers." },
  { value: "numbered", label: "Numbered list", hint: "Numbered questions in a box with lines between." },
  { value: "split", label: "Question beside answer", hint: "Question on the left, answer on the right." },
  { value: "boxed", label: "Boxes with icon", hint: "Each question in its own box with a question mark." },
];

export const FAQ_STYLES: FaqStyle[] = FAQ_STYLE_OPTIONS.map((option) => option.value);
export const DEFAULT_FAQ_STYLE: FaqStyle = "plus";

/** Styles that show every answer at once (no opening and closing). */
export function faqAlwaysOpen(style: FaqStyle) {
  return style === "cards" || style === "split";
}

export function readFaqStyle(value: unknown): FaqStyle | null {
  return typeof value === "string" && (FAQ_STYLES as string[]).includes(value) ? (value as FaqStyle) : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

interface SectionLike {
  kind?: string;
  visible?: boolean;
  settings?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
}

interface SnapshotLike {
  pages?: Array<{ pageType?: string; sections?: SectionLike[] }>;
}

export type FaqRenderer = "boutique" | "classic";

/**
 * The style a page FAQ section shows its questions in. The seller's pick (settings.faqStyle) wins; sections saved
 * before styles existed keep their look: open cards stay cards, everything else is the + / − accordion.
 * 2026 themes: the "cards" layout is always cards. Classic templates: the grid layouts show every answer (cards).
 */
export function faqSectionStyle(section: SectionLike | null | undefined, renderer: FaqRenderer = "boutique"): FaqStyle {
  const settings = record(section?.settings);
  const layout = str(settings.layout);
  if (renderer === "boutique" && layout === "cards") return "cards";
  const picked = readFaqStyle(settings.faqStyle);
  if (picked) return picked;
  if (renderer === "classic" && (layout === "cards" || layout === "two-column" || layout === "support-center")) return "cards";
  return DEFAULT_FAQ_STYLE;
}

/** The store's own FAQ section: the one on the FAQ page first, else the first on any page (shown ones first). */
export function storeFaqSection(snapshot: SnapshotLike | null | undefined): SectionLike | null {
  const pages = snapshot?.pages ?? [];
  const all = [...pages.filter((page) => page.pageType === "faq"), ...pages.filter((page) => page.pageType !== "faq")]
    .flatMap((page) => page.sections ?? [])
    .filter((section) => section.kind === "faq");
  return all.find((section) => section.visible !== false) ?? all[0] ?? null;
}

/** A store-wide question as saved on the FAQ section (answers left blank are filled from settings by faqAnswer). */
export interface StoreFaqItem {
  question: string;
  answer: string;
  answerSource?: string;
}

export function readStoreFaqItems(section: SectionLike | null | undefined): StoreFaqItem[] {
  return (section?.items ?? [])
    .map((item) => record(item))
    .map((item) => ({ question: str(item.question), answer: str(item.answer), ...(str(item.answerSource) ? { answerSource: str(item.answerSource) } : {}) }))
    .filter((item) => item.question);
}

/** Faq answers left blank by the seller come from their own delivery and payment settings. */
export function faqAnswer(item: Record<string, unknown>, shopper: StorefrontShopperInfo, currency: string) {
  const written = str(item.answer);
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

/**
 * The questions a product page shows: the product's own, then (when the seller switched it on) the store's FAQ
 * questions with answers, skipping any the product already asks.
 */
export function productFaqItems(
  own: ReadonlyArray<{ question: string; answer: string }>,
  store: ReadonlyArray<StoreFaqItem>,
  shopper: StorefrontShopperInfo | null,
  currency: string,
): Array<{ question: string; answer: string }> {
  const out = own.map((item) => ({ question: item.question, answer: item.answer }));
  const asked = new Set(out.map((item) => item.question.toLowerCase()));
  for (const item of store) {
    const answer = shopper ? faqAnswer(item as unknown as Record<string, unknown>, shopper, currency) : item.answer;
    if (!answer || asked.has(item.question.toLowerCase())) continue;
    asked.add(item.question.toLowerCase());
    out.push({ question: item.question, answer });
  }
  return out;
}
