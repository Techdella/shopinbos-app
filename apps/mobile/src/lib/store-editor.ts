import { api } from "./api";
import { rexApi } from "./rex-jobs";
import type { EdSection, EdSnapshot, Renderer, ScheduledPublish } from "@shared/store-editor";

export * from "@shared/store-editor";
export * from "@shared/rich-text";

// The store editor on the phone (app/store-editor.tsx, design SE-00…SE-16). It edits the web builder's own draft:
//   GET   /api/mobile/store-editor            the store (what the canvas draws), draft, published, version, catalogue
//   PATCH /api/mobile/store-editor            autosave { snapshot, baseVersion, force? } → { version } (409 CONFLICT
//                                              when the draft changed on another device since)
//   POST  /api/mobile/store-editor/publish    { version } → the live shop is the draft (publishStoreDraft, as the web)
//   POST  /api/mobile/store-editor/rex        { message, section?, page?, baseVersion } → Rex changes the draft
//   GET/POST/DELETE /api/mobile/store-editor/schedule   "Schedule for later" (SE-13): the draft as saved goes live then
//   POST  /api/mobile/store-editor/photo      Brighten, Remove background, Make with Rex (SE-05/06): a new picture URL
// The pure rules (undo history, changes, sections, theme, what changed) are shared/store-editor.ts.

export interface EditorProduct {
  id: string;
  name: string;
  images: string[];
  retailPrice?: number;
  currency?: string;
}

export interface EditorStore {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  storefrontUrl: string | null;
  status?: string;
  storeProducts: EditorProduct[];
  [key: string]: unknown;
}

export interface EditorLoad {
  store: EditorStore;
  draft: EdSnapshot | null;
  published: EdSnapshot | null;
  version: string;
  renderer: Renderer;
  catalog: Record<string, EdSection>;
  pageBody: EdSection | null;
  collections: { id: string; name: string }[];
  live: boolean;
  /** A publish set for later (null: none). */
  scheduled?: ScheduledPublish | null;
}

export const fetchStoreEditor = () => api<EditorLoad>("/api/mobile/store-editor");

export const saveStoreDraft = (snapshot: EdSnapshot, baseVersion: string | null, force = false) =>
  api<{ version: string }>("/api/mobile/store-editor", { method: "PATCH", json: { snapshot, baseVersion, ...(force ? { force: true } : {}) } });

export const publishStoreDraft = (version: string | null) =>
  api<{ published: EdSnapshot | null; draft: EdSnapshot | null; version: string; url: string | null }>("/api/mobile/store-editor/publish", { method: "POST", json: { version } });

export interface RexEdit {
  reply: string;
  changes: string[];
  draft: EdSnapshot | null;
  version: string | null;
}

export const askRexToEdit = (input: { message: string; section?: string; page?: string; baseVersion: string | null }) =>
  api<RexEdit>("/api/mobile/store-editor/rex", { method: "POST", json: input });

// Small things the phone remembers: the coach marks and the "Try it" dock show once.
const SEEN_KEY = "shopinbos.storeEditor.seen";

export function editorSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markEditorSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // No storage: the tips show again next time.
  }
}

export function readBackup(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeBackup(key: string, value: unknown | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No storage (or full): the server copy is still saved by autosave.
  }
}

// ─── Schedule for later (SE-13) ──────────────────────────────────────────────

export const fetchScheduledPublish = () => api<{ scheduled: ScheduledPublish | null }>("/api/mobile/store-editor/schedule").then((body) => body.scheduled ?? null);

/** The draft as saved now (`version`: what the phone saved) goes live at `at`. Again: reschedules. */
export const schedulePublish = (at: Date, version: string | null) =>
  api<{ scheduled: ScheduledPublish }>("/api/mobile/store-editor/schedule", { method: "POST", json: { at: at.toISOString(), version } }).then((body) => body.scheduled);

export const cancelScheduledPublish = () => api<{ cancelled: boolean }>("/api/mobile/store-editor/schedule", { method: "DELETE" });

// ─── Photo tools (SE-05, SE-06) ──────────────────────────────────────────────

/** A brighter copy of the photo (from the original each time; level 1-3). Free. */
export const brightenPhoto = (url: string, level: number) =>
  api<{ url: string }>("/api/mobile/store-editor/photo", { method: "POST", json: { action: "brighten", url, level } }).then((body) => body.url);

/** The photo with its background removed (a Rex job: one picture use). */
export const cutOutPhoto = (url: string) =>
  rexApi<{ url: string; creditsLeft: number | null }>("/api/mobile/store-editor/photo", { action: "cutout", url }, "store-cutout").then((body) => body.url);

/** "Make with Rex": one picture for the selected spot (a Rex job: one picture use, no banner words). */
export const makeRexPhoto = (input: { label: string; words?: string; ask?: string; shape?: "wide" | "tall" | "square" }) =>
  rexApi<{ url: string; creditsLeft: number | null }>("/api/mobile/store-editor/photo", { action: "rex", ...input, ask: input.ask?.trim() || undefined }, "store-photo").then((body) => body.url);
