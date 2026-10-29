// Rex's look at the store DRAFT as a designer would: empty picture spots, missing or placeholder words, hidden or
// doubled-up sections, a homepage that's too thin or too long, hard-to-read colours. Each finding comes with the
// plain instruction Rex sends to edit_store_section to fix it, and the empty picture spots are what
// fill_section_images fills. Pure (no server imports), so the Studio greeting runs it in the browser too.
// Unit-tested in tests/rex-design-review.test.mjs.

import { contrastRatio } from "../../../../shared/brand-book.ts";
import { isPlaceholderCopy } from "../../../../shared/placeholder-copy.ts";
import type { RendererKind } from "../../../components/builder/editor/editor-logic.ts";
import { fieldVisible } from "../../../components/builder/editor/section-schema.ts";
import type { StoreEditorSnapshot, TemplateSectionNode } from "../../store-templates/types.ts";
import { rexFields } from "./section-fields.ts";

export type FindingArea = "pictures" | "words" | "sections" | "look";

export interface DesignFinding {
  id: string;
  area: FindingArea;
  /** What the seller reads, one short line. */
  message: string;
  /** The instruction for edit_store_section, or null when fill_section_images is the fix. */
  fix: string | null;
}

export interface PictureSlot {
  page: string;
  sectionId: string;
  kind: string;
  /** The field to set (an "image" field, or a "media" field and how many pictures it takes). */
  field: string;
  count: number;
  /** What the section says, to brief the picture. */
  context: string;
  /** The theme's sample photo shows there for now (2026 themes); false: the spot is empty. */
  stock: boolean;
}

export interface DesignReview {
  findings: DesignFinding[];
  pictureSlots: PictureSlot[];
}

const CHROME = new Set(["announcement-bar", "header", "footer"]);
/** Sections whose pictures make or break the look; product and category tiles use the store's own photos. */
const PICTURE_KINDS = new Set([
  "hero-split", "story-split", "about-section", "promo-banner", "split-hero", "parallax-banner", "video-hero", "founder-story",
  "shoppable-story", "shop-the-look", "campaign-countdown-hero", "campaign-featured-deal",
]);
const HERO_KINDS = new Set(["hero-split", "split-hero", "parallax-banner", "video-hero", "campaign-countdown-hero"]);
const PAGE_NAMES: Record<string, string> = { home: "homepage", about: "About page", faq: "Questions page", contact: "Contact page", products: "Shop page" };

