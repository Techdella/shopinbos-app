// Tiered verification for delivery partners (spec: "Logistics Partner Verification"). Pure, no imports, shared by
// the server, the partner pages, the admin panel and the seller's partner cards; unit-tested in
// tests/partner-tiers.test.mjs.
//
// Partners don't need CAC to start. Two tiers:
//   Tier 1  Verified Individual  ID (NIN + selfie), phone, email, bank or BVN, address, coverage, delivery methods,
//                                at least one approved vehicle and a confirmed guarantor. Works with order limits.
//   Tier 2  Registered Business  Tier 1 plus CAC (business name, BN/RC type, number, certificate). No limits.
// Optional badges on top: Licensed Courier (NIPOST licence) and Verified Payout (business bank account in the
// registered name). Shopinbos never requires a NIPOST licence.
//
// How it sits on the older fields: LogisticsPartner.verificationStatus "verified" still means "can take jobs" (every
// job route checks it), so a partner reaches it at Tier 1. verificationTier says how far they got. The spec's
// overall statuses (unverified | pending_review | tier1_verified | tier2_verified | rejected | suspended) are read
// from both by partnerVerificationState.

// ─── Statuses ─────────────────────────────────────────────────────────────────

export const PARTNER_TIERS = ["none", "tier1", "tier2"] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

export const PARTNER_STATES = ["unverified", "pending_review", "tier1_verified", "tier2_verified", "rejected", "suspended"] as const;
export type PartnerState = (typeof PARTNER_STATES)[number];

