// The render merge: the store's published design plus the live campaign's differences, worked out when the storefront
// renders. The store's own snapshot is never changed (every function returns new objects), so when the campaign ends
// the store is simply back to normal, and fixes the seller makes to their store during a campaign still show.
//
//   rendered = base snapshot ⊕ theme override (colour/font keys) ⊕ section overrides (per page) [⊕ hidden base bar]
//
// Section overrides per page are applied in a fixed order: hide → replace → add → reorder. Positions are relative
// ({ before: id }, { after: id } or { index: n } among the page's body sections) so they survive edits to the base.
// An override that points at a section the store no longer has is skipped and reported (orphan), never guessed.
// Pure, type-only imports: tests load it directly.

import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode, ThemeTokenSet } from "../store-templates/types.ts";

export const SECTION_OVERRIDE_ACTIONS = ["add", "hide", "replace", "reorder"] as const;
export type SectionOverrideAction = (typeof SECTION_OVERRIDE_ACTIONS)[number];

export interface SectionPosition {
  before?: string;
  after?: string;
  /** Position among the page's body sections (not the announcement bar, header or footer). */
  index?: number;
}

export interface CampaignSectionOverride {
  id: string;
  /** Page type: home, products, product, cart, about… */
  page: string;
  action: SectionOverrideAction;
  /** The base (or added) section this changes: hide, replace, reorder. */
  sectionId?: string;
  /** The section to add, or the replacement content (replace keeps the base section's id and kind). */
  section?: TemplateSectionNode;
  position?: SectionPosition;
}

export interface CampaignThemeOverride {
  tokens: Partial<ThemeTokenSet>;
  /** A different logo for the campaign (https only). */
  logoUrl?: string | null;
}

export const COLOR_TOKEN_KEYS = ["heroBg", "heroText", "accent", "ctaBg", "ctaText", "paperBg", "cardBg", "ink", "muted", "border"] as const;
export type ColorTokenKey = (typeof COLOR_TOKEN_KEYS)[number];

const CHROME = ["announcement-bar", "header", "footer"];
const isChrome = (section: TemplateSectionNode) => CHROME.includes(section.kind);
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const shortString = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

/** Stored theme override → only valid keys: colours as hex, heading style and corner style from their lists, an https logo. */
export function readThemeOverride(raw: unknown): CampaignThemeOverride {
  const source = obj(raw);
  const tokensIn = obj(source.tokens);
  const tokens: Partial<ThemeTokenSet> = {};
  for (const key of COLOR_TOKEN_KEYS) {
    const value = tokensIn[key];
    if (typeof value === "string" && HEX.test(value.trim())) tokens[key] = value.trim();
  }
  if (tokensIn.headingStyle === "serif" || tokensIn.headingStyle === "grotesk") tokens.headingStyle = tokensIn.headingStyle;
  if (tokensIn.radius === "soft" || tokensIn.radius === "rounded" || tokensIn.radius === "sharp") tokens.radius = tokensIn.radius;
  const logo = typeof source.logoUrl === "string" && /^https:\/\/\S+$/.test(source.logoUrl.trim()) ? source.logoUrl.trim().slice(0, 1000) : null;
  return logo ? { tokens, logoUrl: logo } : { tokens };
}

function readPosition(raw: unknown): SectionPosition | undefined {
  const p = obj(raw);
  const before = shortString(p.before, 120);
  if (before) return { before };
  const after = shortString(p.after, 120);
  if (after) return { after };
  if (typeof p.index === "number" && Number.isFinite(p.index)) return { index: Math.max(0, Math.min(200, Math.floor(p.index))) };
  return undefined;
}

function readSection(raw: unknown): TemplateSectionNode | undefined {
  const s = obj(raw);
  const id = shortString(s.id, 120);
  const kind = shortString(s.kind, 80);
  if (!id || !kind || CHROME.includes(kind)) return undefined;
  return {
    ...(s as unknown as TemplateSectionNode),
    id,
    kind,
    name: shortString(s.name, 120) ?? kind,
    visible: s.visible !== false,
    blocks: Array.isArray(s.blocks) ? (s.blocks as TemplateSectionNode["blocks"]) : [],
  };
}

/** Stored section overrides → clean list (unknown actions and incomplete entries dropped, at most 60). */
export function readSectionOverrides(raw: unknown): CampaignSectionOverride[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: CampaignSectionOverride[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const o = obj(item);
    const id = shortString(o.id, 64);
    const page = shortString(o.page, 64) ?? "home";
    const action = SECTION_OVERRIDE_ACTIONS.find((entry) => entry === o.action);
    if (!id || !action || seen.has(id)) continue;
    const sectionId = shortString(o.sectionId, 120);
    const section = readSection(o.section);
    const position = readPosition(o.position);
    if ((action === "hide" || action === "reorder") && !sectionId) continue;
    if (action === "reorder" && !position) continue;
    if (action === "replace" && (!sectionId || !section)) continue;
    if (action === "add" && !section) continue;
    seen.add(id);
    out.push({ id, page, action, ...(sectionId ? { sectionId } : {}), ...(section ? { section } : {}), ...(position ? { position } : {}) });
    if (out.length >= 60) break;
  }
  return out;
}

