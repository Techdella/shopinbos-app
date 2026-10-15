// Campaign blocks (the store-wide pieces): announcement bar, pop-up, product badges and the countdown. Reading their
// stored settings with safe defaults, filling {countdown} / {discount_code} in the seller's words, matching badges
// to products, and the slot rules that decide what shows when several campaigns run at once. Pure, no imports
// beyond relative types, so the editor, the storefront, the server and tests share it.

import { COUNTDOWN_FORMATS, toMs, type CountdownFormat } from "./status.ts";

export const BLOCK_TYPES = ["announcement", "popup", "badge", "countdown"] as const;
export type CampaignBlockType = (typeof BLOCK_TYPES)[number];

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const text = (value: unknown, max: number, fallback = "") => (typeof value === "string" ? value.trim().slice(0, max) : fallback);
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const color = (value: unknown) => (typeof value === "string" && HEX.test(value.trim()) ? value.trim() : "");
const num = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
/** Store links: a path on the store ("/shop") or an https address. */
export function safeBlockLink(value: unknown): string {
  if (typeof value !== "string") return "";
  const link = value.trim().slice(0, 500);
  if (/^\/(?!\/)[^\s]*$/.test(link)) return link;
  if (/^https:\/\/[^\s]+$/i.test(link)) return link;
  return "";
}

// ─── Countdown ────────────────────────────────────────────────────────────────

export const COUNTDOWN_TARGETS = ["end", "start", "custom"] as const;
export const COUNTDOWN_STYLES = ["boxed", "inline", "minimal"] as const;
export const COUNTDOWN_EXPIRY = ["hide", "message", "replace"] as const;
export const COUNTDOWN_DISPLAYS = ["inline", "floating"] as const;

export interface CountdownSettings {
  target: (typeof COUNTDOWN_TARGETS)[number];
  /** ISO time when target is "custom". */
  customAt: string | null;
  format: CountdownFormat;
  style: (typeof COUNTDOWN_STYLES)[number];
  /** What happens at zero: hide it, show `expiredText`, or swap for a link (`replaceText` → `replaceLink`). */
  expiry: (typeof COUNTDOWN_EXPIRY)[number];
  expiredText: string;
  replaceText: string;
  replaceLink: string;
  /** "inline": only inside the bar, pop-up and sections; "floating": also a small timer in the corner of every page. */
  display: (typeof COUNTDOWN_DISPLAYS)[number];
  /** Words over the floating timer ("Sale ends in"). */
  label: string;
}

export function readCountdownSettings(raw: unknown): CountdownSettings {
  const s = obj(raw);
  const custom = typeof s.customAt === "string" && Number.isFinite(Date.parse(s.customAt)) ? new Date(Date.parse(s.customAt)).toISOString() : null;
  return {
    target: pick(s.target, COUNTDOWN_TARGETS, "end"),
    customAt: custom,
    format: pick(s.format, COUNTDOWN_FORMATS, "dhms"),
    style: pick(s.style, COUNTDOWN_STYLES, "boxed"),
    expiry: pick(s.expiry, COUNTDOWN_EXPIRY, "hide"),
    expiredText: text(s.expiredText, 120),
    replaceText: text(s.replaceText, 80),
    replaceLink: safeBlockLink(s.replaceLink),
    display: pick(s.display, COUNTDOWN_DISPLAYS, "inline"),
    label: text(s.label, 60),
  };
}

/** The time a countdown counts to: the campaign's end (default), its start, or a custom time. */
export function countdownTargetMs(settings: Pick<CountdownSettings, "target" | "customAt">, campaign: { startsAt: unknown; endsAt: unknown }): number | null {
  if (settings.target === "custom") return toMs(settings.customAt);
  return toMs((settings.target === "start" ? campaign.startsAt : campaign.endsAt) as string | null);
}

// ─── Announcement bar ─────────────────────────────────────────────────────────

export interface AnnouncementMessage {
  text: string;
  link: string;
  linkLabel: string;
}

export interface AnnouncementSettings {
  messages: AnnouncementMessage[];
  /** Seconds each message shows before the next (several messages only). */
  rotateSeconds: number;
  dismissible: boolean;
  /** Stays at the top while shoppers scroll. */
  sticky: boolean;
  /** Empty: the campaign's colours. */
  background: string;
  textColor: string;
}

