// Rex jobs: a durable record of each paid Rex generation (logos, pictures, flyers, packs, banners, video scripts,
// shots and voiceovers), so a seller who loses signal, presses back or closes the app mid-way gets the result when
// they come back, and is never charged twice for the same tap (docs/migrations/2026-12-14-rex-jobs.sql,
// src/lib/ai/rex-jobs.server.ts). Pure rules here, shared by the server, the web and the phone.
//
//   Each "Generate" tap gets a clientKey (a uuid) the client keeps until the result is on screen. The server keeps
//   one RexJob per (user, clientKey):
//     none            → start: create the job, charge once, make it, save the result
//     running         → pending: the client polls GET /api/app/rex-jobs/[id]
//     running, stale  → the function died mid-way: refund what it took, then start again
//     done            → replay the saved result, no charge
//     failed          → its charge was already given back: start again on the same key

export const REX_JOB_KINDS = [
  "logo",
  "image",
  "flyer",
  "post",
  "status",
  "reel_design",
  "packaging",
  "banner",
  "video_script",
  "reel_shots",
  "voiceover",
  "store_build",
] as const;
export type RexJobKind = (typeof REX_JOB_KINDS)[number];

export type RexJobStatus = "queued" | "running" | "done" | "failed";

/** A job still "running" after this long was cut off (the longest Rex route has 300 s): it can be taken over. */
export const REX_JOB_STALE_MS = 6 * 60 * 1000;

/** How far back the "Rex finished something for you" list looks. */
export const REX_JOB_RESUME_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** How long a client keeps reusing the same key for the same request (a retry after reconnecting). */
export const REX_KEY_REUSE_MS = 60 * 60 * 1000;

/** How often clients poll a pending job, and for how long before giving up for now. */
export const REX_POLL_MS = 3000;
export const REX_POLL_MAX_MS = 6 * 60 * 1000;

export function isRexJobKind(value: unknown): value is RexJobKind {
  return typeof value === "string" && (REX_JOB_KINDS as readonly string[]).includes(value);
}

/** A client key we accept: 8–80 letters, digits, dashes or underscores (a uuid fits). Anything else → no job. */
export function cleanClientKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(key) ? key : null;
}

export type RexJobDecision = "start" | "pending" | "replay" | "retry" | "stale";

/** What to do with a request whose (user, clientKey) already has a job (null: none yet). */
export function decideRexJob(existing: { status: string; updatedAt: Date | string } | null, now = Date.now()): RexJobDecision {
  if (!existing) return "start";
  if (existing.status === "done") return "replay";
  if (existing.status === "failed") return "retry";
  const updated = new Date(existing.updatedAt).getTime();
  if (Number.isFinite(updated) && now - updated > REX_JOB_STALE_MS) return "stale";
  return "pending";
}

/**
 * The credits a job still holds after its charges and refunds: what a failure gives back. Never below zero.
 */
export function creditsHeld(charges: Array<{ credits: number }>, refunds: Array<{ credits: number }> = []) {
  const taken = charges.reduce((sum, item) => sum + Math.max(0, Math.round(item.credits || 0)), 0);
  const back = refunds.reduce((sum, item) => sum + Math.max(0, Math.round(item.credits || 0)), 0);
  return Math.max(0, taken - back);
}

/**
 * A short copy of what was asked, kept on the job (never photos or audio, never long text): strings to 400 chars,
 * lists to 8 items, 3 levels deep. Data: URLs and base64 are dropped.
 */
export function trimRexInput(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (value.startsWith("data:") || (value.length > 400 && /^[A-Za-z0-9+/=\s]+$/.test(value))) return "[data]";
    return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return null;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => trimRexInput(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
      const trimmed = trimRexInput(item, depth + 1);
      if (trimmed !== null) out[key] = trimmed;
    }
    return out;
  }
  return null;
}

/** A stable signature of a request, so a client reuses its key only for the same ask. */
export function rexRequestSignature(kind: string, input: unknown): string {
  const text = `${kind}:${stableJson(input)}`;
  // FNV-1a, 32-bit: short and good enough to tell two asks apart on one device.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

// ── What clients see ─────────────────────────────────────────────────────────────────────────────────────────

export interface RexJobView {
  id: string;
  kind: RexJobKind;
  status: "pending" | "done" | "failed";
  /** The saved result: the same shape the generating route answers with (logos, image, url, script…). */
  result: Record<string, unknown> | null;
  error: string | null;
  creditsCharged: number;
  seen: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rexJobView(row: {
  id: string;
  kind: string;
  status: string;
  result: unknown;
  error: string | null;
  creditsCharged: number;
  seenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): RexJobView {
  const result = row.result && typeof row.result === "object" && !Array.isArray(row.result) ? (row.result as Record<string, unknown>) : null;
  return {
    id: row.id,
    kind: (isRexJobKind(row.kind) ? row.kind : "image") as RexJobKind,
    status: row.status === "done" ? "done" : row.status === "failed" ? "failed" : "pending",
    result,
    error: row.error ?? null,
    creditsCharged: row.creditsCharged,
    seen: Boolean(row.seenAt),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** Parses ?kind=logo,image into known kinds (empty: every kind). */
export function parseRexKinds(value: string | null | undefined): RexJobKind[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(isRexJobKind);
}

/** The pending answer a generating route gives while the job is still running (202). */
export interface RexPending {
  pending: true;
  rexJobId: string;
}

export function isRexPending(value: unknown): value is RexPending {
  return Boolean(value && typeof value === "object" && (value as RexPending).pending === true && typeof (value as RexPending).rexJobId === "string");
}

// ── Keys kept on the device ──────────────────────────────────────────────────────────────────────────────────

/** Minimal storage both localStorage (web) and expo-sqlite/localStorage (phone) give. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SavedKey {
  key: string;
  sig: string;
  at: number;
}

const slotKey = (slot: string) => `shopinbos.rexKey.${slot}`;

/**
 * The key for one "Generate" tap on a screen (`slot`, e.g. "logo"): the saved key when it was for the same ask
 * and is recent (a retry after reconnecting), else a fresh one. Saved until `forgetRexKey`.
 */
export function rexKeyFor(store: KeyStore | null, slot: string, sig: string, makeId: () => string, now = Date.now()): string {
  try {
    const raw = store?.getItem(slotKey(slot));
    const saved = raw ? (JSON.parse(raw) as SavedKey) : null;
    if (saved && saved.sig === sig && typeof saved.key === "string" && now - saved.at < REX_KEY_REUSE_MS) return saved.key;
  } catch {
    // A broken entry: start a new key.
  }
  const key = makeId();
  try {
    store?.setItem(slotKey(slot), JSON.stringify({ key, sig, at: now } satisfies SavedKey));
  } catch {
    // Storage full or off: the request still runs, just without resume on this device.
  }
  return key;
}

/** The result is on screen: the next tap gets a new key. */
export function forgetRexKey(store: KeyStore | null, slot: string) {
  try {
    store?.removeItem(slotKey(slot));
  } catch {
    // Nothing to do.
  }
}

/** A random id for a key (crypto.randomUUID when there is one). */
export function newRexKey(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `rk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}