/** Where `position` puts a section in `sections` (an array index), or null when its anchor is gone. */
function insertIndex(sections: TemplateSectionNode[], position: SectionPosition | undefined): number | null {
  if (position?.before) {
    const at = sections.findIndex((section) => section.id === position.before);
    return at === -1 ? null : at;
  }
  if (position?.after) {
    const at = sections.findIndex((section) => section.id === position.after);
    return at === -1 ? null : at + 1;
  }
  // Index among body sections: before the n-th body section, else before the footer (or at the end).
  const bodyIndexes = sections.map((section, at) => (isChrome(section) ? -1 : at)).filter((at) => at !== -1);
  const index = position?.index ?? bodyIndexes.length;
  if (index < bodyIndexes.length) return bodyIndexes[index]!;
  const footer = sections.findIndex((section) => section.kind === "footer");
  if (footer !== -1) return footer;
  const lastBody = bodyIndexes[bodyIndexes.length - 1];
  if (lastBody !== undefined) return lastBody + 1;
  const header = sections.map((section) => section.kind).lastIndexOf("header");
  return header !== -1 ? header + 1 : sections.length;
}

export interface MergeResult {
  sections: TemplateSectionNode[];
  /** Overrides that no longer apply (their section was removed from the store). */
  skipped: string[];
}

/** One page's sections with the overrides for that page applied in order hide → replace → add → reorder. */
export function applySectionOverrides(base: TemplateSectionNode[], overrides: CampaignSectionOverride[]): MergeResult {
  let sections = [...base];
  const skipped: string[] = [];
  const byAction = (action: SectionOverrideAction) => overrides.filter((entry) => entry.action === action);

  for (const override of byAction("hide")) {
    const at = sections.findIndex((section) => section.id === override.sectionId);
    if (at === -1) skipped.push(override.id);
    else sections[at] = { ...sections[at]!, visible: false };
  }
  for (const override of byAction("replace")) {
    const at = sections.findIndex((section) => section.id === override.sectionId);
    if (at === -1 || !override.section) {
      skipped.push(override.id);
      continue;
    }
    const current = sections[at]!;
    sections[at] = { ...current, ...override.section, id: current.id, kind: current.kind, visible: current.visible };
  }
  for (const override of byAction("add")) {
    if (!override.section) continue;
    if (sections.some((section) => section.id === override.section!.id)) continue;
    const at = insertIndex(sections, override.position);
    if (at === null) {
      skipped.push(override.id);
      continue;
    }
    sections = [...sections.slice(0, at), { ...override.section, visible: override.section.visible !== false }, ...sections.slice(at)];
  }
  for (const override of byAction("reorder")) {
    const from = sections.findIndex((section) => section.id === override.sectionId);
    if (from === -1) {
      skipped.push(override.id);
      continue;
    }
    const moving = sections[from]!;
    const rest = sections.filter((_, index) => index !== from);
    const at = insertIndex(rest, override.position);
    if (at === null) {
      skipped.push(override.id);
      continue;
    }
    sections = [...rest.slice(0, at), moving, ...rest.slice(at)];
  }
  return { sections, skipped };
}

export interface CampaignLook {
  theme: CampaignThemeOverride;
  sections: CampaignSectionOverride[];
  /** A campaign announcement bar is showing: the store's own bar steps aside (one bar at a time). */
  hideStoreAnnouncement?: boolean;
}

export function lookIsEmpty(look: CampaignLook | null | undefined) {
  return !look || (!Object.keys(look.theme.tokens).length && !look.theme.logoUrl && !look.sections.length && !look.hideStoreAnnouncement);
}

/** The snapshot as the campaign shows it. The base is left untouched. */
export function applyCampaignToSnapshot(base: StoreEditorSnapshot, look: CampaignLook): { snapshot: StoreEditorSnapshot; skipped: string[] } {
  const skipped: string[] = [];
  const pages: TemplatePageSeed[] = (Array.isArray(base.pages) ? base.pages : []).map((page) => {
    const own = look.sections.filter((override) => override.page === page.pageType);
    let sections = Array.isArray(page.sections) ? page.sections : [];
    if (own.length) {
      const result = applySectionOverrides(sections, own);
      sections = result.sections;
      skipped.push(...result.skipped);
    }
    if (look.hideStoreAnnouncement) sections = sections.map((section) => (section.kind === "announcement-bar" ? { ...section, visible: false } : section));
    return sections === page.sections ? page : { ...page, sections };
  });
  // Overrides for pages this store doesn't have can't apply either.
  const pageTypes = new Set(pages.map((page) => page.pageType));
  for (const override of look.sections) if (!pageTypes.has(override.page as TemplatePageSeed["pageType"])) skipped.push(override.id);
  return {
    snapshot: { ...base, themeTokens: { ...base.themeTokens, ...look.theme.tokens }, pages },
    skipped: [...new Set(skipped)],
  };
}

/** Overrides that no longer apply to this snapshot ("1 change no longer applies" in the campaign editor). */
export function orphanedOverrides(base: StoreEditorSnapshot | null | undefined, overrides: CampaignSectionOverride[]): string[] {
  if (!base) return [];
  return applyCampaignToSnapshot(base, { theme: { tokens: {} }, sections: overrides }).skipped;
}

/**
 * Store.brandSettings for a storefront render with the campaign's look: the published snapshot merged, the saved
 * theme colours merged (stores without a published snapshot read these). A copy: the stored settings never change.
 */
export function applyCampaignToBrandSettings<T extends Record<string, unknown>>(brandSettings: T, look: CampaignLook): T {
  if (lookIsEmpty(look)) return brandSettings;
  const copy: Record<string, unknown> = { ...brandSettings };
  const editor = obj(copy.editor);
  const published = editor.published as StoreEditorSnapshot | undefined;
  if (published && typeof published === "object" && Array.isArray(published.pages)) {
    copy.editor = { ...editor, published: applyCampaignToSnapshot(published, look).snapshot };
  }
  if (Object.keys(look.theme.tokens).length) copy.themeTokens = { ...obj(copy.themeTokens), ...look.theme.tokens };
  return copy as T;
}