export function readAnnouncementSettings(raw: unknown): AnnouncementSettings {
  const s = obj(raw);
  const list = Array.isArray(s.messages) ? s.messages : [];
  const messages = list
    .map((item) => {
      const m = obj(item);
      return { text: text(m.text, 240), link: safeBlockLink(m.link), linkLabel: text(m.linkLabel, 40) };
    })
    .filter((m) => m.text)
    .slice(0, 5);
  return {
    messages,
    rotateSeconds: num(s.rotateSeconds, 3, 30, 5),
    dismissible: s.dismissible !== false,
    sticky: s.sticky === true,
    background: color(s.background),
    textColor: color(s.textColor),
  };
}

export type TextPart = { kind: "text"; value: string } | { kind: "countdown" };

/** The seller's words split around {countdown}, with {discount_code} filled in (dropped when there is no code). */
export function fillCampaignText(value: string, values: { discountCode?: string | null }): TextPart[] {
  const filled = value.replace(/\{discount_code\}/g, values.discountCode ?? "").replace(/\s{2,}/g, " ");
  const parts: TextPart[] = [];
  filled.split(/(\{countdown\})/g).forEach((piece) => {
    if (piece === "{countdown}") parts.push({ kind: "countdown" });
    else if (piece) parts.push({ kind: "text", value: piece });
  });
  return parts;
}

// ─── Pop-up ───────────────────────────────────────────────────────────────────

/** A campaign pop-up is a store pop-up (Marketing > Forms and pop-ups) tied to the campaign: it only shows while it runs. */
export interface PopupBlockSettings {
  formId: string | null;
}

