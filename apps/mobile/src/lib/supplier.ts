import type { VerificationDoc } from "@shared/verification-docs";
import type { PickupSlot } from "@shared/supplier-pickup";
import type { ContractDocument } from "@shared/contracts";
import { api, apiBody } from "./api";
import type { PreorderBody } from "./preorder-pure";
import type { BrandingChoice, BrandingOffer, LevelGoal, RateSource, SupplierLevel, SupplierPerks, ZoneRates } from "@shared/dropship-rules";

// The supplier side of the app. Reads and writes go to the same backend as the web supplier portal:
//   /api/mobile/supplier/overview · orders · orders/[id] · quotes/[id] · products/[id] · upload  (made for the app)
//   /api/supplier/products (list, create) · /api/supplier/quote-requests (list) · /api/supplier/me  (the portal's own API)

export interface SupplierOverview {
  supplier: { name: string; city: string; logoUrl: string | null; verificationStatus: string; onboarded: boolean; documents: number; rating: number; ratingCount: number };
  firstName: string;
  counts: { toPack: number; wholesale: number; quotes: number; lowStock: number; products: number };
  toPack: DropshipOrder[];
  wholesale: WholesaleOrder[];
  quotes: Array<{ id: string; quantity: number; destination: string; seller: string; product: string; image: string | null; createdAt: string }>;
  lowStock: Array<{ id: string; name: string; stock: number; image: string | null }>;
  earned: number;
  /** On its way to the bank: the shop paid, waiting for delivery to be confirmed. */
  owed: number;
  /** Already paid out to the bank. */
  paid: number;
  bank: { bankName: string; account: string; ready: boolean } | null;
}

export type OrderAction = "accept" | "decline" | "packed" | "handed_over" | "delivered";

export interface DropshipOrder {
  kind: "dropship";
  id: string;
  ref: string;
  status: string;
  mixed: boolean;
  next: OrderAction[];
  shop: string;
  sellerUserId: string | null;
  label: { from: string; to: string; phone: string | null; address: string[]; collect: number };
  items: Array<{ name: string; variant: string | null; quantity: number; image: string | null; yourPrice: number; preorder?: true; shipsOn?: string | null }>;
  /** Preorder lines: the earliest ship date the supplier gave (newer servers). */
  preorder?: { shipsOn: string | null } | null;
  yourTotal: number;
  notes: string | null;
  trackingCode: string | null;
  rejectReason?: string | null;
  /** The supplier must accept a new order by then (the countdown). */
  acceptBy?: string | null;
  /** "I've packed it" was tapped. */
  packed?: boolean;
  /** The rider booked for it: "Pick up 12–4pm today", or still finding one. */
  pickup?: { status: string; text: string | null } | null;
  /** The supplier delivers it themselves (no rider to book): "handed_over" = on my way, "delivered" needs the customer's code. */
  selfDelivery?: boolean;
  /** What the supplier gets for delivering it themselves. */
  deliveryFee?: number;
  createdAt: string;
}

export interface WholesaleOrder {
  kind: "wholesale";
  id: string;
  ref: string;
  status: string;
  next: OrderAction[];
  shop: string;
  sellerUserId: string;
  sellerName: string;
  sellerPhone: string | null;
  product: { id: string; name: string; image: string | null };
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  address: string;
  notes: string | null;
  trackingCode: string | null;
  rejectReason?: string | null;
  /** The supplier must accept a new order by then (the countdown). */
  acceptBy?: string | null;
  /** "I've packed it" was tapped. */
  packed?: boolean;
  /** The rider booked for it: "Pick up 12–4pm today", or still finding one. */
  pickup?: { status: string; text: string | null } | null;
  /** A preorder: the shop ordered stock before it arrived; it ships from the date the supplier gave (newer servers). */
  preorder?: { shipsOn: string | null } | null;
  /** The shop paid by card in Shopinbos (straight to the supplier's bank). */
  paidAt?: string | null;
  createdAt: string;
}

