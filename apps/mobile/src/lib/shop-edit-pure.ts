// Edit my shop (app/shop-edit.tsx), the pure part: what the phone can change in the shop's draft design and the
// editor operations that change it. The draft is the web builder's (brandSettings.editor.draft, read with GET
// /api/store/editor) and every change is one of its own operations (PATCH /api/store/editor { ops }, the same
// applyEditorPatchOps the web builder and Rex use, src/lib/store-templates/editor.ts). No imports, so
// tests/mobile-shop-edit.test.mjs loads this file directly.

export interface EditorBlock {
  id: string;
  type: string;
  content?: Record<string, unknown>;
}

export interface EditorSection {
  id: string;
  kind: string;
  name: string;
  visible?: boolean;
  blocks?: EditorBlock[];
  items?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
}

export interface EditorDraft {
  templateId: string;
  themeTokens?: Record<string, unknown>;
  pages: Array<{ pageType: string; sections: EditorSection[] }>;
}

export type EditorOp =
  | { op: "update-theme"; changes: Record<string, string> }
  | { op: "reorder-section"; pageType: "home"; fromIndex: number; toIndex: number }
  | { op: "update-section"; pageType: "home"; sectionId: string; changes: Record<string, unknown> }
  | { op: "toggle-section"; pageType: "home"; sectionId: string; visible: boolean }
  | { op: "update-block-content"; pageType: "home"; sectionId: string; blockId: string; content: Record<string, unknown> };

/** The announcement bar, header and footer are the same on every page (the builder's "chrome"): not in the list. */
export const CHROME_KINDS = ["announcement-bar", "header", "footer"] as const;

export interface ShopEdit {
  announcement: { sectionId: string; blockId: string; text: string } | null;
  hero: { sectionId: string; blockId: string; title: string; body: string; cta: string; imageUrl: string } | null;
  featured: { sectionId: string; productIds: string[] } | null;
  /** The homepage's own sections, in order, to show, hide and move. */
  sections: Array<{ id: string; kind: string; name: string; visible: boolean }>;
  accent: string | null;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const copyBlock = (section: EditorSection | undefined) => section?.blocks?.find((block) => block.type === "copy") ?? null;
const isChrome = (kind: string) => (CHROME_KINDS as readonly string[]).includes(kind);

export function homeSections(draft: EditorDraft | null | undefined): EditorSection[] {
  return draft?.pages.find((page) => page.pageType === "home")?.sections ?? [];
}

/** A section item's picture (the builder's itemMediaUrl). */
export function itemImage(item: Record<string, unknown> | undefined | null) {
  if (!item) return "";
  return str(item.imageUrl) || str(item.resolvedSrc) || str(item.originalSrc);
}

export function readShopEdit(draft: EditorDraft | null | undefined): ShopEdit {
  const sections = homeSections(draft);
  const bar = sections.find((section) => section.kind === "announcement-bar");
  const barCopy = copyBlock(bar);
  const hero = sections.find((section) => section.kind === "hero-split");
  const heroCopy = copyBlock(hero);
  const featured = sections.find((section) => section.kind === "featured-products");
  const accent = str(draft?.themeTokens?.accent) || null;
  return {
    announcement: bar && barCopy ? { sectionId: bar.id, blockId: barCopy.id, text: str(barCopy.content?.text) } : null,
    hero:
      hero && heroCopy
        ? { sectionId: hero.id, blockId: heroCopy.id, title: str(heroCopy.content?.title), body: str(heroCopy.content?.body), cta: str(heroCopy.content?.primaryCta), imageUrl: itemImage(hero.items?.[0]) }
        : null,
    featured: featured
      ? { sectionId: featured.id, productIds: (featured.items ?? []).map((item) => str(item.mappedStoreProductId)).filter(Boolean) }
      : null,
    sections: sections.filter((section) => !isChrome(section.kind)).map((section) => ({ id: section.id, kind: section.kind, name: section.name, visible: section.visible !== false })),
    accent,
  };
}

export function announcementOp(edit: ShopEdit, text: string): EditorOp | null {
  if (!edit.announcement) return null;
  return { op: "update-block-content", pageType: "home", sectionId: edit.announcement.sectionId, blockId: edit.announcement.blockId, content: { text: text.trim() } };
}

export function heroCopyOp(edit: ShopEdit, copy: { title: string; body: string; cta: string }): EditorOp | null {
  if (!edit.hero) return null;
  return { op: "update-block-content", pageType: "home", sectionId: edit.hero.sectionId, blockId: edit.hero.blockId, content: { title: copy.title.trim(), body: copy.body.trim(), primaryCta: copy.cta.trim() } };
}

/** The banner picture: the hero's first item, as the builder's media field stores it (mediaItemFields). */
export function heroImageOp(draft: EditorDraft, edit: ShopEdit, url: string): EditorOp | null {
  if (!edit.hero) return null;
  const items = homeSections(draft).find((section) => section.id === edit.hero!.sectionId)?.items ?? [];
  const clean = url.trim();
  const picture = { imageUrl: clean, originalSrc: clean, resolvedSrc: clean };
  return { op: "update-section", pageType: "home", sectionId: edit.hero.sectionId, changes: { items: [{ ...(items[0] ?? {}), ...picture }, ...items.slice(1)] } };
}

/** Featured products: the ones picked show first, in this order (none picked: the shop's best sellers). */
export function featuredOp(edit: ShopEdit, productIds: string[]): EditorOp | null {
  if (!edit.featured) return null;
  return { op: "update-section", pageType: "home", sectionId: edit.featured.sectionId, changes: { items: [...new Set(productIds)].map((id) => ({ mappedStoreProductId: id })) } };
}

export function toggleOp(sectionId: string, visible: boolean): EditorOp {
  return { op: "toggle-section", pageType: "home", sectionId, visible };
}

/** Moves a section one place up (-1) or down (+1) among the homepage's own sections; null at either end. */
export function moveOp(draft: EditorDraft, sectionId: string, direction: -1 | 1): EditorOp | null {
  const sections = homeSections(draft);
  const from = sections.findIndex((section) => section.id === sectionId);
  if (from < 0) return null;
  for (let to = from + direction; to >= 0 && to < sections.length; to += direction) {
    if (!isChrome(sections[to].kind)) return { op: "reorder-section", pageType: "home", fromIndex: from, toIndex: to };
  }
  return null;
}

/** Colours a seller can pick on the phone: the accent and buttons together, with text that reads on them. */
export const ACCENT_CHOICES = ["#16141F", "#C9744A", "#E86A4F", "#F2A93B", "#2E7E78", "#1F4FD8", "#6B4F8A", "#D6336C"] as const;

/** White or near-black text, whichever reads better on `hex`. */
export function readableOn(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#FFFFFF";
  const value = parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.36 ? "#16141F" : "#FFFFFF";
}

export function accentOp(color: string): EditorOp {
  const hex = color.toUpperCase();
  return { op: "update-theme", changes: { accent: hex, ctaBg: hex, ctaText: readableOn(hex) } };
}