function copyOf(section: TemplateSectionNode): Record<string, unknown> {
  return (section.blocks.find((block) => block.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const pageName = (pageType: string) => PAGE_NAMES[pageType] ?? `${pageType} page`;
const sectionName = (section: TemplateSectionNode) => `"${section.name || section.kind.replace(/-/g, " ")}" section`;

/** The empty picture spots in one section, from the fields its panel shows now. */
function emptyPictures(section: TemplateSectionNode, page: string, renderer: RendererKind, themeId: string): PictureSlot[] {
  if (!PICTURE_KINDS.has(section.kind)) return [];
  const fields = rexFields(section, renderer, themeId);
  // 2026 themes show their own sample photo until the seller adds one (unless switched off).
  const stock = fields.some((field) => field.id === "stockImage") && section.settings?.stockImage !== false;
  const copy = copyOf(section);
  const context = [copy.eyebrow, copy.title, copy.body].filter(filled).map((value) => String(value).slice(0, 160)).join(" / ");
  const slots: PictureSlot[] = [];
  for (const field of fields) {
    if (!fieldVisible(section, field)) continue;
    if (field.type === "image" && field.target) {
      const value = field.target.scope === "copy" ? copy[field.target.key] : section.settings?.[field.target.key];
      if (!filled(value)) slots.push({ page, sectionId: section.id, kind: section.kind, field: field.id, count: 1, context, stock });
    } else if (field.type === "media") {
      const have = (section.items ?? []).slice(0, field.max).filter((item) => filled(item.imageUrl)).length;
      if (have === 0 && field.max > 0) slots.push({ page, sectionId: section.id, kind: section.kind, field: field.id, count: field.max, context, stock });
    }
  }
  return slots.slice(0, 1);
}

/** Reads the draft and returns what's worth fixing, most important first (at most `limit`). */
export function reviewStoreDraft(draft: StoreEditorSnapshot, options: { boutique: boolean; storeName?: string; limit?: number }): DesignReview {
  const renderer: RendererKind = options.boutique ? "boutique" : "classic";
  const findings: DesignFinding[] = [];
  const pictureSlots: PictureSlot[] = [];
  const pages = draft.pages.filter((page) => ["home", "about", "faq", "contact", "products"].includes(page.pageType));

  for (const page of pages) {
    const body = page.sections.filter((section) => !CHROME.has(section.kind));
    const visible = body.filter((section) => section.visible !== false);
    for (const section of visible) pictureSlots.push(...emptyPictures(section, page.pageType, renderer, draft.templateId));

    for (const section of visible) {
      const copy = copyOf(section);
      const title = copy.title;
      if (HERO_KINDS.has(section.kind) && !filled(title)) {
        findings.push({ id: `words-${section.id}`, area: "words", message: `The ${pageName(page.pageType)} banner has no headline.`, fix: `Write a short, strong headline and one line under it for the ${sectionName(section)} on the ${pageName(page.pageType)} (section ${section.id}).` });
        continue;
      }
      const placeholder = ["title", "body", "eyebrow"].find((key) => isPlaceholderCopy(copy[key], options.storeName));
      if (placeholder) {
        findings.push({ id: `words-${section.id}`, area: "words", message: `The ${sectionName(section)} on the ${pageName(page.pageType)} still has sample words.`, fix: `Rewrite the ${sectionName(section)} on the ${pageName(page.pageType)} (section ${section.id}) in the store's own words.` });
      } else if ((section.kind === "story-split" || section.kind === "about-section" || section.kind === "founder-story") && !filled(copy.body)) {
        findings.push({ id: `words-${section.id}`, area: "words", message: `The ${sectionName(section)} on the ${pageName(page.pageType)} has no story yet.`, fix: `Write the story text for the ${sectionName(section)} on the ${pageName(page.pageType)} (section ${section.id}) from what we know about the business.` });
      }
    }

    for (let index = 1; index < visible.length; index++) {
      const [before, after] = [visible[index - 1], visible[index]];
      if (before.kind === after.kind && !HERO_KINDS.has(after.kind)) {
        findings.push({ id: `twice-${after.id}`, area: "sections", message: `Two ${sectionName(after)} sections sit back to back on the ${pageName(page.pageType)}.`, fix: `On the ${pageName(page.pageType)}, either remove section ${after.id} or move it further down so the page has variety.` });
      }
    }

    if (page.pageType === "home") {
      const hidden = body.filter((section) => section.visible === false);
      if (visible.length < 4) {
        findings.push({ id: "home-thin", area: "sections", message: "The homepage is short: shoppers see little before the footer.", fix: "Add two sections to the homepage that suit this store (for example trust badges and the store's story), placed after the products, with their words written." });
      } else if (visible.length > 12) {
        findings.push({ id: "home-long", area: "sections", message: `The homepage has ${visible.length} sections, which is a lot to scroll.`, fix: "Hide the two or three weakest homepage sections and tighten the spacing on the rest so the page feels lighter." });
      }
      if (hidden.length >= 3) {
        findings.push({ id: "home-hidden", area: "sections", message: `${hidden.length} homepage sections are hidden.`, fix: "Look at the hidden homepage sections: remove the ones that aren't needed and show the useful ones with fresh words." });
      }
    }
  }

  const tokens = draft.themeTokens ?? ({} as StoreEditorSnapshot["themeTokens"]);
  // Body text needs 4.5:1; button and banner words are large and bold, so 3:1 (WCAG's large-text level).
  const pairs: Array<[string, string | undefined, string | undefined, number, string]> = [
    ["look-text", tokens.ink, tokens.paperBg, 4.5, "The main text is hard to read on the page colour."],
    ["look-buttons", tokens.ctaText, tokens.ctaBg, 3, "Button words are hard to read on the button colour."],
    ["look-banner", tokens.heroText, tokens.heroBg, 3, "The banner words are hard to read on the banner colour."],
  ];
  for (const [id, fore, back, minimum, message] of pairs) {
    if (!fore || !back || !/^#[0-9a-f]{6}$/i.test(fore) || !/^#[0-9a-f]{6}$/i.test(back)) continue;
    if (contrastRatio(fore, back) < minimum) findings.push({ id, area: "look", message, fix: `${message} Adjust those two colours so they read clearly (at least ${minimum}:1), keeping the store's look.` });
  }

  if (pictureSlots.length) {
    const empty = pictureSlots.filter((slot) => !slot.stock).length;
    const where = Array.from(new Set(pictureSlots.map((slot) => pageName(slot.page)))).join(", ");
    findings.unshift({
      id: "pictures",
      area: "pictures",
      message: empty
        ? `${empty} ${empty === 1 ? "section has" : "sections have"} no picture yet (${where}).`
        : `${pictureSlots.length} ${pictureSlots.length === 1 ? "section still shows" : "sections still show"} the theme's sample photo instead of your own (${where}).`,
      fix: null,
    });
  }

  const order: FindingArea[] = ["pictures", "words", "look", "sections"];
  const sorted = findings.sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area));
  const seen = new Set<string>();
  const unique = sorted.filter((finding) => (seen.has(finding.id) ? false : (seen.add(finding.id), true)));
  return { findings: unique.slice(0, options.limit ?? 6), pictureSlots: pictureSlots.slice(0, 8) };
}