export type SupplierOrder = DropshipOrder | WholesaleOrder;

export const fetchSupplierOverview = () => api<SupplierOverview>("/api/mobile/supplier/overview");

export const fetchSupplierOrders = (view: "open" | "done") =>
  api<{ view: string; dropship: DropshipOrder[]; wholesale: WholesaleOrder[]; counts: { dropship: number; wholesale: number } }>(`/api/mobile/supplier/orders?view=${view}`);

export const fetchSupplierOrder = (kind: SupplierOrder["kind"], id: string) => api<SupplierOrder>(`/api/mobile/supplier/orders/${encodeURIComponent(id)}?kind=${kind}`);

export const moveSupplierOrder = (kind: SupplierOrder["kind"], id: string, action: OrderAction, trackingCode?: string, reason?: string) =>
  api<SupplierOrder>(`/api/mobile/supplier/orders/${encodeURIComponent(id)}`, { method: "PATCH", json: { kind, action, trackingCode: trackingCode?.trim() || undefined, reason: reason?.trim() || undefined } });

/** "Handed over" on an order the supplier delivers: the customer's 4-digit code (a wrong one answers 400). */
export const deliverWithCode = (id: string, code: string) =>
  api<SupplierOrder>(`/api/mobile/supplier/orders/${encodeURIComponent(id)}`, { method: "PATCH", json: { kind: "dropship", action: "delivered", code } });

export interface SupplierProduct {
  id: string;
  name: string;
  slug: string;
  images: string[];
  wholesalePrice: number;
  suggestedRetailPrice: number;
  currency: string;
  moq: number;
  stockQuantity: number;
  dropshipAvailable: boolean;
  bulkOrderAvailable?: boolean;
  /** Wholesale price tiers: cheaper for bigger orders. */
  pricingTiers?: { minQty: number; maxQty?: number; price: number }[];
  status: string;
  category: { id: string; name: string } | null;
  _count?: { storeProducts: number; quoteRequests: number };
  /** Preorders (shared/preorder.ts): shops order stock before it arrives. Newer servers send them. */
  preorderEnabled?: boolean;
  preorderShipsAt?: string | null;
  preorderLimit?: number | null;
  preorderTaken?: number;
  preorderNote?: string | null;
  /** The share a shop pays when it places a preorder (0–100). Newer servers. */
  preorderDepositPct?: number;
  /** Prices per channel and dropship options (shared/dropship-rules.ts; newer servers). */
  priceMode?: string;
  dropshipPrice?: number | null;
  preorderPrice?: number | null;
  minRetailPrice?: number | null;
  dropshipMinQty?: number;
  handlingDays?: number;
  sizeBand?: string | null;
  sampleAvailable?: boolean;
}

/** Prices per channel and dropship options, as POST /api/supplier/products and PATCH …/[id] take them. */
export interface ChannelFields {
  priceMode?: "same" | "per_channel";
  wholesalePrice?: number;
  suggestedRetailPrice?: number;
  dropshipPrice?: number | null;
  preorderPrice?: number | null;
  minRetailPrice?: number | null;
  dropshipMinQty?: number;
  handlingDays?: number;
  sizeBand?: "small" | "medium" | "bulky" | null;
  sampleAvailable?: boolean;
}

export async function fetchSupplierProducts() {
  const body = await apiBody<{ data: SupplierProduct[] }>("/api/supplier/products?limit=100");
  return body.data ?? [];
}