/** Each check or document: pending | approved | rejected (+ reason). "missing" is only ever shown, never stored. */
export const CHECK_STATUSES = ["pending", "approved", "rejected"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type ItemState = CheckStatus | "missing";

export function isPartnerTier(value: unknown): value is PartnerTier {
  return typeof value === "string" && (PARTNER_TIERS as readonly string[]).includes(value);
}

export function isCheckStatus(value: unknown): value is CheckStatus {
  return typeof value === "string" && (CHECK_STATUSES as readonly string[]).includes(value);
}

/** The spec's overall status, from the stored fields. */
export function partnerVerificationState(partner: { verificationStatus: string; verificationTier?: string | null; kycSubmittedAt?: Date | string | null }): PartnerState {
  if (partner.verificationStatus === "suspended") return "suspended";
  if (partner.verificationStatus === "rejected") return "rejected";
  if (partner.verificationStatus === "verified") return partner.verificationTier === "tier2" ? "tier2_verified" : "tier1_verified";
  return partner.kycSubmittedAt ? "pending_review" : "unverified";
}

// ─── What partners fill in ───────────────────────────────────────────────────

export const DELIVERY_METHODS = ["bike", "car", "van", "tricycle", "other"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export function isDeliveryMethod(value: unknown): value is DeliveryMethod {
  return typeof value === "string" && (DELIVERY_METHODS as readonly string[]).includes(value);
}

export const GUARANTOR_STATUSES = ["pending", "confirmed", "declined"] as const;
export type GuarantorStatus = (typeof GUARANTOR_STATUSES)[number];

export const CAC_TYPES = ["BN", "RC"] as const;
export type CacType = (typeof CAC_TYPES)[number];

/** The version of the partner terms (src/app/logistics/terms). Raise it when the wording changes; partners accept again. */
export const PARTNER_TERMS_VERSION = "2026-12";

/**
 * Tier 1 checks that aren't a file (LogisticsPartner.identityChecks). Never holds a full NIN, BVN or account number:
 * only the last 4 digits and a keyed hash (to spot one ID on several accounts).
 */
export interface IdentityChecks {
  /** First and last name as typed; must match the NIN record. */
  fullName?: string;
  phone?: { value: string; status: CheckStatus; verifiedAt?: string };
  email?: { value: string; status: CheckStatus; verifiedAt?: string };
  nin?: {
    last4: string;
    hash: string;
    status: CheckStatus;
    /** Name on the NIN record (from the KYC provider). */
    nameOnRecord?: string;
    provider?: string;
    reference?: string;
    checkedAt: string;
    rejectionReason?: string;
  };
  /** BVN check, or a bank account whose name must match the NIN name. */
  payout?: {
    method: "bvn" | "bank";
    last4: string;
    /** Keyed hash of a BVN (so one BVN can't verify two partners). */
    hash?: string;
    status: CheckStatus;
    bankName?: string;
    accountName?: string;
    nameMatched: boolean;
    checkedAt: string;
    rejectionReason?: string;
  };
  /** Self-declared; a utility bill (the "utility" document) is optional. */
  address?: { value: string; state?: string };
}

export function readIdentityChecks(value: unknown): IdentityChecks {
  const v = record(value);
  const out: IdentityChecks = {};
  if (text(v.fullName)) out.fullName = text(v.fullName).slice(0, 120);
  for (const key of ["phone", "email"] as const) {
    const row = record(v[key]);
    if (text(row.value) && isCheckStatus(row.status)) out[key] = { value: text(row.value), status: row.status, ...(text(row.verifiedAt) ? { verifiedAt: text(row.verifiedAt) } : {}) };
  }
  const nin = record(v.nin);
  if (text(nin.last4) && isCheckStatus(nin.status)) {
    out.nin = {
      last4: text(nin.last4).slice(-4),
      hash: text(nin.hash),
      status: nin.status,
      checkedAt: text(nin.checkedAt),
      ...(text(nin.nameOnRecord) ? { nameOnRecord: text(nin.nameOnRecord) } : {}),
      ...(text(nin.provider) ? { provider: text(nin.provider) } : {}),
      ...(text(nin.reference) ? { reference: text(nin.reference) } : {}),
      ...(text(nin.rejectionReason) ? { rejectionReason: text(nin.rejectionReason) } : {}),
    };
  }
  const payout = record(v.payout);
  if ((payout.method === "bvn" || payout.method === "bank") && isCheckStatus(payout.status)) {
    out.payout = {
      method: payout.method,
      last4: text(payout.last4).slice(-4),
      status: payout.status,
      nameMatched: payout.nameMatched === true,
      checkedAt: text(payout.checkedAt),
      ...(text(payout.hash) ? { hash: text(payout.hash) } : {}),
      ...(text(payout.bankName) ? { bankName: text(payout.bankName) } : {}),
      ...(text(payout.accountName) ? { accountName: text(payout.accountName) } : {}),
      ...(text(payout.rejectionReason) ? { rejectionReason: text(payout.rejectionReason) } : {}),
    };
  }
  const address = record(v.address);
  if (text(address.value)) out.address = { value: text(address.value).slice(0, 300), ...(text(address.state) ? { state: text(address.state) } : {}) };
  return out;
}

// ─── Names ───────────────────────────────────────────────────────────────────

function nameTokens(name: string) {
  return String(name ?? "")
    .toUpperCase()
    .replace(/[^A-Z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length > 1);
}

/**
 * Does a bank account (or CAC) name belong to this person? Order doesn't matter and middle names may be missing:
 * both of the person's first and last names must appear ("ADEBAYO OLUWASEUN JOHN" matches "John Adebayo"). With
 * one name on either side, that name must appear.
 */
export function namesMatch(personName: string, otherName: string): boolean {
  const person = nameTokens(personName);
  const other = new Set(nameTokens(otherName));
  if (!person.length || !other.size) return false;
  const first = person[0];
  const last = person[person.length - 1];
  return other.has(first) && other.has(last);
}

/** A business account name is in the registered business name (words like LTD, LIMITED, ENTERPRISES don't count). */
export function businessNamesMatch(registeredName: string, accountName: string): boolean {
  const noise = new Set(["LTD", "LIMITED", "ENTERPRISE", "ENTERPRISES", "VENTURES", "NIG", "NIGERIA", "COMPANY", "CO", "AND", "THE", "SERVICES", "GLOBAL", "INT", "INTERNATIONAL"]);
  const want = nameTokens(registeredName).filter((token) => !noise.has(token));
  const have = new Set(nameTokens(accountName));
  return want.length > 0 && want.every((token) => have.has(token));
}

// ─── Checklists ──────────────────────────────────────────────────────────────

/** Everything the tier rules read about one partner. The server builds it (src/lib/logistics/partner-tiers.server.ts). */
export interface TierSnapshot {
  verificationStatus: string;
  verificationTier: string;
  termsVersion: string | null;
  identity: IdentityChecks;
  deliveryAreas: string[];
  deliveryMethods: string[];
  /** Verification documents by type (latest status; only those with a file or registry match). */
  docs: Partial<Record<string, CheckStatus>>;
  /** The CAC registry confirmed the business (counts as the certificate). */
  cacRegistryVerified: boolean;
  vehicles: Array<{ status: string }>;
  guarantor: { status: string } | null;
  registeredName: string | null;
  cacType: string | null;
  cacNumber: string | null;
  /** The payout bank account Shopinbos pays into (LogisticsPayoutAccount). */
  payoutAccount: { verified: boolean; accountName: string } | null;
}

export const TIER1_ITEMS = ["terms", "fullName", "phone", "email", "nin", "selfie", "payout", "address", "coverage", "methods", "vehicles", "guarantor"] as const;
export const TIER2_ITEMS = ["businessName", "cacType", "cacNumber", "cacCertificate"] as const;
export type Tier1Item = (typeof TIER1_ITEMS)[number];
export type Tier2Item = (typeof TIER2_ITEMS)[number];
export type ChecklistItem = Tier1Item | Tier2Item;

/** English names for each item (admin screens and reminder emails; partner screens translate in "partnerKyc"). */
export const ITEM_LABELS: Record<ChecklistItem, string> = {
  terms: "Partner terms",
  fullName: "Full name",
  phone: "Phone number",
  email: "Email",
  nin: "NIN",
  selfie: "Selfie",
  payout: "BVN or bank account",
  address: "Address",
  coverage: "Coverage areas",
  methods: "Delivery methods",
  vehicles: "A vehicle",
  guarantor: "Guarantor",
  businessName: "Business name",
  cacType: "CAC registration type",
  cacNumber: "CAC number",
  cacCertificate: "CAC certificate",
};

/** Onboarding steps (spec: Identity → Bank → Vehicles → Coverage → Guarantor → (Optional) CAC → Review & submit). */
export const ONBOARDING_STEPS = ["identity", "bank", "vehicles", "coverage", "guarantor", "cac", "review"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Which step each item is filled in on. */
export const ITEM_STEP: Record<ChecklistItem, OnboardingStep> = {
  terms: "review",
  fullName: "identity",
  phone: "identity",
  email: "identity",
  nin: "identity",
  selfie: "identity",
  address: "identity",
  payout: "bank",
  vehicles: "vehicles",
  coverage: "coverage",
  methods: "coverage",
  guarantor: "guarantor",
  businessName: "cac",
  cacType: "cac",
  cacNumber: "cac",
  cacCertificate: "cac",
};

const filled = (ok: boolean): ItemState => (ok ? "approved" : "missing");

function docState(status: CheckStatus | undefined): ItemState {
  return status ?? "missing";
}

/** Vehicles: approved once one is approved; else pending while one waits; rejected when all were rejected. */
export function vehiclesState(vehicles: Array<{ status: string }>): ItemState {
  if (!vehicles.length) return "missing";
  if (vehicles.some((vehicle) => vehicle.status === "approved")) return "approved";
  if (vehicles.some((vehicle) => vehicle.status === "pending")) return "pending";
  return "rejected";
}

export function guarantorState(guarantor: { status: string } | null): ItemState {
  if (!guarantor) return "missing";
  return guarantor.status === "confirmed" ? "approved" : guarantor.status === "declined" ? "rejected" : "pending";
}

export function tier1Checklist(s: TierSnapshot): Record<Tier1Item, ItemState> {
  return {
    terms: filled(s.termsVersion === PARTNER_TERMS_VERSION),
    fullName: filled(Boolean(s.identity.fullName)),
    phone: s.identity.phone?.status ?? "missing",
    email: s.identity.email?.status ?? "missing",
    nin: s.identity.nin?.status ?? "missing",
    selfie: docState(s.docs.selfie),
    payout: s.identity.payout?.status ?? "missing",
    address: filled(Boolean(s.identity.address?.value)),
    coverage: filled(s.deliveryAreas.length > 0),
    methods: filled(s.deliveryMethods.length > 0),
    vehicles: vehiclesState(s.vehicles),
    guarantor: guarantorState(s.guarantor),
  };
}

export function tier2Checklist(s: TierSnapshot): Record<Tier2Item, ItemState> {
  return {
    businessName: filled(Boolean(s.registeredName?.trim())),
    cacType: filled(s.cacType === "BN" || s.cacType === "RC"),
    cacNumber: filled(Boolean(s.cacNumber?.trim())),
    cacCertificate: s.cacRegistryVerified ? "approved" : docState(s.docs.cac),
  };
}

const allApproved = (items: Record<string, ItemState>) => Object.values(items).every((state) => state === "approved");

/** Nothing is missing or rejected: everything is in (some may still wait for checks). */
export function readyToSubmit(items: Record<string, ItemState>) {
  return Object.values(items).every((state) => state === "approved" || state === "pending");
}

export function itemsWhere(items: Record<string, ItemState>, states: ItemState[]): string[] {
  return Object.entries(items).filter(([, state]) => states.includes(state)).map(([key]) => key);
}

/** The tier the checks earn (ignoring what's stored). */
export function earnedTier(s: TierSnapshot): PartnerTier {
  if (!allApproved(tier1Checklist(s))) return "none";
  return allApproved(tier2Checklist(s)) ? "tier2" : "tier1";
}

const TIER_RANK: Record<PartnerTier, number> = { none: 0, tier1: 1, tier2: 2 };

/**
 * The tier to store. Never lowered for a verified partner (partners verified before tiers existed had CAC and were
 * moved to Tier 2 by the migration, without these checks); the team suspends a partner instead.
 */
export function nextTier(s: TierSnapshot): PartnerTier {
  const earned = earnedTier(s);
  const stored = isPartnerTier(s.verificationTier) ? s.verificationTier : "none";
  if (s.verificationStatus === "verified" && TIER_RANK[stored] > TIER_RANK[earned]) return stored;
  return earned;
}

/**
 * The verificationStatus to store: a partner who sent everything and whose Tier 1 checks are all approved becomes
 * "verified" (can take jobs). Suspended and rejected partners are never moved here (the team reinstates; a rejected
 * partner resubmits, which sets "pending").
 */
export function nextVerificationStatus(s: TierSnapshot, submitted: boolean): string {
  if (s.verificationStatus === "verified" || s.verificationStatus === "suspended" || s.verificationStatus === "rejected") return s.verificationStatus;
  return submitted && nextTier(s) !== "none" ? "verified" : s.verificationStatus;
}

// ─── Badges ──────────────────────────────────────────────────────────────────

export const PARTNER_BADGES = ["verified_individual", "registered_business", "licensed_courier", "verified_payout"] as const;
export type PartnerBadge = (typeof PARTNER_BADGES)[number];

export function isPartnerBadge(value: unknown): value is PartnerBadge {
  return typeof value === "string" && (PARTNER_BADGES as readonly string[]).includes(value);
}

export const BADGE_LABELS: Record<PartnerBadge, string> = {
  verified_individual: "Verified Individual",
  registered_business: "Registered Business",
  licensed_courier: "Licensed Courier",
  verified_payout: "Verified Payout",
};

/** Badges sellers see (LogisticsPartner.badges). Only verified partners have any. */
export function partnerBadges(s: TierSnapshot, tier: PartnerTier = nextTier(s)): PartnerBadge[] {
  if (tier === "none") return [];
  const badges: PartnerBadge[] = [tier === "tier2" ? "registered_business" : "verified_individual"];
  if (s.docs["courier-licence"] === "approved") badges.push("licensed_courier");
  const businessName = s.registeredName?.trim();
  if (tier === "tier2" && businessName && s.payoutAccount?.verified && businessNamesMatch(businessName, s.payoutAccount.accountName)) badges.push("verified_payout");
  return badges;
}

// ─── Limits and graduation ───────────────────────────────────────────────────

/** Admin › Logistics partners › Tier rules (PlatformSetting "logistics.tier_rules"). */
export interface TierRules {
  /** Tier 1: the most a single delivery's order may be worth, in naira. */
  maxOrderValue: number;
  /** Tier 1: jobs open at once (offered, accepted or on the road). */
  maxActiveOrders: number;
  /** Tier 1 limits lift for good once all three are met. */
  graduation: { minDeliveries: number; minRating: number; maxDisputeRate: number };
}

export const TIER_RULES_KEY = "logistics.tier_rules";

export const DEFAULT_TIER_RULES: TierRules = {
  maxOrderValue: 50_000,
  maxActiveOrders: 5,
  graduation: { minDeliveries: 20, minRating: 4.0, maxDisputeRate: 5 },
};

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[₦,%\s]/g, ""));
  return Number.isFinite(n) && String(value ?? "").trim() !== "" ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Saved rules, with defaults for anything missing or out of range. */
export function readTierRules(value: unknown): TierRules {
  const v = record(value);
  const g = record(v.graduation);
  const d = DEFAULT_TIER_RULES;
  return {
    maxOrderValue: Math.round(bounded(v.maxOrderValue, d.maxOrderValue, 1_000, 100_000_000)),
    maxActiveOrders: Math.round(bounded(v.maxActiveOrders, d.maxActiveOrders, 1, 10_000)),
    graduation: {
      minDeliveries: Math.round(bounded(g.minDeliveries, d.graduation.minDeliveries, 0, 100_000)),
      minRating: Math.round(bounded(g.minRating, d.graduation.minRating, 0, 5) * 10) / 10,
      maxDisputeRate: Math.round(bounded(g.maxDisputeRate, d.graduation.maxDisputeRate, 0, 100) * 10) / 10,
    },
  };
}

/** Job statuses that count against the Tier 1 "active orders" limit. */
export const ACTIVE_JOB_STATUSES = ["pending", "confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point"] as const;

export interface PartnerRecord {
  /** Delivered jobs. */
  completed: number;
  /** Failed jobs plus delivery problems customers or shops reported against the partner. */
  disputes: number;
  rating: number;
  ratingCount: number;
}

/** Failed or disputed share of finished jobs, as a percentage (0 with no jobs yet). */
export function disputeRate(record: PartnerRecord) {
  const finished = record.completed + record.disputes;
  return finished > 0 ? Math.round((record.disputes / finished) * 1000) / 10 : 0;
}

export interface GraduationProgress {
  met: boolean;
  deliveries: { have: number; need: number; met: boolean };
  /** No rating yet counts as not met. */
  rating: { have: number; need: number; met: boolean };
  disputeRate: { have: number; max: number; met: boolean };
}

export function graduationProgress(record: PartnerRecord, rules: TierRules): GraduationProgress {
  const g = rules.graduation;
  const rate = disputeRate(record);
  const deliveries = { have: record.completed, need: g.minDeliveries, met: record.completed >= g.minDeliveries };
  const rating = { have: Math.round(record.rating * 10) / 10, need: g.minRating, met: (record.ratingCount > 0 || g.minRating === 0) && record.rating >= g.minRating };
  const disputes = { have: rate, max: g.maxDisputeRate, met: rate <= g.maxDisputeRate };
  return { met: deliveries.met && rating.met && disputes.met, deliveries, rating, disputeRate: disputes };
}

/** Tier 1 partners work with limits until they graduate; Tier 2 (and legacy verified) partners have none. */
export function limitsApply(partner: { verificationTier: string; limitsLiftedAt?: Date | string | null }) {
  return partner.verificationTier === "tier1" && !partner.limitsLiftedAt;
}

export type LimitProblem = { kind: "order_value"; max: number } | { kind: "active_orders"; max: number };

/** Can this Tier 1 partner take one more job worth `orderValue`? null when it can. */
export function jobLimitProblem(input: { orderValue: number; activeJobs: number }, rules: TierRules): LimitProblem | null {
  if (input.orderValue > rules.maxOrderValue) return { kind: "order_value", max: rules.maxOrderValue };
  if (input.activeJobs >= rules.maxActiveOrders) return { kind: "active_orders", max: rules.maxActiveOrders };
  return null;
}

export function limitProblemMessage(problem: LimitProblem) {
  return problem.kind === "order_value"
    ? `This delivery partner can take orders up to ₦${problem.max.toLocaleString("en-NG")} for now. Pick another delivery partner for this one.`
    : "This delivery partner has as many jobs as it can take right now. Pick another delivery partner.";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
