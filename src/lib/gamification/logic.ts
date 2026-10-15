// Store rewards (gamification): spin-the-wheel and scratch-card prizes, the reward progress bar in the bag,
// loyalty points and the post-purchase spin. Settings live in Store.brandSettings.gamification (so they
// work before the gamification SQL is applied); prize codes are ordinary one-use Discount rows.
// Pure functions only: no imports, so the storefront, the seller page, the server and the tests share them
// (Node strips the types natively in tests/gamification.test.mjs).

// ─── Settings ─────────────────────────────────────────────────────────────────

export type SliceKind = "percent" | "amount" | "free_delivery" | "free_gift" | "try_again";

export interface GameSlice {
  id: string;
  kind: SliceKind;
  /** Percent off (percent) or naira off (amount); ignored otherwise. */
  value: number;
  /** The free gift (free_gift). */
  productId: string | null;
  /** What the shopper sees on the wheel; empty means "worked out from the prize". */
  label: string;
  /** Relative chance. 0 = never lands (still shown on the wheel). */
  weight: number;
}

export type GameTrigger = "entry" | "exit" | "delay" | "scroll";
export type ContactChoice = "email" | "whatsapp" | "either";

export interface PopupGameSettings {
  enabled: boolean;
  trigger: GameTrigger;
  delaySeconds: number;
  scrollPercent: number;
  /** Show the pop-up again to the same browser after this many days. Server cap: one play per contact per period. */
  frequencyDays: number;
  collect: ContactChoice;
  headline: string;
  body: string;
}

export type TierRewardKind = "free_gift" | "percent" | "amount";

export interface ProgressTier {
  id: string;
  /** Bag subtotal that unlocks it. */
  threshold: number;
  kind: TierRewardKind;
  value: number;
  productId: string | null;
  label: string;
}

export interface LoyaltySettings {
  enabled: boolean;
  /** Points earned for every ₦100 spent on products. */
  pointsPer100: number;
  /** Naira one point is worth at checkout. */
  pointValue: number;
  /** Points can pay for at most this share of the products (percent). */
  maxRedeemPercent: number;
  /** Fewest points a shopper can use at once. */
  minRedeemPoints: number;
  /** Lifetime points for Silver and Gold. */
  silverAt: number;
  goldAt: number;
  /** Earn multipliers: the tiers' perk. */
  silverMultiplier: number;
  goldMultiplier: number;
  /** Extra perk text the seller honours by hand ("Free gift wrap"). */
  silverPerk: string;
  goldPerk: string;
  /** When points were switched on (ISO): only orders placed since then earn. */
  startedAt: string | null;
}

export interface GamificationConfig {
  prizes: {
    slices: GameSlice[];
    /** Days a won code stays valid. */
    codeDays: number;
    /** Smallest bag a won code works on (0 = any). */
    minOrder: number;
  };
  wheel: PopupGameSettings;
  scratch: PopupGameSettings;
  progress: { enabled: boolean; freeDelivery: boolean; tiers: ProgressTier[] };
  loyalty: LoyaltySettings;
  postPurchase: { enabled: boolean; headline: string };
}

export const MIN_SLICES = 4;
export const MAX_SLICES = 8;
export const MAX_TIERS = 3;

export const DEFAULT_SLICES: GameSlice[] = [
  { id: "s1", kind: "percent", value: 5, productId: null, label: "", weight: 30 },
  { id: "s2", kind: "free_delivery", value: 0, productId: null, label: "", weight: 15 },
  { id: "s3", kind: "percent", value: 10, productId: null, label: "", weight: 15 },
  { id: "s4", kind: "try_again", value: 0, productId: null, label: "", weight: 25 },
  { id: "s5", kind: "amount", value: 1000, productId: null, label: "", weight: 10 },
  { id: "s6", kind: "percent", value: 15, productId: null, label: "", weight: 5 },
];

