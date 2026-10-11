import { BQ_SERIF } from "@/components/storefront/boutique/fonts";
import {
  createSnapshotFromTemplate,
  getTemplateManifest,
  parseEditorState,
  type StoreEditorSnapshot,
  type ThemeTokenSet,
} from "@/lib/store-templates";
import { parseBrandSettings } from "@/lib/workspace";

// What the seller's store looks like right now, read from Store.brandSettings: the snapshot shoppers see
// (published), else the builder draft, else the chosen template's starting point. Shared by the
// "Your store" hub and the brand kit so both describe the same store.

export type StoreLookSource = "published" | "draft" | "template";

export interface StoreLook {
  snapshot: StoreEditorSnapshot | null;
  source: StoreLookSource | null;
  /** Theme tokens the builder edits (draft first, so a colour just changed shows up here too). */
  tokens: ThemeTokenSet | null;
  themeName: string | null;
  themeId: string | null;
  live: boolean;
  hasDraftChanges: boolean;
}

/** Prefilled request for Rex Studio (/studio?prompt=…) behind "Rebrand with Rex". */
export const REBRAND_PROMPT = "Rebrand my store: a new logo, new colours and a fresh homepage. Keep my products, prices and pages.";

const CHROME = new Set(["announcement-bar", "header", "footer"]);

export function readStoreLook(store: { brandSettings: unknown; status: string }): StoreLook {
  const settings = parseBrandSettings(store.brandSettings);
  const editor = parseEditorState(settings.editor);
  const templateId = settings.template?.templateId ?? editor.template?.templateId ?? null;
  const manifest = templateId ? getTemplateManifest(templateId) : null;

  let snapshot: StoreEditorSnapshot | null = null;
  let source: StoreLookSource | null = null;
  if (editor.published) {
    snapshot = editor.published;
    source = "published";
  } else if (editor.draft) {
    snapshot = editor.draft;
    source = "draft";
  } else if (manifest) {
    snapshot = createSnapshotFromTemplate(manifest);
    if (settings.themeTokens) snapshot.themeTokens = { ...snapshot.themeTokens, ...settings.themeTokens };
    source = "template";
  }

  const tokens = editor.draft?.themeTokens ?? editor.published?.themeTokens ?? settings.themeTokens ?? snapshot?.themeTokens ?? null;
  const live = (store.status === "active" || store.status === "published") && Boolean(editor.published);
  const hasDraftChanges = Boolean(editor.draft && editor.published && editor.draft.updatedAt !== editor.published.updatedAt);

  return {
    snapshot,
    source,
    tokens,
    themeName: settings.template?.templateName ?? editor.template?.templateName ?? snapshot?.templateName ?? null,
    themeId: templateId ?? snapshot?.templateId ?? null,
    live,
    hasDraftChanges,
  };
}

/** Content sections on a page of the snapshot (header, footer and announcement bar don't count). */
export function contentSectionCount(snapshot: StoreEditorSnapshot | null, pageType: string) {
  const page = snapshot?.pages.find((entry) => entry.pageType === pageType);
  if (!page) return null;
  return page.sections.filter((section) => section.visible !== false && !CHROME.has(section.kind)).length;
}

export function hasPage(snapshot: StoreEditorSnapshot | null, pageType: string) {
  return Boolean(snapshot?.pages.some((entry) => entry.pageType === pageType));
}

/** Readable names for the four colours the brand kit shows. */
export const BRAND_COLOURS: Array<{ key: "paperBg" | "ink" | "accent" | "cardBg"; label: string; hint: string }> = [
  { key: "paperBg", label: "Background", hint: "Page background" },
  { key: "ink", label: "Text", hint: "Headings and body text" },
  { key: "accent", label: "Accent", hint: "Links, prices and highlights" },
  { key: "cardBg", label: "Soft", hint: "Cards and panels" },
];

/** Builder token that follows a brand colour, so buttons keep matching the accent. */
export const LINKED_TOKENS: Partial<Record<keyof ThemeTokenSet, Array<keyof ThemeTokenSet>>> = {
  accent: ["ctaBg"],
};

export function headingFont(tokens: ThemeTokenSet | null) {
  // --bq-serif comes from BOUTIQUE_FONT_CLASS (put it on the page root); the app shell remaps the other serif vars.
  return tokens?.headingStyle === "serif" ? BQ_SERIF : "var(--font-app), 'Plus Jakarta Sans', system-ui, sans-serif";
}

/** "#abc", "#AABBCC" or "rgb(…)" → "#AABBCC" (colour inputs only take six-digit hex). */
export function toHex6(value: string | null | undefined, fallback = "#000000") {
  const raw = (value ?? "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(raw);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  return fallback;
}
