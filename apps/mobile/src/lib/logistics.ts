import type { VerificationDoc } from "@shared/verification-docs";
import type { TakingBlock } from "@shared/taking-jobs";
import { api, apiBody } from "./api";

// The delivery partner (dispatch) side of the app: /api/mobile/logistics/** on the web backend, made for the app
// with the same job rules as the web dispatch console, plus /api/logistics/me (the portal's own API).

export interface Job {
  id: string;
  ref: string;
  status: string;
  from: string;
  to: string;
  item: string;
  fragile: boolean;
  /** A high-value parcel (phones, laptops, gold, or a big order): only Top partners get these. Newer servers. */
  highValue?: boolean;
  fee: number;
  deliveryFee: number;
  currency: string;
  collect: number;
  codCollected: number | null;
  codMethod: string | null;
  shop: string;
  sellerUserId: string;
  rider: { id: string; name: string } | null;
  trackingCode: string | null;
  estimatedDelivery: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedReason: string | null;
  proofUrl: string | null;
  notes: string | null;
  createdAt: string;
  /** Pickup coordinates, used to put the closest rider first. */
  pickupGeo?: { lat: number; lng: number } | null;
  /** Supplier pickups: "Pick up 12–4pm today". */
  pickupWindow?: string | null;
  buyer: { name: string; phone: string | null; address: string } | null;
}

export interface DispatchRider {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  /** Jobs the rider is carrying now. The server sends riders best first: free and out, then busy, then offline. */
  openJobs?: number;
  /** Latest location from the Riders app (rounded), when the rider shares it. */
  lat?: number | null;
  lng?: number | null;
  locationAt?: string | null;
  /** "last seen 2 min ago, Ikeja" */
  where?: string;
  /** Online in the Riders app and seen in the last 30 minutes. */
  out?: boolean;
}

/** Late pay-in card: "₦X overdue since yesterday 6pm." + "You're paused from cash-on-delivery jobs until you pay in." */
export interface PayInOverdue {
  amount: number;
  since: string;
  paused: boolean;
  title: string;
  body: string;
  account: { accountNumber: string; bankName: string; accountName: string } | null;
}

export interface LogisticsOverview {
  /** takingBlock: why "Taking new jobs" can't go on yet (shared/taking-jobs.ts); missing from older servers. */
  partner: { name: string; city: string; areas: string; logoUrl: string | null; verificationStatus: string; onboarded: boolean; taking: boolean; takingBlock?: TakingBlock | null };
  firstName: string;
  deliveredToday: number;
  earnedToday: number;
  /** "Earned this week · paid on Thursday" (Monday to now, Lagos; weekday 0 = Sunday). Newer servers. */
  week?: { amount: number; jobs: number; payoutDay: { date: string; weekday: number } };
  counts: { new: number; quotes: number; active: number; issues: number };
  newJobs: Job[];
  riders: { total: number; out: number; offline: number };
  riderList: DispatchRider[];
  cashToPayIn: number;
  /** "by 6pm today", "by 6pm tomorrow", or "now" when it's late. */
  payInBy?: string;
  /** Set while a pay-in is late (paused from cash-on-delivery jobs). */
  overdue?: PayInOverdue | null;
  onTime: number | null;
  onTimeJobs: number;
}

export type JobView = "new" | "active" | "done" | "issues";

export const fetchLogisticsOverview = () => api<LogisticsOverview>("/api/mobile/logistics/overview");

export const fetchJobs = (view: JobView) =>
  api<{ view: JobView; jobs: Job[]; counts: Record<JobView, number>; riders: DispatchRider[] }>(`/api/mobile/logistics/jobs?view=${view}`);

export const fetchJob = (id: string) => api<{ job: Job; riders: DispatchRider[] }>(`/api/mobile/logistics/jobs/${encodeURIComponent(id)}`);

export type JobAction =
  | { action: "accept"; riderId?: string | null }
  | { action: "decline"; reason?: string | null }
  | { action: "cash_paid" }
  | { action: "assign"; riderId: string | null }
  | { action: "status"; to: "confirmed" | "picked_up" | "in_transit" | "out_for_delivery" | "at_pickup_point" | "delivered" | "failed" | "returning" | "returned"; code?: string | null; recipientName?: string | null; codCollected?: number | null; codMethod?: "cash" | "transfer" | null; failedReason?: string | null };