export const quickEditProduct = (id: string, patch: { stockQuantity?: number; wholesalePrice?: number; suggestedRetailPrice?: number; publish?: boolean; preorder?: PreorderBody }) =>
  api<Pick<SupplierProduct, "id" | "name" | "status" | "stockQuantity" | "wholesalePrice" | "suggestedRetailPrice" | "preorderEnabled" | "preorderShipsAt" | "preorderLimit" | "preorderTaken" | "preorderNote">>(`/api/mobile/supplier/products/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });

export interface NewSupplierProduct extends Omit<ChannelFields, "wholesalePrice" | "suggestedRetailPrice"> {
  name: string;
  description: string;
  categoryId: string;
  images: string[];
  wholesalePrice: number;
  suggestedRetailPrice: number;
  moq: number;
  stockQuantity: number;
  dropshipAvailable: boolean;
  bulkOrderAvailable: boolean;
  deliveryRegions: string[];
  processingTime?: string;
  pricingTiers?: { minQty: number; maxQty?: number; price: number }[];
  status: "draft" | "pending_review";
  /** Take preorders (the server checks the date and cap with shared/preorder.ts). */
  preorder?: PreorderBody;
}

export const createSupplierProduct = (product: NewSupplierProduct) => api<SupplierProduct>("/api/supplier/products", { method: "POST", json: product });

export async function fetchCategories() {
  const body = await apiBody<{ data: Array<{ id: string; name: string; parentId: string | null }> }>("/api/public/categories");
  return body.data ?? [];
}

export function uploadSupplierPhoto(photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `product.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  return api<{ url: string }>("/api/mobile/supplier/upload", { method: "POST", body: form });
}

export interface QuoteRequest {
  id: string;
  quantity: number;
  destination: string;
  notes: string | null;
  status: string;
  quotedPrice: number | null;
  supplierResponse: string | null;
  expiresAt: string | null;
  createdAt: string;
  seller: { id: string; name: string };
  supplierProduct: { id: string; name: string; images: string[] };
}

export async function fetchQuoteRequests() {
  const body = await apiBody<{ data: QuoteRequest[] }>("/api/supplier/quote-requests?limit=100");
  return body.data ?? [];
}

export interface QuoteDetail {
  id: string;
  quantity: number;
  destination: string;
  notes: string | null;
  status: string;
  quotedPrice: number | null;
  reply: string | null;
  expiresAt: string | null;
  createdAt: string;
  seller: { userId: string; name: string; shop: string | null };
  product: { id: string; name: string; image: string | null; wholesalePrice: number; moq: number; stock: number };
}

export const fetchQuote = (id: string) => api<QuoteDetail>(`/api/mobile/supplier/quotes/${encodeURIComponent(id)}`);

export const replyToQuote = (id: string, body: { intent: "respond"; quotedPrice: number; moq?: number; note?: string; validDays?: number } | { intent: "decline"; note?: string }) =>
  api<QuoteDetail>(`/api/mobile/supplier/quotes/${encodeURIComponent(id)}`, { method: "POST", json: body });

export interface SupplierMe {
  supplier: { displayName: string; businessName: string; verificationStatus: string; verificationDocuments: VerificationDoc[]; trustScore: number };
  user: { name: string; email: string | null } | null;
}

export const fetchSupplierMe = () => api<SupplierMe>("/api/supplier/me");

/** A shop that wants to dropship this supplier's products (GET /api/mobile/supplier/agreements). */
export interface DropshipAgreement {
  id: string;
  status: "requested" | "active" | "declined" | string;
  shopName: string;
  shopCity: string | null;
  phone: string | null;
  stockCheck: string;
  sellerNote: string | null;
  supplierNote: string | null;
  createdAt: string;
  products: number;
  contractId: string | null;
  /** The written Dropship agreement the shop signed, to read before signing. */
  document: ContractDocument | null;
}

export const fetchAgreements = () => api<{ agreements: DropshipAgreement[] }>("/api/mobile/supplier/agreements").then((body) => body.agreements);

/** Sign (accept) with the typed name, or decline saying why. Answers the server's own message. */
export const answerAgreement = (id: string, answer: { accept: true; signedName: string } | { accept: false; note: string }) =>
  api<{ message: string }>(`/api/mobile/supplier/agreements/${encodeURIComponent(id)}`, { method: "POST", json: answer });

