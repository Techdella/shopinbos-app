// Status: 24-hour stories between sellers, suppliers and delivery partners (the phone app's Status row). The pure
// rules: who sees whose posts, how the feed is ordered and capped, when a post expires, which call-to-action each
// role can put on a post, and how text is cleaned (plain text only). Shared by the server (src/lib/status) and
// unit-tested in tests/status.test.mjs. Pure: its only import is the place helpers in ./delivery-market.ts.

import { canonicalState, parseArea } from "./delivery-market.ts";

export const STATUS_ROLES = ["seller", "supplier", "logistics_partner"] as const;
export type StatusRole = (typeof STATUS_ROLES)[number];

export const STATUS_TONES = ["peach", "mint", "blue", "warn", "ink"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export const STATUS_CTA_KINDS = ["add_product", "chat", "connect", "see_rates", "offer_delivery", "view_shop"] as const;
export type StatusCtaKind = (typeof STATUS_CTA_KINDS)[number];

/** A post lives this long; reads never return it after, and the purge cron deletes it later. */
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
export const STATUS_HEADLINE_MAX = 80;
export const STATUS_CAPTION_MAX = 280;
/** New posts per user per day (shared rate limit). */
export const STATUS_POSTS_PER_DAY = 10;
/** Authors in the feed at most. */
export const STATUS_FEED_AUTHORS = 30;
export const STATUS_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const STATUS_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export const isStatusRole = (role: unknown): role is StatusRole => (STATUS_ROLES as readonly unknown[]).includes(role);

// ─── Audience ────────────────────────────────────────────────────────────────

/**
 * Whose posts each role sees: sellers see suppliers and delivery partners; suppliers see delivery partners and the
 * sellers who sell their products; partners see sellers and suppliers. Nobody sees their own role's posts.
 */
export const AUDIENCE: Record<StatusRole, readonly StatusRole[]> = {
  seller: ["supplier", "logistics_partner"],
  supplier: ["logistics_partner", "seller"],
  logistics_partner: ["seller", "supplier"],
};

export function audienceRoles(role: unknown): readonly StatusRole[] {
  return isStatusRole(role) ? AUDIENCE[role] : [];
}

/**
 * Whether a viewer sees an author's posts: everyone in the roles their role may see (suppliers see sellers and
 * delivery partners too). `related` (a seller selling the supplier's products, a delivery connection) only orders
 * the feed (audienceTier); it no longer hides anyone.
 */
export function canSee(viewer: { userId: string; role: unknown }, author: { userId: string; role: unknown }, _related: boolean) {
  if (viewer.userId === author.userId) return false;
  return audienceRoles(viewer.role).includes(author.role as StatusRole);
}

/** 0: a real relationship, 1: the same state, 2: anyone else the role may see. */
export function audienceTier(input: { related: boolean; sameState: boolean }): 0 | 1 | 2 {
  return input.related ? 0 : input.sameState ? 1 : 2;
}

export interface FeedCandidate {
  userId: string;
  tier: 0 | 1 | 2;
  seen: boolean;
  /** The newest live post's time. */
  latestAt: Date | string;
}

/**
 * The feed's authors: the closest ones first (relationships, then the same state, then newest), capped, and then
 * shown with the authors whose posts the viewer hasn't seen first (keeping that order inside each group).
 */
export function rankFeed<T extends FeedCandidate>(candidates: readonly T[], viewerId: string, cap = STATUS_FEED_AUTHORS): T[] {
  const time = (value: Date | string) => new Date(value).getTime();
  const picked = candidates
    .filter((candidate) => candidate.userId !== viewerId)
    .slice()
    .sort((a, b) => a.tier - b.tier || time(b.latestAt) - time(a.latestAt))
    .slice(0, Math.max(0, cap));
  return [...picked.filter((candidate) => !candidate.seen), ...picked.filter((candidate) => candidate.seen)];
}

/**
 * The Nigerian states a business is in or serves, from its city and (delivery partners) its pickup and delivery
 * areas ("Lagos", "Lagos: Ikeja", "Ikeja"). Regions and "Nationwide" are too broad to count as the same state.
 */
export function statesOf(texts: ReadonlyArray<string | null | undefined>): Set<string> {
  const states = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const token = parseArea(text);
    if (token && (token.kind === "state" || token.kind === "area")) states.add(token.state);
    else {
      const state = canonicalState(text) ?? (text.includes(",") ? canonicalState(text.split(",").pop()) : null);
      if (state) states.add(state);
    }
  }
  return states;
}

export function sharesState(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  for (const state of a) if (b.has(state)) return true;
  return false;
}

