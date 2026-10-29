// The draft a store gets when it has none: the theme the seller chose, else a free library theme that fits what
// they sell. Used to be the "blank" starter (createBlankEditorSnapshot), which rendered as an empty-looking split
// hero; stores still on it are moved by scripts/move-blank-starter-stores.ts.

import { createSnapshotFromTemplate, getTemplateManifest } from "./catalog";
import { createBlankEditorSnapshot, type StoreBrandSettingsLike } from "./editor";
import { getCurrentTemplateMeta } from "./http";
import { isBlankStarter, isLibraryTheme, starterThemeId, switchThemeDraft, themeTier, withoutBlankPlaceholders, type ThemeLibraryId, type ThemePickInput } from "./theme-library";
import type { StoreEditorSnapshot } from "./types";
import { LEGACY_LOOK_THEME_IDS } from "@shared/onboarding";
import { ALL_THEMES_FREE } from "@shared/plans";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** What the store sells, from the onboarding answers and Rex's brief. */
export function starterPickInput(brandSettings: StoreBrandSettingsLike, extra: ThemePickInput = {}): ThemePickInput {
  const memory = asRecord((brandSettings as Record<string, unknown>).onboardingMemory);
  const said = [
    ...(Array.isArray(memory.categories) ? memory.categories : []),
    memory.category,
    memory.businessDescription,
    (brandSettings as Record<string, unknown>).tagline,
    extra.storeCategory,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return { ...extra, storeCategory: said.join(", ") };
}

/**
 * The look the seller tapped in onboarding, as a library theme (older phone builds saved ids that match no theme).
 * Only a hint: what they sell decides first, since the old phone screens pre-select their first look.
 */
export function onboardingLookTheme(brandSettings: StoreBrandSettingsLike): ThemeLibraryId | null {
  const saved = asRecord((brandSettings as Record<string, unknown>).onboardingMemory).templateId;
  if (typeof saved !== "string") return null;
  const id = LEGACY_LOOK_THEME_IDS[saved] ?? saved;
  if (!isLibraryTheme(id)) return null;
  return ALL_THEMES_FREE || themeTier(id) === "basic" ? id : null;
}

/** A fresh draft on the starter theme, or the blank starter if that theme has no manifest. */
export function starterSnapshot(brandSettings: StoreBrandSettingsLike, storeName: string, extra?: ThemePickInput): StoreEditorSnapshot {
  const manifest = getTemplateManifest(starterThemeId(starterPickInput(brandSettings, extra), onboardingLookTheme(brandSettings) ?? undefined));
  return manifest ? createSnapshotFromTemplate(manifest) : createBlankEditorSnapshot(storeName);
}

/** The draft to start from when the store has none saved: the chosen theme's, else the starter theme's. */
export function fallbackDraftSnapshot(brandSettings: StoreBrandSettingsLike, storeName: string, extra?: ThemePickInput): StoreEditorSnapshot {
  const selected = getCurrentTemplateMeta(brandSettings);
  const manifest = selected ? getTemplateManifest(selected.templateId) : null;
  return manifest ? createSnapshotFromTemplate(manifest) : starterSnapshot(brandSettings, storeName, extra);
}

/**
 * A blank-starter draft moved onto the starter theme. The seller's own copy, images, products and extra pages come
 * across (switchThemeDraft against the blank seed); the blank placeholders don't. Any other draft is returned as is.
 */
export function moveOffBlankStarter(draft: StoreEditorSnapshot, brandSettings: StoreBrandSettingsLike, storeName: string, extra?: ThemePickInput) {
  if (!isBlankStarter(draft)) return { snapshot: draft, moved: false, carriedSections: 0, keptPages: 0 };
  const next = starterSnapshot(brandSettings, storeName, extra);
  if (isBlankStarter(next)) return { snapshot: draft, moved: false, carriedSections: 0, keptPages: 0 };
  const switched = switchThemeDraft(withoutBlankPlaceholders(draft), next, withoutBlankPlaceholders(createBlankEditorSnapshot(storeName)));
  return { ...switched, moved: true };
}