const POPUP_DEFAULTS: PopupGameSettings = {
  enabled: false,
  trigger: "delay",
  delaySeconds: 8,
  scrollPercent: 50,
  frequencyDays: 7,
  collect: "either",
  headline: "Spin to win a treat",
  body: "One spin per person. Prizes are real discounts you can use today.",
};

export const DEFAULT_GAME_CONFIG: GamificationConfig = {
  prizes: { slices: DEFAULT_SLICES, codeDays: 7, minOrder: 0 },
  wheel: { ...POPUP_DEFAULTS },
  scratch: { ...POPUP_DEFAULTS, trigger: "scroll", headline: "Scratch to reveal your surprise", body: "Every card hides something. Scratch it or tap Reveal." },
  progress: { enabled: true, freeDelivery: true, tiers: [] },
  loyalty: {
    enabled: false,
    pointsPer100: 1,
    pointValue: 1,
    maxRedeemPercent: 20,
    minRedeemPoints: 100,
    silverAt: 2000,
    goldAt: 10000,
    silverMultiplier: 1.25,
    goldMultiplier: 1.5,
    silverPerk: "",
    goldPerk: "",
    startedAt: null,
  },
  postPurchase: { enabled: false, headline: "Spin for your next order" },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function str(value: unknown, fallback: string, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

const SLICE_KINDS: SliceKind[] = ["percent", "amount", "free_delivery", "free_gift", "try_again"];
const TRIGGERS: GameTrigger[] = ["entry", "exit", "delay", "scroll"];
const CONTACTS: ContactChoice[] = ["email", "whatsapp", "either"];
const TIER_KINDS: TierRewardKind[] = ["free_gift", "percent", "amount"];

function cleanId(value: unknown, fallback: string) {
  const id = typeof value === "string" ? value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) : "";
  return id || fallback;
}

export function readSlice(raw: unknown, index: number): GameSlice {
  const s = record(raw);
  const kind = oneOf(s.kind, SLICE_KINDS, "try_again");
  return {
    id: cleanId(s.id, `s${index + 1}`),
    kind,
    value: kind === "percent" ? Math.round(num(s.value, 10, 1, 90)) : kind === "amount" ? Math.round(num(s.value, 500, 1, 10_000_000)) : 0,
    productId: kind === "free_gift" && typeof s.productId === "string" && s.productId ? s.productId.slice(0, 64) : null,
    label: str(s.label, "", 28),
    weight: Math.round(num(s.weight, 10, 0, 1000)),
  };
}

function readPopup(raw: unknown, fallback: PopupGameSettings): PopupGameSettings {
  const p = record(raw);
  return {
    enabled: bool(p.enabled, fallback.enabled),
    trigger: oneOf(p.trigger, TRIGGERS, fallback.trigger),
    delaySeconds: Math.round(num(p.delaySeconds, fallback.delaySeconds, 1, 120)),
    scrollPercent: Math.round(num(p.scrollPercent, fallback.scrollPercent, 5, 100)),
    frequencyDays: Math.round(num(p.frequencyDays, fallback.frequencyDays, 1, 365)),
    collect: oneOf(p.collect, CONTACTS, fallback.collect),
    headline: str(p.headline, fallback.headline, 80) || fallback.headline,
    body: str(p.body, fallback.body, 240),
  };
}

export function readTier(raw: unknown, index: number): ProgressTier {
  const t = record(raw);
  const kind = oneOf(t.kind, TIER_KINDS, "free_gift");
  return {
    id: cleanId(t.id, `t${index + 1}`),
    threshold: Math.round(num(t.threshold, 20000, 1, 100_000_000)),
    kind,
    value: kind === "percent" ? Math.round(num(t.value, 5, 1, 90)) : kind === "amount" ? Math.round(num(t.value, 1000, 1, 10_000_000)) : 0,
    productId: kind === "free_gift" && typeof t.productId === "string" && t.productId ? t.productId.slice(0, 64) : null,
    label: str(t.label, "", 40),
  };
}

/** Store.brandSettings (or the gamification object itself) as clean settings; anything missing gets the default. */
export function readGameConfig(brandSettingsOrConfig: unknown): GamificationConfig {
  const outer = record(brandSettingsOrConfig);
  const raw = "gamification" in outer ? record(outer.gamification) : outer;
  const prizes = record(raw.prizes);
  const slices = Array.isArray(prizes.slices) ? prizes.slices.slice(0, MAX_SLICES).map(readSlice) : DEFAULT_SLICES;
  const progress = record(raw.progress);
  const loyalty = record(raw.loyalty);
  const d = DEFAULT_GAME_CONFIG.loyalty;
  const silverAt = Math.round(num(loyalty.silverAt, d.silverAt, 1, 100_000_000));
  const post = record(raw.postPurchase);
  return {
    prizes: {
      slices: slices.length >= MIN_SLICES ? dedupeIds(slices) : DEFAULT_SLICES,
      codeDays: Math.round(num(prizes.codeDays, 7, 1, 90)),
      minOrder: Math.round(num(prizes.minOrder, 0, 0, 100_000_000)),
    },
    wheel: readPopup(raw.wheel, DEFAULT_GAME_CONFIG.wheel),
    scratch: readPopup(raw.scratch, DEFAULT_GAME_CONFIG.scratch),
    progress: {
      enabled: bool(progress.enabled, true),
      freeDelivery: bool(progress.freeDelivery, true),
      tiers: Array.isArray(progress.tiers) ? dedupeIds(progress.tiers.slice(0, MAX_TIERS).map(readTier)).sort((a, b) => a.threshold - b.threshold) : [],
    },
    loyalty: {
      enabled: bool(loyalty.enabled, false),
      pointsPer100: num(loyalty.pointsPer100, d.pointsPer100, 0.1, 100),
      pointValue: num(loyalty.pointValue, d.pointValue, 0.01, 1000),
      maxRedeemPercent: Math.round(num(loyalty.maxRedeemPercent, d.maxRedeemPercent, 1, 100)),
      minRedeemPoints: Math.round(num(loyalty.minRedeemPoints, d.minRedeemPoints, 1, 1_000_000)),
      silverAt,
      goldAt: Math.max(silverAt + 1, Math.round(num(loyalty.goldAt, d.goldAt, 2, 100_000_000))),
      silverMultiplier: num(loyalty.silverMultiplier, d.silverMultiplier, 1, 5),
      goldMultiplier: num(loyalty.goldMultiplier, d.goldMultiplier, 1, 5),
      silverPerk: str(loyalty.silverPerk, "", 80),
      goldPerk: str(loyalty.goldPerk, "", 80),
      startedAt: typeof loyalty.startedAt === "string" && !Number.isNaN(Date.parse(loyalty.startedAt)) ? new Date(loyalty.startedAt).toISOString() : null,
    },
    postPurchase: { enabled: bool(post.enabled, false), headline: str(post.headline, DEFAULT_GAME_CONFIG.postPurchase.headline, 80) || DEFAULT_GAME_CONFIG.postPurchase.headline },
  };
}

function dedupeIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    let id = item.id;
    while (seen.has(id)) id = `${item.id}${index}`;
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

/** Problems that stop the seller saving (in words for them); empty when the settings make sense. */
export function configProblems(config: GamificationConfig): string[] {
  const problems: string[] = [];
  const slices = config.prizes.slices;
  if (slices.length < MIN_SLICES || slices.length > MAX_SLICES) problems.push(`The wheel needs ${MIN_SLICES} to ${MAX_SLICES} slices.`);
  if (!slices.some((slice) => slice.weight > 0)) problems.push("At least one slice needs a chance above 0.");
  if (!slices.some((slice) => slice.kind !== "try_again" && slice.weight > 0)) problems.push("At least one prize needs a chance above 0, or nobody can win.");
  if (slices.some((slice) => slice.kind === "free_gift" && !slice.productId)) problems.push("Pick the product for each free-gift slice.");
  if (config.progress.tiers.some((tier) => tier.kind === "free_gift" && !tier.productId)) problems.push("Pick the product for each free-gift reward.");
  const thresholds = config.progress.tiers.map((tier) => tier.threshold);
  if (new Set(thresholds).size !== thresholds.length) problems.push("Two rewards can't unlock at the same amount.");
  return problems;
}

// ─── Prizes ───────────────────────────────────────────────────────────────────

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/** Short wheel label: "10% off", "₦1,000 off", "Free delivery", "Free gift", "Try again". */
export function sliceLabel(slice: Pick<GameSlice, "kind" | "value" | "label">, money: (n: number) => string = naira) {
  if (slice.label) return slice.label;
  switch (slice.kind) {
    case "percent":
      return `${slice.value}% off`;
    case "amount":
      return `${money(slice.value)} off`;
    case "free_delivery":
      return "Free delivery";
    case "free_gift":
      return "Free gift";
    default:
      return "Try again";
  }
}

/** Each slice's chance, in whole percent (rounded so they add up to 100 when any slice can land). */
export function sliceOdds(slices: Array<Pick<GameSlice, "weight">>): number[] {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.weight), 0);
  if (total <= 0) return slices.map(() => 0);
  const exact = slices.map((slice) => (Math.max(0, slice.weight) / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest);
  for (const entry of order) {
    if (left <= 0) break;
    if (exact[entry.index]! > 0) {
      floors[entry.index]!++;
      left--;
    }
  }
  return floors;
}

