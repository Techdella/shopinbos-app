import { api } from "./api";
import type { EdSection, EdSnapshot, Renderer } from "@shared/store-editor";

export * from "@shared/store-editor";

// The store editor on the phone (app/store-editor.tsx, design SE-00…SE-16). It edits the web builder's own draft:
//   GET   /api/mobile/store-editor            the store (what the canvas draws), draft, published, version, catalogue
//   PATCH /api/mobile/store-editor            autosave { snapshot, baseVersion, force? } → { version } (409 CONFLICT
//                                              when the draft changed on another device since)
//   POST  /api/mobile/store-editor/publish    { version } → the live shop is the draft (publishStoreDraft, as the web)
//   POST  /api/mobile/store-editor/rex        { message, section?, page?, baseVersion } → Rex changes the draft
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
