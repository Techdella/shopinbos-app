// Rex Studio's version history: snapshots of the editor DRAFT kept in Store.brandSettings.rexVersions so the
// seller can undo a Rex change or go back to the original store. Publishing is separate; nothing here touches
// what shoppers see. Pure (no imports at runtime), unit-tested in tests/behaviour.test.mjs.

import type { StoreEditorSnapshot } from "@/lib/store-templates";

export interface RexVersion {
  id: string;
  /** Shown as "v1", "v2"… Keeps counting up after old versions are dropped. */
  n: number;
  /** "Original store", or the request that made this version. */
  label: string;
  at: string;
  snapshot: StoreEditorSnapshot;
}

export interface RexVersionState {
  /** The version the draft currently matches (null when nothing has been recorded yet). */
  current: string | null;
  /** Oldest first. */
  items: RexVersion[];
}

export interface RexVersionSummary {
  id: string;
  n: number;
  label: string;
  at: string;
  /** The draft is this version right now. */
  current: boolean;
}

export const MAX_REX_VERSIONS = 20;
/** Every shopper-facing and seller-facing read of the store loads brandSettings, so history stays small. */
export const MAX_REX_VERSION_BYTES = 800_000;
export const ORIGINAL_VERSION_LABEL = "Original store";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isSnapshot(value: unknown): value is StoreEditorSnapshot {
  const snapshot = record(value);
  return typeof snapshot.templateId === "string" && Array.isArray(snapshot.pages) && Boolean(snapshot.themeTokens);
}

export function readRexVersions(brandSettings: unknown): RexVersionState {
  const raw = record(record(brandSettings).rexVersions);
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(record)
    .filter((item) => typeof item.id === "string" && typeof item.n === "number" && isSnapshot(item.snapshot))
    .map((item) => ({
      id: item.id as string,
      n: item.n as number,
      label: typeof item.label === "string" ? item.label : "",
      at: typeof item.at === "string" ? item.at : "",
      snapshot: item.snapshot as StoreEditorSnapshot,
    }));
  const current = typeof raw.current === "string" && items.some((item) => item.id === raw.current) ? raw.current : null;
  return { current, items };
}

function size(items: RexVersion[]) {
  return items.reduce((total, item) => total + JSON.stringify(item).length, 0);
}

/**
 * Drops the oldest versions until at most `max` remain and they fit in `maxBytes`. The original store (the
 * first version recorded) is always kept so the seller can get back to where they started, and so is the newest.
 */
export function boundRexVersions(items: RexVersion[], max = MAX_REX_VERSIONS, maxBytes = MAX_REX_VERSION_BYTES): RexVersion[] {
  if (items.length <= 1) return items;
  const [original, ...rest] = items;
  const pinned = original.label === ORIGINAL_VERSION_LABEL ? original : null;
  let kept = pinned ? rest : items;
  const room = Math.max(1, max - (pinned ? 1 : 0));
  if (kept.length > room) kept = kept.slice(kept.length - room);
  while (kept.length > 1 && size(pinned ? [pinned, ...kept] : kept) > maxBytes) kept = kept.slice(1);
  return pinned ? [pinned, ...kept] : kept;
}

/** Records a new version (it becomes the current one) and bounds the history. */
export function pushRexVersion(
  state: RexVersionState,
  entry: { label: string; snapshot: StoreEditorSnapshot; at?: string; id?: string },
  limits: { max?: number; maxBytes?: number } = {},
): { state: RexVersionState; version: RexVersion } {
  const n = state.items.reduce((highest, item) => Math.max(highest, item.n), 0) + 1;
  const at = entry.at ?? new Date().toISOString();
  const version: RexVersion = {
    id: entry.id ?? `v${n}-${Date.parse(at).toString(36)}`,
    n,
    label: entry.label.trim().replace(/\s+/g, " ").slice(0, 140) || `Version ${n}`,
    at,
    snapshot: entry.snapshot,
  };
  const items = boundRexVersions([...state.items, version], limits.max, limits.maxBytes);
  return { state: { current: version.id, items }, version };
}

/** Makes sure the store as it was before Rex's first change is kept as v1 "Original store". */
export function ensureOriginalVersion(state: RexVersionState, snapshot: StoreEditorSnapshot, at?: string): RexVersionState {
  if (state.items.length) return state;
  return pushRexVersion(state, { label: ORIGINAL_VERSION_LABEL, snapshot, at }).state;
}

export const BUILDER_EDIT_LABEL = "Changes made in the builder";

/**
 * Before Rex changes the draft: keep the draft as it is now, so "Undo this" can always go back to it. The
 * first time that's v1 "Original store"; later, only when the draft was changed elsewhere (the advanced
 * builder) since the current version, so those edits are never lost by an undo.
 */
export function recordDraftBeforeChange(state: RexVersionState, draft: StoreEditorSnapshot, at?: string): RexVersionState {
  if (!state.items.length) return ensureOriginalVersion(state, draft, at);
  const current = state.current ? findRexVersion(state, state.current) : null;
  if (current && current.snapshot.updatedAt === draft.updatedAt) return state;
  return pushRexVersion(state, { label: BUILDER_EDIT_LABEL, snapshot: draft, at }).state;
}

export function findRexVersion(state: RexVersionState, id: string) {
  return state.items.find((item) => item.id === id) ?? null;
}

/** The version just before `id` (what "Undo this" goes back to). */
export function previousRexVersion(state: RexVersionState, id: string) {
  const index = state.items.findIndex((item) => item.id === id);
  return index > 0 ? state.items[index - 1] : null;
}

/**
 * Newest first, without snapshots. A version only counts as "current" while the draft still matches it: if
 * the seller changed the draft in the advanced builder since, no version is marked as now.
 */
export function summariseRexVersions(state: RexVersionState, draftUpdatedAt?: string | null): RexVersionSummary[] {
  const current = state.current ? findRexVersion(state, state.current) : null;
  const matches = Boolean(current && (!draftUpdatedAt || current.snapshot.updatedAt === draftUpdatedAt));
  return [...state.items]
    .reverse()
    .map((item) => ({ id: item.id, n: item.n, label: item.label, at: item.at, current: matches && item.id === current?.id }));
}