export function readPopupBlockSettings(raw: unknown): PopupBlockSettings {
  const s = obj(raw);
  return { formId: typeof s.formId === "string" && /^[\w-]{1,64}$/.test(s.formId) ? s.formId : null };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export const BADGE_RULES = ["discounted", "all", "collection", "products", "tag"] as const;
export const BADGE_POSITIONS = ["top-left", "top-right"] as const;

export interface BadgeSettings {
  label: string;
  background: string;
  textColor: string;
  appliesTo: (typeof BADGE_RULES)[number];
  collectionId: string;
  productIds: string[];
  tag: string;
  position: (typeof BADGE_POSITIONS)[number];
  /** Show the real "-40%" from the compare-at price instead of the label when the product has one. */
  autoPercent: boolean;
}

export function readBadgeSettings(raw: unknown): BadgeSettings {
  const s = obj(raw);
  return {
    label: text(s.label, 24),
    background: color(s.background),
    textColor: color(s.textColor),
    appliesTo: pick(s.appliesTo, BADGE_RULES, "discounted"),
    collectionId: text(s.collectionId, 64),
    productIds: Array.isArray(s.productIds) ? s.productIds.filter((id): id is string => typeof id === "string" && /^[\w-]{1,64}$/.test(id)).slice(0, 500) : [],
    tag: text(s.tag, 60),
    position: pick(s.position, BADGE_POSITIONS, "top-left"),
    autoPercent: s.autoPercent === true,
  };
}

export interface BadgeProduct {
  id: string;
  retailPrice: number;
  compareAtPrice?: number | null;
  tags?: string[] | null;
}

export function percentOff(product: Pick<BadgeProduct, "retailPrice" | "compareAtPrice">): number | null {
  const was = Number(product.compareAtPrice);
  const now = Number(product.retailPrice);
  if (!Number.isFinite(was) || !Number.isFinite(now) || was <= 0 || now >= was) return null;
  const pct = Math.round(((was - now) / was) * 100);
  return pct >= 1 ? pct : null;
}

/** Whether a badge's rule picks this product (collections are resolved by the caller into `collectionProductIds`). */
export function badgeMatches(settings: BadgeSettings, product: BadgeProduct, collectionProductIds?: ReadonlySet<string> | null): boolean {
  switch (settings.appliesTo) {
    case "all":
      return true;
    case "discounted":
      return percentOff(product) !== null;
    case "products":
      return settings.productIds.includes(product.id);
    case "collection":
      return Boolean(collectionProductIds?.has(product.id));
    case "tag": {
      const wanted = settings.tag.toLowerCase();
      return Boolean(wanted) && (product.tags ?? []).some((tag) => String(tag).toLowerCase() === wanted);
    }
    default:
      return false;
  }
}

/** The words on the badge for this product: the real percentage off when asked for and known, else the label. */
export function badgeText(settings: BadgeSettings, product: BadgeProduct): string {
  if (settings.autoPercent) {
    const pct = percentOff(product);
    if (pct !== null) return `-${pct}%`;
  }
  return settings.label;
}

// ─── Colour contrast (WCAG AA warning in the editor) ─────────────────────────

function luminance(hex: string) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const channels = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(a: string, b: string): number | null {
  if (!HEX.test(a) || !HEX.test(b)) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

/** Normal text needs 4.5:1 to pass WCAG AA. */
export function passesAA(foreground: string, background: string) {
  const ratio = contrastRatio(foreground, background);
  return ratio === null || ratio >= 4.5;
}

// ─── Slot rules (several live campaigns at once) ──────────────────────────────

export interface SlotCampaign {
  id: string;
  priority: number;
  startsAt: unknown;
  /** Has look or section changes (only one campaign's changes apply at a time). */
  hasOverrides: boolean;
  blocks: Array<{ id: string; type: string; enabled: boolean; settings: unknown }>;
}

/** Highest priority first; on a tie, the one that started most recently. */
export function compareCampaignPriority(a: Pick<SlotCampaign, "priority" | "startsAt" | "id">, b: Pick<SlotCampaign, "priority" | "startsAt" | "id">) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const diff = (toMs(b.startsAt as string) ?? 0) - (toMs(a.startsAt as string) ?? 0);
  return diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface SlotResult<C extends SlotCampaign> {
  /** The campaign whose look and section changes show (null: the store's own design). */
  theme: C | null;
  /** The one announcement bar that shows (a campaign bar always beats the store's own). */
  announcement: { campaign: C; blockId: string; settings: AnnouncementSettings } | null;
  /** Pop-ups in the order they may show; the storefront shows at most one per page view. */
  popups: Array<{ campaign: C; blockId: string; formId: string }>;
  /** Badges by priority; each product shows at most MAX_BADGES of them. */
  badges: Array<{ campaign: C; blockId: string; settings: BadgeSettings }>;
  /** The countdown settings each campaign uses (its own block, or the defaults). */
  countdowns: Map<string, { blockId: string | null; settings: CountdownSettings }>;
}

export const MAX_BADGES = 2;

export function resolveCampaignSlots<C extends SlotCampaign>(campaigns: C[]): SlotResult<C> {
  const ordered = [...campaigns].sort(compareCampaignPriority);
  const enabled = (campaign: C, type: CampaignBlockType) => campaign.blocks.filter((block) => block.type === type && block.enabled);
  let announcement: SlotResult<C>["announcement"] = null;
  for (const campaign of ordered) {
    const block = enabled(campaign, "announcement").find((entry) => readAnnouncementSettings(entry.settings).messages.length > 0);
    if (block) {
      announcement = { campaign, blockId: block.id, settings: readAnnouncementSettings(block.settings) };
      break;
    }
  }
  const popups = ordered.flatMap((campaign) =>
    enabled(campaign, "popup")
      .map((block) => ({ campaign, blockId: block.id, formId: readPopupBlockSettings(block.settings).formId }))
      .filter((entry): entry is { campaign: C; blockId: string; formId: string } => Boolean(entry.formId)),
  );
  const badges = ordered.flatMap((campaign) =>
    enabled(campaign, "badge")
      .map((block) => ({ campaign, blockId: block.id, settings: readBadgeSettings(block.settings) }))
      .filter((entry) => entry.settings.label || entry.settings.autoPercent),
  );
  const countdowns = new Map<string, { blockId: string | null; settings: CountdownSettings }>();
  for (const campaign of ordered) {
    const block = enabled(campaign, "countdown")[0];
    countdowns.set(campaign.id, { blockId: block?.id ?? null, settings: readCountdownSettings(block?.settings) });
  }
  return { theme: ordered.find((campaign) => campaign.hasOverrides) ?? null, announcement, popups, badges, countdowns };
}

/** The badges a product shows: the first MAX_BADGES that match, in priority order. */
export function badgesForProduct<B extends { settings: BadgeSettings }>(badges: B[], product: BadgeProduct, collectionProducts?: (badge: B) => ReadonlySet<string> | null): B[] {
  return badges.filter((badge) => badgeMatches(badge.settings, product, collectionProducts?.(badge) ?? null)).slice(0, MAX_BADGES);
}