export const fetchSupplierProduct = (id: string) => api<SupplierProduct & { description: string }>(`/api/supplier/products/${encodeURIComponent(id)}`);

/** "When can a rider pick it up?" and the rider booked for a packed order (/api/supplier/orders/[id]/pickup). */
export interface PickupView {
  kind: SupplierOrder["kind"];
  orderId: string;
  packed: boolean;
  packable: boolean;
  address: string;
  slots: PickupSlot[];
  preselected: string;
  customDays: { day: string; label: string }[];
  customHours: number[];
  pickup: null | {
    status: string;
    text: string | null;
    address: string;
    slotKey: string;
    partner: string | null;
    rider: string | null;
    jobStatus: string | null;
    changeable: boolean;
    title: string;
    body: string;
    /** The code the rider gives before the parcel is handed over (newer servers send it). */
    pickupCode?: string | null;
  };
}

const pickupPath = (kind: SupplierOrder["kind"], id: string) => `/api/supplier/orders/${encodeURIComponent(id)}/pickup?kind=${kind}`;

export const fetchPickup = (kind: SupplierOrder["kind"], id: string) => api<PickupView>(pickupPath(kind, id));

export const markPacked = (kind: SupplierOrder["kind"], id: string) => api<PickupView>(pickupPath(kind, id), { method: "POST", json: { intent: "packed", kind } });

export const bookPickup = (kind: SupplierOrder["kind"], id: string, choice: { slot: string; day?: string; startHour?: number; address?: string }) =>
  api<PickupView>(pickupPath(kind, id), { method: "POST", json: { intent: "book", kind, ...choice } });

export const cancelPickup = (kind: SupplierOrder["kind"], id: string) => api<PickupView>(pickupPath(kind, id), { method: "DELETE" });

/** Unread chat messages (shops and delivery partners), for Home's to-do list. */
export const fetchUnreadMessages = () => api<{ unread: number }>("/api/conversations/unread").then((body) => body.unread ?? 0);

/** The set-up answers so far (the web's /supplier/onboarding uses the same route). */
export interface SupplierSetup {
  businessName: string;
  displayName: string;
  city: string | null;
  address: string | null;
  categories: string[];
  verificationStatus: string;
}

export const fetchSupplierSetup = () => api<SupplierSetup>("/api/supplier/onboarding");

/** Saves set-up answers. `docsLater` opens the app while the documents wait (the account stays unverified). */
export const saveSupplierSetup = (input: { businessName?: string; displayName?: string; city?: string; address?: string; categories?: string[]; docsLater?: boolean }) =>
  api<unknown>("/api/supplier/onboarding", { method: "PATCH", json: input });

/**
 * Supplier onboarding, one question per screen (GET/PATCH /api/supplier/onboarding; shared/supplier-onboarding.ts):
 * every answer so far, the ID check's state and the screen to resume on.
 */
export interface SupplierJoin {
  businessName: string;
  displayName: string;
  categories: string[];
  categoryOptions: string[];
  source: "make" | "import" | "resell" | null;
  buyModes: string[];
  minimumOrder: number | null;
  city: string;
  address: string;
  originState: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  cacAnswer: "yes" | "no" | "registering" | null;
  cac: { status: string; registeredName: string | null; number: string | null; verified: boolean } | null;
  cacCheckEnabled: boolean;
  idType: "nin_slip" | "drivers_licence" | "voters_card" | "passport" | null;
  idDocument: { status: string; reason: string | null } | null;
  selfie: { status: string; reason: string | null } | null;
  owner: { firstName: string; lastName: string };
  catalogueRequested: boolean;
  step: string | null;
  completed: boolean;
  verificationStatus: string;
  tiers: { verifiedIndividual: boolean; registeredBusiness: boolean; payoutReady: boolean };
  /** Track record level (new | trusted | established; newer servers). Pre-order is locked below Established. */
  level?: string;
  preorderLocked?: boolean;
}

