// Pop-up kinds (what a pop-up is for) and their small pure rules: lead-magnet download links, call-to-action
// links, the flash-sale countdown and the words with an {amount} in them. No imports beyond types, so the
// seller editor, the public API, the storefront and the tests share them (Node strips the types in tests).

import type { PopupConfig } from "./forms.ts";

/**
 * What a pop-up is for. The seller picks this first, then a template for it.
 * - signup: join the list, optionally for a reward code (% off, ₦ off, free delivery, mystery gift)
 * - game: spin the wheel, scratch card or pick a gift box (prizes from Marketing > Rewards)
 * - lead_magnet: a free download (size guide, e-book) after signing up
 * - announcement: news with a button (new arrivals, cart reminder); no form
 * - countdown: a sale with a timer and a button; hides itself when the time is up
 * - free_delivery: "Free delivery over ₦20,000", with the shopper's progress from their bag
 */
export const POPUP_KINDS = ["signup", "game", "lead_magnet", "announcement", "countdown", "free_delivery"] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];

export const POPUP_GAMES = ["wheel", "scratch", "box"] as const;
export type PopupGameKind = (typeof POPUP_GAMES)[number];

export const CTA_TARGETS = ["shop", "link", "cart", "checkout"] as const;
/** Where the button of a no-form pop-up goes: close it and keep shopping, a link, the bag, or checkout. */
export type CtaTarget = (typeof CTA_TARGETS)[number];

/** Kinds that sign the shopper up (with the sign-up form): people already on the list don't see them again. */
export function collectsSignup(kind: PopupKind) {
  return kind === "signup" || kind === "lead_magnet";
}

/** Kinds with no form: just words and a button. */
export function hasCta(kind: PopupKind) {
  return kind === "announcement" || kind === "countdown" || kind === "free_delivery";
}

// ─── Lead magnet ──────────────────────────────────────────────────────────────

export interface LeadMagnet {
  /** The file or page they get (https only): an uploaded PDF, or a link to the seller's own guide. */
  url: string;
  /** "Free size guide": what the download button says it is. */
  name: string;
  /** Also email the link to them (as well as showing it on screen). */
  emailIt: boolean;
}

/** An https link with a host, no spaces, no credentials, not absurdly long. */
export function safeDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 1000 || /\s/.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** A stored lead magnet, or null when there is no usable link. */
export function readLeadMagnet(raw: unknown): LeadMagnet | null {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const url = safeDownloadUrl(r.url);
  if (!url) return null;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 80) : "Your free download";
  return { url, name, emailIt: r.emailIt !== false };
}

/** "size-guide.pdf" → "size guide": a name to suggest from an uploaded file's name. */
export function downloadNameFromFile(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

// ─── Call to action ───────────────────────────────────────────────────────────

/** A link the button may open: https, or a path on the store ("/product/…"), never "//host" or javascript:. */
export function safeCtaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 1000 || /\s/.test(text)) return null;
  if (text.startsWith("/") && !text.startsWith("//") && !text.startsWith("/\\")) return text;
  return safeDownloadUrl(text);
}

/**
 * Where the button goes on the storefront: null means "close the pop-up and keep shopping".
 * Store paths are put under the store's own address (`/s/slug` or "" on a custom domain).
 */
export function ctaHref(target: CtaTarget, url: string, basePath = ""): string | null {
  const base = basePath.replace(/\/+$/, "");
  if (target === "cart") return `${base}/cart`;
  if (target === "checkout") return `${base}/checkout`;
  if (target !== "link") return null;
  const safe = safeCtaUrl(url);
  if (!safe) return null;
  return safe.startsWith("/") ? `${base}${safe}` : safe;
}

// ─── Countdown ────────────────────────────────────────────────────────────────

/** An end time as ISO, or null when it isn't a real date. */
export function readEndsAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  ended: boolean;
}

/** Time left until `endsAt`, in whole days/hours/minutes/seconds (all 0 and ended once it has passed). */
export function countdownParts(endsAt: string | null, now = Date.now()): CountdownParts {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  const left = Number.isFinite(end) ? Math.max(0, Math.floor((end - now) / 1000)) : 0;
  return {
    days: Math.floor(left / 86_400),
    hours: Math.floor((left % 86_400) / 3_600),
    minutes: Math.floor((left % 3_600) / 60),
    seconds: left % 60,
    ended: left <= 0,
  };
}

/** "2026-10-31T18:00" (what a datetime-local input shows) for an ISO time, in the browser's own time zone. */
export function toLocalInput(iso: string | null, offsetMinutes = new Date().getTimezoneOffset()) {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Date(time - offsetMinutes * 60_000).toISOString().slice(0, 16);
}

// ─── Words ────────────────────────────────────────────────────────────────────

/** Fills {amount} (the free-delivery amount) in the seller's words. */
export function fillWords(text: string, values: { amount?: string | null }) {
  return text.replace(/\{amount\}/g, values.amount ?? "");
}

/** Whether the pop-up can show now for its kind: a countdown that has ended never shows, a cart reminder needs a bag. */
export function kindAllows(config: Pick<PopupConfig, "kind" | "endsAt" | "onlyWithCart">, visit: { cartCount?: number; now?: number }) {
  if (config.onlyWithCart && !((visit.cartCount ?? 0) > 0)) return false;
  if (config.kind === "countdown" && countdownParts(config.endsAt, visit.now).ended) return false;
  return true;
}