/**
 * The slice a ticket lands on. The server draws `ticket` uniformly from [0, total weight) with a secure random
 * number; slices that can't be won right now (eligible false) have no tickets. -1 when nothing can land.
 */
export function pickWeighted(weights: number[], ticket: number, eligible: boolean[] = weights.map(() => true)): number {
  let cursor = 0;
  for (let index = 0; index < weights.length; index++) {
    const w = eligible[index] ? Math.max(0, Math.floor(weights[index]!)) : 0;
    if (w > 0 && ticket < cursor + w) return index;
    cursor += w;
  }
  return -1;
}

/** Tickets in play: what the server draws the ticket below. */
export function totalTickets(weights: number[], eligible: boolean[] = weights.map(() => true)) {
  return weights.reduce((sum, w, index) => sum + (eligible[index] ? Math.max(0, Math.floor(w)) : 0), 0);
}

export interface PrizeDiscount {
  type: "percentage" | "fixed_amount" | "free_shipping";
  value: number;
  productIds: string[];
}

/** The Discount a won slice (or an unlocked tier) becomes; null for "try again" or a gift with no price. */
export function prizeDiscount(prize: { kind: SliceKind | TierRewardKind; value: number; productId: string | null }, giftPrice: number | null = null): PrizeDiscount | null {
  switch (prize.kind) {
    case "percent":
      return prize.value > 0 ? { type: "percentage", value: Math.min(90, prize.value), productIds: [] } : null;
    case "amount":
      return prize.value > 0 ? { type: "fixed_amount", value: prize.value, productIds: [] } : null;
    case "free_delivery":
      return { type: "free_shipping", value: 0, productIds: [] };
    case "free_gift":
      // The gift's price off, on that product only: one gift free when it's in the bag.
      return prize.productId && giftPrice && giftPrice > 0 ? { type: "fixed_amount", value: giftPrice, productIds: [prize.productId] } : null;
    default:
      return null;
  }
}