export const fetchSupplierJoin = () => api<SupplierJoin>("/api/supplier/onboarding");

/** Saves one screen's answer and the screen to resume on (`completed` sends it for review). */
export const saveSupplierJoin = (input: Record<string, unknown>) => api<SupplierJoin>("/api/supplier/onboarding", { method: "PATCH", json: input });

/** "Is this your company?": the CAC number looked up against the registry with the business name. */
export const checkSupplierCac = (input: { businessName: string; number: string }) =>
  api<{ outcome: string; message: string; registeredName?: string }>("/api/supplier/verification/cac", { method: "POST", json: input });

export const sendSupplierId = (input: { idType: string; photo: string }) => api<SupplierJoin>("/api/supplier/kyc/id-document", { method: "POST", json: input });

export const sendSupplierSelfie = (input: { selfie: string; liveness?: { reference: string; passed: boolean } | null; nin?: string; firstName?: string; lastName?: string; dateOfBirth?: string }) =>
  api<SupplierJoin>("/api/supplier/kyc/selfie", { method: "POST", json: input });

export const addFirstSupplierProduct = (input: { photo: string; name: string; price: number }) =>
  api<{ id: string; name: string }>("/api/supplier/onboarding/first-product", { method: "POST", json: input });

export const requestCatalogueListing = () => api<{ requested: boolean }>("/api/supplier/onboarding/catalogue", { method: "POST" });

/** Changes the business once it's set up (PATCH /api/supplier/profile: no change to the verification status). */
export const saveSupplierProfile = (input: { businessName?: string; displayName?: string; city?: string; address?: string; categories?: string[] }) =>
  api<unknown>("/api/supplier/profile", { method: "PATCH", json: input });

/** Where the business sells and ships from (the Delivery hub's settings: GET /api/mobile/delivery, PUT …/settings). */
export interface DeliveryWhere {
  sellArea: string;
  sellStates: string[];
  originState: string | null;
  originArea: string | null;
  originAddress: string | null;
  /** Suppliers: "I deliver myself" (newer servers), its fee and states (empty = the state it ships from). */
  selfDelivery?: boolean;
  selfDeliveryFee?: number | string;
  selfDeliveryStates?: string[];
}

export const fetchDeliveryWhere = () => api<{ settings: DeliveryWhere }>("/api/mobile/delivery").then((body) => body.settings);

export const saveDeliveryWhere = (input: Partial<DeliveryWhere>) => api<{ settings: DeliveryWhere }>("/api/mobile/delivery/settings", { method: "PUT", json: input });

// ─── The people on the account (/api/mobile/supplier/team) ───────────────────

export const TEAM_ROLES = ["manager", "inventory", "support", "sales"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  invitedAt: string;
}

export interface TeamView {
  members: TeamMember[];
  /** Null: no limit on this plan. */
  limit: number | null;
  canAdd: boolean;
  verified?: boolean;
}

export const fetchTeam = () => api<TeamView>("/api/mobile/supplier/team");

export const addTeamMember = (input: { name: string; email: string; phone?: string; role: TeamRole }) => api<TeamView>("/api/mobile/supplier/team", { method: "POST", json: input });

export const setTeamMemberActive = (id: string, active: boolean) =>
  api<{ id: string; status: string }>(`/api/mobile/supplier/team/${encodeURIComponent(id)}`, { method: "PATCH", json: { active } });

export const removeTeamMember = (id: string) => api<{ id: string }>(`/api/mobile/supplier/team/${encodeURIComponent(id)}`, { method: "DELETE" });

// ─── The business profile shops see (GET / PATCH /api/supplier/profile) ──────

export interface SupplierPublicProfile {
  displayName: string;
  description: string | null;
  whatsappNumber: string | null;
  website: string | null;
  logoUrl: string | null;
  slug: string;
}

export const fetchSupplierProfile = () => api<SupplierPublicProfile>("/api/supplier/profile");