export const moveJob = (id: string, body: JobAction) => api<{ job: Job | null }>(`/api/mobile/logistics/jobs/${encodeURIComponent(id)}`, { method: "POST", json: body });

export function uploadJobProof(id: string, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `proof.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  return api<{ proofUrl: string }>(`/api/mobile/logistics/jobs/${encodeURIComponent(id)}/proof`, { method: "POST", body: form });
}

export interface RiderRow {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  out: boolean;
  lastSeenAt: string | null;
  hasAppLink: boolean;
  /** The bike's number plate, when the partner added one. */
  plate?: string | null;
  openJobs: number;
  deliveredToday: number;
  earnedToday: number;
  /** "last seen 2 min ago, Ikeja" when the rider shares their location. */
  where?: string;
}

export const fetchRiders = () => api<{ riders: RiderRow[] }>("/api/mobile/logistics/riders");

/** Add a rider: name, WhatsApp number and the bike or van plate (servers that don't keep plates ignore it). Returns
 * their Riders app link and a ready WhatsApp invite. */
export const addRider = (input: { name: string; whatsapp: string; plate?: string }) =>
  api<{ id: string; name: string; url: string; whatsapp: string; inviteUrl: string }>("/api/mobile/logistics/riders", { method: "POST", json: input });

/** The "Taking new jobs" switch. */
export const setTakingJobs = (taking: boolean) => api<{ taking: boolean }>("/api/mobile/logistics/taking", { method: "POST", json: { taking } });

export type PayInAccount =
  | { state: "ready"; accountNumber: string; accountName: string; bankName: string }
  | { state: "setting_up" }
  | { state: "manual" };

export interface Earnings {
  today: { amount: number; jobs: number };
  week: { amount: number; jobs: number };
  month: { amount: number; jobs: number };
  /** Cash still to pay in, after any credit from earlier pay-ins. */
  cashToPayIn: number;
  /** Paid in beyond the jobs it could settle; used by the next pay-in. */
  credit?: number;
  /** "by 6pm today", "by 6pm tomorrow", or "now" when it's late. */
  payInBy?: string;
  late?: boolean;
  /** The company's own pay-in account; "manual" when it isn't available (pay in the old way, tell us on the web). */
  payIn?: PayInAccount;
  /** Set while a pay-in is late (paused from cash-on-delivery jobs). */
  overdue?: PayInOverdue | null;
  remittances: Array<{ id: string; amount: number; method: string; reference: string | null; createdAt: string; status?: string }>;
  recent: Array<{ id: string; ref: string; from: string; to: string; rider: string | null; deliveredAt: string | null; amount: number }>;
  bank: { bankName: string; account: string; accountName: string; ready: boolean } | null;
}

export const fetchEarnings = () => api<Earnings>("/api/mobile/logistics/earnings");

/** "I've paid. Check again": looks for the transfer now and lifts the pause when it's paid in. */
export const checkPayInsAgain = () =>
  api<{ cleared: boolean; matched: number; owed: number; overdue: number; paused: boolean; message: string }>("/api/mobile/logistics/payins/check", { method: "POST", json: {} });

export interface LogisticsMe {
  partner: { displayName: string; companyName: string; verificationStatus: string; verificationDocuments: VerificationDoc[]; trustScore: number; city?: string | null; logoUrl?: string | null };
  user: { name: string; email: string | null } | null;
}

export const fetchLogisticsMe = () => api<LogisticsMe>("/api/logistics/me");

// ─── Logistics marketplace (Business tab and set-up): /api/mobile/logistics/market/** ────────────────────────────

export type RateService = "doorstep" | "pickup_point" | "same_day";
export type SizeBand = "small" | "medium" | "bulky";

export interface MarketRateRow {
  id: string;
  from: string;
  to: string;
  service: RateService;
  sizeBand: SizeBand;
  price: number;
  minDays: number;
  maxDays: number;
}

export interface MarketRateCard {
  id: string;
  rows: MarketRateRow[];
  failedAttemptFee: number;
  returnFee: number;
  notes: string | null;
  createdAt: string;
}

export interface PickupPoint {
  id: string;
  name: string;
  address: string;
  state: string;
  area: string | null;
  hours: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

export interface MarketConnectionRow {
  id: string;
  ownerUserId: string;
  ownerRole: string;
  businessName: string;
  ownerPod: boolean;
  partnerPod: boolean;
  createdAt: string;
  privateCards?: unknown;
}

export interface MarketData {
  partner: {
    id: string;
    slug: string;
    name: string;
    companyName: string | null;
    cacNumber: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    address: string | null;
    verificationStatus: string;
    rating: number;
    ratingCount: number;
    services: string[];
    pickupAreas: string[];
    deliveryAreas: string[];
    offersPayOnDelivery: boolean;
    /** Track record level: verified | trusted | cash_trusted (newer servers). */
    level?: string;
    /** Pay on delivery can be switched on: Cash trusted and not paused for late cash (newer servers). */
    podOpen?: boolean;
  };
  rateCard: MarketRateCard | null;
  pickupPoints: PickupPoint[];
  connections: MarketConnectionRow[];
  /** In-app stats; the rates are null with too few deliveries to say. */
  stats: { completed: number; onTimeRate: number | null; failedRate: number | null } | null;
}

export const fetchMarket = () => api<MarketData>("/api/mobile/logistics/market");

/** "Pay on delivery jobs" (A-Rider-POD): the level, the goals to Cash trusted, the cash cap and the rules. */
export interface PartnerLevelView {
  level: "verified" | "trusted" | "cash_trusted";
  next: "verified" | "trusted" | "cash_trusted" | null;
  goals: Array<{ key: string; label: string; have: number; need: number; done: boolean; kind: "count" | "check" }>;
  /** Naira the partner may hold at once. */
  cashCap: number;
  podOpen: boolean;
  podOn: boolean;
  codPaused: boolean;
  lockedMessage: string;
  /** tier and unlocks: newer servers (reach tiers). */
  levels: Array<{ key: string; label: string; tier?: number; unlocks?: string[] }>;
  remitHours: number;
  // Reach tiers (shared/partner-reach.ts), newer servers: Tier 1 Verified → Tier 2 Trusted → Tier 3 Top partner.
  tier?: 1 | 2 | 3;
  perks?: { prepaid: boolean; payOnDelivery: boolean; interstate: boolean; rankBoost: number; highValue: boolean; canApplyFeatured: boolean; fasterPayouts: boolean };
  featuredStatus?: "none" | "applied" | "featured" | "rejected";
  featuredNow?: boolean;
  featuredNote?: string | null;
  /** Offers interstate below Trusted: the switch stays, interstate jobs don't come yet. */
  interstateGated?: boolean;
  fasterPayoutsLive?: boolean;
}

export const fetchPartnerLevel = () => api<PartnerLevelView>("/api/mobile/logistics/level");

/** "Apply to be featured" (Top partners). Errors carry the reason (not a Top partner yet, already applied). */
export const applyToBeFeatured = () => api<{ status: string }>("/api/mobile/logistics/level/featured", { method: "POST", json: {} });

export interface RateCardBody {
  rows: Array<Omit<MarketRateRow, "id"> & { id?: string }>;
  failedAttemptFee: number;
  returnFee: number;
  notes: string;
}

export const saveCoverage = (input: { services: string[]; pickupAreas: string[]; deliveryAreas: string[]; offersPayOnDelivery: boolean }) =>
  api<{ saved: true; unknown: string[] }>("/api/mobile/logistics/market", { method: "PUT", json: { section: "coverage", ...input } });

export const saveBusiness = (input: { companyName: string; cacNumber: string; contactName: string; contactPhone: string; contactEmail: string; address: string }) =>
  api<{ saved: true }>("/api/mobile/logistics/market", { method: "PUT", json: { section: "business", ...input } });

/** Publishes a new public rate card (new prices apply to new orders only). */
export const saveRateCard = (input: RateCardBody) => api<{ saved: true }>("/api/mobile/logistics/market", { method: "PUT", json: { section: "rates", ...input } });

export type PickupPointInput = { name: string; address: string; state: string; area: string; hours: string; phone: string; lat?: number | null; lng?: number | null };

export const addPickupPoint = (input: PickupPointInput) => api<{ saved: true }>("/api/mobile/logistics/market/pickup-points", { method: "POST", json: input });
export const editPickupPoint = (id: string, input: PickupPointInput) =>
  api<{ saved: true }>(`/api/mobile/logistics/market/pickup-points/${encodeURIComponent(id)}`, { method: "PATCH", json: input });
export const removePickupPoint = (id: string) => api<{ removed: true }>(`/api/mobile/logistics/market/pickup-points/${encodeURIComponent(id)}`, { method: "DELETE" });

/** "Send them a private rate": only that business sees it; it replaces the public price for them once they accept. */
export const sendPrivateRate = (input: RateCardBody & { ownerUserId: string }) =>
  api<{ sent: true }>("/api/mobile/logistics/market/private-rates", { method: "POST", json: input });

/** The partner's side of pay on delivery for one connected business (it shows at checkout when both sides say yes). */
export const setConnectionPod = (id: string, pod: boolean) =>
  api<{ pod: boolean }>(`/api/mobile/logistics/market/connections/${encodeURIComponent(id)}`, { method: "PATCH", json: { pod } });
export const endMarketConnection = (id: string) => api<{ ended: true }>(`/api/mobile/logistics/market/connections/${encodeURIComponent(id)}`, { method: "DELETE" });

// ─── Set-up: the portal's own onboarding and verification routes ─────────────────────────────────────────────────

export interface LogisticsOnboarding {
  displayName: string | null;
  companyName: string | null;
  city: string | null;
  coverageZones: string[];
  vehicleTypes: string[];
  deliveryTypes: string[];
  basePrice: number;
  verificationStatus: string;
}

export const fetchOnboarding = () => api<LogisticsOnboarding>("/api/logistics/onboarding");

/** Marks set-up done (the same call as the web set-up), so coverage, rates and pickup points can be saved. */
export const finishOnboarding = (input: { displayName?: string; coverageZones: string[]; vehicleTypes: string[]; deliveryTypes: string[]; basePrice: number }) =>
  api<unknown>("/api/logistics/onboarding", { method: "PATCH", json: { ...input, pricingModel: "fixed", completed: true } });

/** Upload one verification document (a photo) for the company, with the existing document types. */
export async function uploadVerificationDoc(docType: string, file: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = file.mimeType ?? "image/jpeg";
  const ext = type === "application/pdf" ? "pdf" : type.split("/")[1] === "jpeg" ? "jpg" : (type.split("/")[1] ?? "jpg");
  form.append("docType", docType);
  form.append("file", { uri: file.uri, name: file.fileName ?? `${docType}.${ext}`, type } as unknown as Blob);
  const result = await apiBody<{ success?: boolean; error?: string }>("/api/logistics/verification/upload", { method: "POST", body: form });
  if (result.success === false) throw new Error(result.error || "");
  return result;
}

/** Send the uploaded documents to the Shopinbos team to check. */
export async function submitVerification() {
  const result = await apiBody<{ success?: boolean; error?: string }>("/api/logistics/verification/submit", { method: "POST", json: {} });
  if (result.success === false) throw new Error(result.error || "");
  return result;
}

/** Take a rider off the team (their Riders app link stops working) or bring them back (PATCH …/riders/[id]). */
export const setRiderActive = (id: string, active: boolean) =>
  api<{ id: string; active: boolean }>(`/api/mobile/logistics/riders/${encodeURIComponent(id)}`, { method: "PATCH", json: { active } });

/** A shop's request for a delivery price (GET /api/mobile/logistics/quotes). */
export interface PriceRequest {
  id: string;
  from: string;
  to: string;
  status: string;
  price: number | null;
  note: string | null;
  wantedOn: string | null;
  replyBy: string | null;
  createdAt: string;
  shop: string;
  city: string | null;
  parcel: string;
  declaredValue: number | null;
}

export const fetchPriceRequests = () => api<{ waiting: PriceRequest[]; answered: PriceRequest[]; basePrice: number | null }>("/api/mobile/logistics/quotes");

/** Send a price for a request, or say no to it. */
export const answerPriceRequest = (id: string, body: { intent: "respond"; price: number; note?: string } | { intent: "decline"; note?: string }) =>
  api<{ id: string; status: string }>(`/api/mobile/logistics/quotes/${encodeURIComponent(id)}`, { method: "POST", json: body });