/** Unambiguous code characters: no 0/O, 1/I/L. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const GAME_CODE_PREFIXES = { wheel: "SPIN", scratch: "SCRATCH", post_purchase: "NEXT", box: "BOX", tier: "TIER" } as const;
/** "box" (pick a gift box) only runs from a marketing pop-up (Marketing > Forms and pop-ups), with the same prizes. */
export type GameKind = "wheel" | "scratch" | "post_purchase" | "box";

/** "SPIN-7KQ2MX" from random bytes (the server passes crypto bytes; 8 characters ≈ 31^8 ≈ 850 billion codes). */
export function gameCode(prefix: string, bytes: ArrayLike<number>, length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[(bytes[i % bytes.length]! + Math.floor(i / bytes.length) * 7) % CODE_ALPHABET.length];
  return `${prefix}-${out}`;
}

export function isGameCode(code: string | null | undefined) {
  return /^(SPIN|SCRATCH|NEXT|BOX)-[A-Z0-9]{4,}$/.test(String(code ?? "").toUpperCase());
}

// ─── Pick a gift box ──────────────────────────────────────────────────────────

export const GIFT_BOXES = 3;

/**
 * What each gift box held, for the reveal after the shopper opens one: the chosen box holds the prize the server
 * drew (`prizeIndex`); the others show different prizes (no repeats while there are enough), so it is clear what
 * else was in play. Purely for show: the server draws before any box opens. `seed` only shuffles the others.
 */