// ─── Expiry ──────────────────────────────────────────────────────────────────

export function statusExpiresAt(createdAt: Date = new Date()) {
  return new Date(createdAt.getTime() + STATUS_TTL_MS);
}

/** Live until expiresAt (exclusive). */
export function isLive(post: { expiresAt: Date | string }, now: Date = new Date()) {
  return new Date(post.expiresAt).getTime() > now.getTime();
}

// ─── Calls to action ─────────────────────────────────────────────────────────

/** What each role can put on its own post (what the viewer can do with it). */
export const CTA_BY_ROLE: Record<StatusRole, readonly StatusCtaKind[]> = {
  // Sellers add the product through the dropship agreement, or ask the supplier for a price in a chat.
  supplier: ["add_product", "chat", "view_shop"],
  // Shops and suppliers connect to the partner, look at their rates, or ask in a chat.
  logistics_partner: ["connect", "see_rates", "chat"],
  // Partners offer to deliver for the shop; suppliers look at the shop or chat.
  seller: ["offer_delivery", "view_shop", "chat"],
};

export const CTA_LABELS: Record<StatusCtaKind, string> = {
  add_product: "Add to my shop",
  chat: "Send a message",
  connect: "Use them for delivery",
  see_rates: "See their rates",
  offer_delivery: "Offer delivery",
  view_shop: "View shop",
};

export function ctaAllowed(role: unknown, kind: StatusCtaKind) {
  return isStatusRole(role) && CTA_BY_ROLE[role].includes(kind);
}

/** Why a call-to-action can't go on this post, or null. add_product needs one of the supplier's own products. */
export function ctaProblem(role: unknown, kind: StatusCtaKind | null | undefined, hasProduct: boolean): string | null {
  if (!kind) return null;
  if (!ctaAllowed(role, kind)) return "That button isn't available for your posts.";
  if (kind === "add_product" && !hasProduct) return "Pick the product shops can add.";
  return null;
}

// ─── Plain text ──────────────────────────────────────────────────────────────

// Control characters (keeping tab and newline), zero-width and bidi overrides.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

function clip(text: string, max: number) {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() : text;
}

function stripMarkup(input: unknown) {
  return String(input ?? "")
    .normalize("NFC")
    .replace(/<[^>]*>?/g, " ")
    .replace(CONTROL, "")
    .replace(/\t/g, " ");
}

/** One line of plain text: no tags, no control characters, spaces collapsed, at most `max` characters. */
export function plainLine(input: unknown, max = STATUS_HEADLINE_MAX) {
  return clip(stripMarkup(input).replace(/\s+/g, " ").trim(), max);
}

/** Plain text that may keep line breaks (at most one blank line in a row), at most `max` characters. */
export function plainText(input: unknown, max = STATUS_CAPTION_MAX) {
  const text = stripMarkup(input)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clip(text, max);
}

// ─── Images ──────────────────────────────────────────────────────────────────

/** Where a user's status photos are stored in the public media bucket. */
export function statusImageDir(userId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new Error("Bad user id");
  return `status/${userId}`;
}

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

export const isStatusImageType = (type: string) => (STATUS_IMAGE_TYPES as readonly string[]).includes(type);

/** A fresh, unguessable path for an uploaded status photo; the extension comes from the checked type. */
export function statusImagePath(userId: string, type: string, id: string, now = Date.now()) {
  const ext = isStatusImageType(type) ? IMAGE_EXT[type] : undefined;
  if (!ext) throw new Error("Not a status image type");
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) throw new Error("Bad id");
  return `${statusImageDir(userId)}/${now}-${id}.${ext}`;
}

/**
 * A post's image must be one this user uploaded through POST /api/mobile/status/upload: a public URL in our bucket
 * under status/<userId>/ (https, or http for a local Supabase on loopback).
 */
export function isStatusImageUrl(url: string, options: { supabaseUrl: string | null | undefined; bucket: string; userId: string }) {
  if (!options.supabaseUrl) return false;
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(options.supabaseUrl);
  } catch {
    return false;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (target.protocol !== "https:" && !(loopback && target.protocol === "http:")) return false;
  if (target.protocol !== base.protocol || target.host !== base.host) return false;
  if (target.username || target.password || target.search || target.hash) return false;
  const prefix = `/storage/v1/object/public/${options.bucket}/${statusImageDir(options.userId)}/`;
  const path = decodeURIComponent(target.pathname);
  return path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && !path.includes("..") && /\.(jpe?g|png|webp|heic|heif)$/i.test(path);
}