export const savePublicProfile = (input: { description?: string; whatsappNumber?: string; website?: string; logoUrl?: string }) =>
  api<SupplierPublicProfile>("/api/supplier/profile", { method: "PATCH", json: input });

// ─── Full product edit (PATCH /api/supplier/products/[id], the web editor's call) ─

export type PriceTier = { minQty: number; maxQty?: number; price: number };

export interface ProductEdit extends ChannelFields {
  name?: string;
  description?: string;
  images?: string[];
  moq?: number;
  processingTime?: string;
  deliveryRegions?: string[];
  dropshipAvailable?: boolean;
  bulkOrderAvailable?: boolean;
  pricingTiers?: PriceTier[];
  /** Preorder settings (only when they changed); they don't send a live product back for review. */
  preorder?: PreorderBody;
}

export const editSupplierProduct = (id: string, patch: ProductEdit) =>
  api<SupplierProduct & { description: string }>(`/api/supplier/products/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });

// ─── Supplier & Dropship Rules (shared/dropship-rules.ts; the portal's own routes) ─

/** "Your level": New → Trusted → Established, worked out fresh from the record (GET /api/supplier/level). */
export interface SupplierLevelView {
  level: SupplierLevel;
  next: SupplierLevel | null;
  goals: LevelGoal[];
  perks: SupplierPerks;
  nextPerks: SupplierPerks | null;
  lockedMessage: string;
}

export const fetchSupplierLevel = () => api<SupplierLevelView>("/api/supplier/level");

/** Delivery prices: Shopinbos partner rates, or the supplier's own card by zone and parcel size. */
export interface DeliveryRatesView {
  rateSource: RateSource;
  zoneRates: ZoneRates;
  originState: string | null;
  originArea: string | null;
  defaults: ZoneRates;
}

export const fetchDeliveryRates = () => api<DeliveryRatesView>("/api/supplier/delivery-rates");

/** "own" is checked like the web (400 invalid_rates with the reason). */
export const saveDeliveryRates = (input: { rateSource: RateSource; zoneRates?: ZoneRates }) => api<DeliveryRatesView>("/api/supplier/delivery-rates", { method: "PUT", json: input });

/** The branding offered to sellers who dropship (packing slips and stickers unlock at Trusted: `allowed`). */
export interface BrandingView {
  offer: BrandingOffer;
  level: SupplierLevel;
  allowed: boolean;
}

export const fetchBranding = () => api<BrandingView>("/api/supplier/branding");

export const saveBranding = (offer: Partial<BrandingOffer>) => api<BrandingView>("/api/supplier/branding", { method: "PUT", json: offer });

/** Pack it the seller's way on one dropship order (GET/POST /api/supplier/orders/[id]/pack). */
export interface PackView {
  orderId: string;
  branding: { sellerName: string; logoUrl: string | null; choice: BrandingChoice; fee: number; skus: string[] };
  steps: Array<{ id: "plain" | "slip" | "sticker" | "code" | "photo"; text: string; detail: string; done: boolean }>;
  packSteps: string[];
  photoUrl: string | null;
  stickersLeft: number | null;
  packed: boolean;
  /** Why it can't be marked packed yet, or null. */
  problem: string | null;
}

const packPath = (id: string) => `/api/supplier/orders/${encodeURIComponent(id)}/pack`;

export const fetchPack = (id: string) => api<PackView>(packPath(id));

/** Ticks steps, saves the sealed-parcel photo, and with `packed: true` marks it packed (400 with the step left). */
export const savePack = (id: string, input: { steps?: string[]; photoUrl?: string | null; packed?: true }) => api<PackView>(packPath(id), { method: "POST", json: input });

/** Uploads a photo to the signed-in person's media library (POST /api/app/media) and returns its web address. */
export async function uploadMediaPhoto(photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `parcel.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  form.append("only", "image");
  const asset = await api<{ url: string }>("/api/app/media", { method: "POST", body: form });
  return asset.url;
}