export function boxReveal(prizeIndex: number, chosen: number, boxes: number, sliceCount: number, seed = 0): number[] {
  const count = Math.max(1, Math.floor(boxes));
  const pick = Math.min(count - 1, Math.max(0, Math.floor(chosen)));
  const others = Array.from({ length: Math.max(0, sliceCount) }, (_, index) => index).filter((index) => index !== prizeIndex);
  // Small deterministic shuffle (Park–Miller), so the same seed always gives the same reveal.
  let state = (Math.abs(Math.floor(seed)) % 2_147_483_646) + 1;
  for (let i = others.length - 1; i > 0; i--) {
    state = (state * 48_271) % 2_147_483_647;
    const j = state % (i + 1);
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const result: number[] = [];
  let cursor = 0;
  for (let box = 0; box < count; box++) {
    if (box === pick) result.push(prizeIndex);
    else if (others.length) result.push(others[cursor++ % others.length]!);
    else result.push(prizeIndex);
  }
  return result;
}

/** Who is playing, as one key: the email (lowercase) or the phone's digits. */
export function contactKey(email: string | null | undefined, phone: string | null | undefined) {
  const e = String(email ?? "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return `e:${e}`;
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? `p:${digits}` : null;
}

/** Whether the same contact may play again: one play per game per `days`. */
export function canPlayAgain(lastPlayedAt: Date | null | undefined, days: number, now = new Date()) {
  if (!lastPlayedAt) return true;
  return now.getTime() - lastPlayedAt.getTime() >= days * 86_400_000;
}

/** The reward tiers the bag shows, from Store.brandSettings (none while reward progress is off). */
export function rewardTiersFor(brandSettings: unknown): ProgressTier[] {
  const config = readGameConfig(record(brandSettings).gamification ?? {});
  return config.progress.enabled ? config.progress.tiers : [];
}

// ─── Pop-up rules (storefront) ────────────────────────────────────────────────

/** Whether this browser should see the pop-up now: not played, not shown within the frequency period. */
export function popupDue(settings: Pick<PopupGameSettings, "enabled" | "frequencyDays">, state: { lastShownAt: number | null; played: boolean; shownThisSession: boolean }, now = Date.now()) {
  if (!settings.enabled || state.played || state.shownThisSession) return false;
  return !state.lastShownAt || now - state.lastShownAt >= settings.frequencyDays * 86_400_000;
}

// ─── Reward progress (bag, cart page, checkout) ──────────────────────────────

export interface Milestone {
  id: string;
  kind: "free_delivery" | TierRewardKind;
  threshold: number;
  label: string;
  reached: boolean;
  remaining: number;
  /** Where the marker sits on the bar, 0–100. */
  position: number;
  productId: string | null;
}

export interface RewardProgressState {
  milestones: Milestone[];
  /** The next one to unlock, or null when all are reached. */
  next: Milestone | null;
  /** Bar fill, 0–100, relative to the last milestone. */
  percent: number;
  reachedCount: number;
}

export function tierLabel(tier: Pick<ProgressTier, "kind" | "value" | "label">, giftName?: string | null, money: (n: number) => string = naira) {
  if (tier.label) return tier.label;
  if (tier.kind === "percent") return `${tier.value}% off`;
  if (tier.kind === "amount") return `${money(tier.value)} off`;
  return giftName ? `Free ${giftName}` : "A free gift";
}

/**
 * Milestones for a bag: free delivery (from the seller's delivery settings) and the seller's reward tiers,
 * in order of the amount that unlocks them. Null when there is nothing to show.
 */
export function rewardProgress(subtotal: number, freeDeliveryOver: number | null | undefined, tiers: ProgressTier[], giftNames: Record<string, string> = {}, money: (n: number) => string = naira): RewardProgressState | null {
  const raw: Array<Omit<Milestone, "reached" | "remaining" | "position">> = [];
  if (freeDeliveryOver && freeDeliveryOver > 0) raw.push({ id: "free_delivery", kind: "free_delivery", threshold: freeDeliveryOver, label: "Free delivery", productId: null });
  for (const tier of tiers) {
    if (tier.threshold > 0) raw.push({ id: tier.id, kind: tier.kind, threshold: tier.threshold, label: tierLabel(tier, tier.productId ? giftNames[tier.productId] : null, money), productId: tier.productId });
  }
  if (!raw.length) return null;
  raw.sort((a, b) => a.threshold - b.threshold);
  const top = raw[raw.length - 1]!.threshold;
  const value = Math.max(0, subtotal);
  const milestones: Milestone[] = raw.map((entry) => ({
    ...entry,
    reached: value >= entry.threshold,
    remaining: Math.max(0, Math.ceil(entry.threshold - value)),
    position: Math.round((entry.threshold / top) * 100),
  }));
  return {
    milestones,
    next: milestones.find((entry) => !entry.reached) ?? null,
    percent: Math.min(100, Math.round((value / top) * 100)),
    reachedCount: milestones.filter((entry) => entry.reached).length,
  };
}

/** "Add ₦4,500 more for free delivery" / "You've unlocked free delivery and A free gift". */
export function progressMessage(state: RewardProgressState, money: (n: number) => string = naira) {
  if (state.next) return { lead: `Add ${money(state.next.remaining)} more`, rest: ` for ${lowerFirst(state.next.label)}` };
  const names = state.milestones.map((entry) => lowerFirst(entry.label));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "";
  return { lead: "You've unlocked", rest: ` ${list}` };
}

function lowerFirst(text: string) {
  return /^Free\b/.test(text) ? `f${text.slice(1)}` : text;
}

// ─── Loyalty points ───────────────────────────────────────────────────────────

export type LoyaltyTier = "bronze" | "silver" | "gold";
export const TIER_NAMES: Record<LoyaltyTier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

export function loyaltyTier(lifetimeEarned: number, settings: Pick<LoyaltySettings, "silverAt" | "goldAt">): LoyaltyTier {
  if (lifetimeEarned >= settings.goldAt) return "gold";
  if (lifetimeEarned >= settings.silverAt) return "silver";
  return "bronze";
}

export function tierMultiplier(tier: LoyaltyTier, settings: Pick<LoyaltySettings, "silverMultiplier" | "goldMultiplier">) {
  return tier === "gold" ? settings.goldMultiplier : tier === "silver" ? settings.silverMultiplier : 1;
}

/** Points for spending `amount` on products (after discounts, not delivery), whole points rounded down. */
export function pointsForSpend(amount: number, settings: Pick<LoyaltySettings, "pointsPer100">, multiplier = 1) {
  if (!(amount > 0)) return 0;
  return Math.floor(Math.round(((amount / 100) * settings.pointsPer100 * multiplier) * 1000) / 1000);
}

/** Naira a number of points is worth at checkout. */
export function pointsValue(points: number, settings: Pick<LoyaltySettings, "pointValue">) {
  return Math.round(Math.max(0, points) * settings.pointValue * 100) / 100;
}

/**
 * Points a shopper can use on a bag and what they take off: never more than their balance, never more than
 * maxRedeemPercent of the products (`base`, after any code), nothing below the minimum. Asking for more is
 * clamped down; asking for less than the minimum uses none.
 */
export function redeemablePoints(input: { balance: number; base: number; requested?: number | null }, settings: Pick<LoyaltySettings, "pointValue" | "maxRedeemPercent" | "minRedeemPoints">) {
  const balance = Math.max(0, Math.floor(input.balance));
  const capNaira = Math.max(0, input.base) * (settings.maxRedeemPercent / 100);
  const capPoints = Math.floor(capNaira / settings.pointValue + 1e-9);
  const max = Math.min(balance, capPoints);
  const usableMax = max >= settings.minRedeemPoints ? max : 0;
  const wanted = input.requested == null ? usableMax : Math.max(0, Math.floor(input.requested));
  const points = Math.min(wanted, usableMax);
  const used = points >= settings.minRedeemPoints ? points : 0;
  return { max: usableMax, points: used, amount: Math.min(pointsValue(used, settings), Math.round(capNaira * 100) / 100) };
}

/** Lifetime points still needed for the next tier, or null at Gold. */
export function nextTier(lifetimeEarned: number, settings: Pick<LoyaltySettings, "silverAt" | "goldAt">): { tier: LoyaltyTier; remaining: number } | null {
  const tier = loyaltyTier(lifetimeEarned, settings);
  if (tier === "gold") return null;
  const target = tier === "bronze" ? settings.silverAt : settings.goldAt;
  return { tier: tier === "bronze" ? "silver" : "gold", remaining: Math.max(0, target - lifetimeEarned) };
}

/** Order statuses that earn points (paid or later), and those that take them back. */
export const EARNING_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"];
export const VOID_STATUSES = ["cancelled", "refunded", "returned"];

// ─── Builder sections ─────────────────────────────────────────────────────────

export const GAME_SECTION_KINDS = ["spin-wheel", "scratch-card", "reward-progress", "loyalty-banner"] as const;
export type GameSectionKind = (typeof GAME_SECTION_KINDS)[number];

export function isGameSectionKind(kind: string): kind is GameSectionKind {
  return (GAME_SECTION_KINDS as readonly string[]).includes(kind);
}

/** Starter content for a new game section (both renderers). */
export function gameSectionDefaults(kind: GameSectionKind): { name: string; copy: Record<string, unknown>; settings: Record<string, unknown> } {
  switch (kind) {
    case "spin-wheel":
      return { name: "Spin the wheel", copy: { title: "", body: "", buttonLabel: "Spin the wheel" }, settings: { display: "popup", trigger: "delay", delaySeconds: 8, scrollPercent: 50 } };
    case "scratch-card":
      return { name: "Scratch card", copy: { title: "", body: "", buttonLabel: "Scratch to reveal" }, settings: { display: "inline", trigger: "scroll", delaySeconds: 8, scrollPercent: 50 } };
    case "reward-progress":
      return { name: "Reward progress", copy: { title: "" }, settings: {} };
    default:
      return { name: "Loyalty points", copy: { title: "Earn points every time you shop", body: "" }, settings: {} };
  }
}

/** A game section's display settings, with the pop-up trigger from the section (falls back to the rewards page). */
export function readSectionDisplay(settings: unknown, fallback: PopupGameSettings, defaultDisplay: "popup" | "inline" = "popup") {
  const s = record(settings);
  return {
    display: s.display === "inline" || s.display === "popup" ? (s.display as "popup" | "inline") : defaultDisplay,
    trigger: oneOf(s.trigger, TRIGGERS, fallback.trigger),
    delaySeconds: Math.round(num(s.delaySeconds, fallback.delaySeconds, 1, 120)),
    scrollPercent: Math.round(num(s.scrollPercent, fallback.scrollPercent, 5, 100)),
  };
}
