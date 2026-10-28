// Supplier onboarding, one question per screen (the owner's "Shopinbos Onboarding — Simplified": "Supplier: question
// by question"), shared by the web (/supplier/onboarding), the phone app (apps/mobile/src/app/supplier/setup.tsx),
// the API (/api/supplier/onboarding, /api/supplier/kyc/*) and the admin supplier page. Pure: no "@/" imports, so
// tests load it directly.
//
// The screens, in order: business name · CAC (Yes / No / Registering now; Yes → number → "Is this your company?") ·
// what they supply · make, import or resell · how shops can buy · minimum order (only with Wholesale) · where goods
// leave from · a photo of their ID · a selfie · their first product · "You're in review".
//
// Verification, as tiers that each unlock something: "Verified Individual" (ID + selfie face match, or the team's
// approval) lists the supplier to shops; "Registered Business" comes from the CAC number lookup; "Payout ready" from
// a checked bank account, asked at the first payout, never during sign-up.

export const SUPPLIER_ONBOARDING_STEPS = ["name", "cac", "categories", "source", "buyModes", "moq", "location", "id", "selfie", "product", "review"] as const;
export type SupplierOnboardingStep = (typeof SUPPLIER_ONBOARDING_STEPS)[number];

export const CAC_ANSWERS = ["yes", "no", "registering"] as const;
export type CacAnswer = (typeof CAC_ANSWERS)[number];

/** "Do you make it, import it or resell it?", and the Supplier.businessType each answer stores. */
export const SUPPLY_SOURCES = ["make", "import", "resell"] as const;
export type SupplySource = (typeof SUPPLY_SOURCES)[number];
export const SOURCE_BUSINESS_TYPE: Record<SupplySource, "manufacturer" | "importer" | "wholesaler"> = {
  make: "manufacturer",
  import: "importer",
  resell: "wholesaler",
};

export function sourceForBusinessType(type: string | null | undefined): SupplySource | null {
  if (type === "manufacturer") return "make";
  if (type === "importer") return "import";
  if (type === "wholesaler") return "resell";
  return null;
}

/** How shops can buy from the supplier: the defaults for new products. */
export const BUY_MODES = ["dropship", "wholesale", "preorder"] as const;
export type BuyMode = (typeof BUY_MODES)[number];

export function cleanBuyModes(value: unknown): BuyMode[] {
  const list = Array.isArray(value) ? value : [];
  return BUY_MODES.filter((mode) => list.includes(mode));
}

export const MIN_ORDER_MAX = 100_000;

/** A minimum order as typed or stepped: a whole number from 1, else null. */
export function cleanMinimumOrder(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole >= 1 && whole <= MIN_ORDER_MAX ? whole : null;
}

/** The kinds of ID the supplier can photograph. Only a NIN slip can be checked automatically (Korapay NIN lookup). */
export const SUPPLIER_ID_TYPES = ["nin_slip", "drivers_licence", "voters_card", "passport"] as const;
export type SupplierIdType = (typeof SUPPLIER_ID_TYPES)[number];

export const ID_TYPE_LABELS: Record<SupplierIdType, string> = {
  nin_slip: "NIN slip",
  drivers_licence: "Driver's licence",
  voters_card: "Voter's card",
  passport: "International passport",
};

/** The minimum order screen only shows when the supplier sells wholesale. */
export function supplierSteps(buyModes: readonly string[]): SupplierOnboardingStep[] {
  return SUPPLIER_ONBOARDING_STEPS.filter((step) => step !== "moq" || buyModes.includes("wholesale"));
}

export function isSupplierStep(value: unknown): value is SupplierOnboardingStep {
  return typeof value === "string" && (SUPPLIER_ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** "Step X of N" for a screen (N counts the minimum order screen only with Wholesale). */
export function stepPosition(step: SupplierOnboardingStep, buyModes: readonly string[]) {
  const steps = supplierSteps(buyModes);
  const index = steps.indexOf(step);
  return { index: index < 0 ? 0 : index, total: steps.length };
}

export function nextStep(step: SupplierOnboardingStep, buyModes: readonly string[]): SupplierOnboardingStep {
  const steps = supplierSteps(buyModes);
  const index = steps.indexOf(step);
  return steps[Math.min(steps.length - 1, (index < 0 ? -1 : index) + 1)];
}

export function previousStep(step: SupplierOnboardingStep, buyModes: readonly string[]): SupplierOnboardingStep | null {
  const steps = supplierSteps(buyModes);
  const index = steps.indexOf(step);
  return index > 0 ? steps[index - 1] : null;
}

// ─── Identity ────────────────────────────────────────────────────────────────

export type CheckStatus = "pending" | "approved" | "rejected";

export interface SupplierIdentity {
  idType?: SupplierIdType;
  /** Name as typed on the ID screen (and, for a NIN, the name the record holds). */
  fullName?: string;
  nin?: { last4: string; hash: string; status: CheckStatus; checkedAt: string; provider?: string; nameOnRecord?: string; reference?: string };
}

export function readSupplierIdentity(value: unknown): SupplierIdentity {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out: SupplierIdentity = {};
  if (typeof row.idType === "string" && (SUPPLIER_ID_TYPES as readonly string[]).includes(row.idType)) out.idType = row.idType as SupplierIdType;
  if (typeof row.fullName === "string" && row.fullName.trim()) out.fullName = row.fullName.trim();
  const nin = row.nin && typeof row.nin === "object" ? (row.nin as Record<string, unknown>) : null;
  if (nin && typeof nin.last4 === "string" && typeof nin.hash === "string" && ["pending", "approved", "rejected"].includes(String(nin.status))) {
    out.nin = {
      last4: nin.last4,
      hash: nin.hash,
      status: nin.status as CheckStatus,
      checkedAt: typeof nin.checkedAt === "string" ? nin.checkedAt : "",
      ...(typeof nin.provider === "string" ? { provider: nin.provider } : {}),
      ...(typeof nin.nameOnRecord === "string" ? { nameOnRecord: nin.nameOnRecord } : {}),
      ...(typeof nin.reference === "string" ? { reference: nin.reference } : {}),
    };
  }
  return out;
}

/** Below this Korapay confidence a matching selfie still goes to the team. */
export const SUPPLIER_FACE_MATCH_MIN = 80;
export const SUPPLIER_SELFIE_MISMATCH = "Your selfie doesn't match the photo on your NIN. Take a new one in good light, looking straight at the camera.";

/** What the selfie's facial match decides: approved on a confident match, rejected on a mismatch, else the team looks. */
export function supplierSelfieDecision(face: { match: boolean | null; confidence: number | null } | null | undefined): { status: CheckStatus; reason?: string } {
  if (!face || face.match === null) return { status: "pending" };
  if (face.match === false) return { status: "rejected", reason: SUPPLIER_SELFIE_MISMATCH };
  if (face.confidence !== null && face.confidence < SUPPLIER_FACE_MATCH_MIN) return { status: "pending" };
  return { status: "approved" };
}

// ─── Tiers ───────────────────────────────────────────────────────────────────

type DocLike = { type: string; status: string; filePath?: string; registry?: { verified?: boolean } | null };

export interface SupplierTierSnapshot {
  verificationStatus: string;
  docs: readonly DocLike[];
  identity: SupplierIdentity;
  payoutVerified: boolean;
}

function docStatus(docs: readonly DocLike[], type: string) {
  return docs.find((doc) => doc.type === type)?.status ?? null;
}

/** The ID photo and the selfie are both in (sent, waiting or decided): the supplier can go to review. */
export function identitySent(docs: readonly DocLike[]) {
  const sent = (type: string) => {
    const status = docStatus(docs, type);
    return status !== null && status !== "draft" && status !== "rejected";
  };
  return sent("identity") && sent("selfie");
}

export function supplierTiers(snapshot: SupplierTierSnapshot) {
  const idApproved = docStatus(snapshot.docs, "identity") === "approved";
  const selfieApproved = docStatus(snapshot.docs, "selfie") === "approved";
  const cac = snapshot.docs.find((doc) => doc.type === "cac");
  return {
    /** ID + selfie face match (or the team approved both), or the team verified the supplier. */
    verifiedIndividual: (idApproved && selfieApproved) || snapshot.verificationStatus === "verified",
    /** The CAC number matched the registry (or the team approved the certificate). */
    registeredBusiness: Boolean(cac && (cac.registry?.verified || cac.status === "approved")),
    payoutReady: snapshot.payoutVerified,
  };
}

/** Badges to show for these tiers (the words the app uses). */
export function supplierTierBadges(tiers: ReturnType<typeof supplierTiers>): string[] {
  return [
    ...(tiers.verifiedIndividual ? ["verified_individual"] : []),
    ...(tiers.registeredBusiness ? ["registered_business"] : []),
    ...(tiers.payoutReady ? ["payout_ready"] : []),
  ];
}

/**
 * The status a supplier should have once onboarding is sent: verified as soon as the ID and selfie are approved
 * (listed to shops), else pending for the team (a rejected supplier sending again goes back to pending). A suspended
 * supplier only changes by the team's hand.
 */
export function nextSupplierStatus(current: string, sent: boolean, tiers: ReturnType<typeof supplierTiers>): string {
  if (current === "verified" || current === "suspended") return current;
  if (!sent) return current;
  return tiers.verifiedIndividual ? "verified" : "pending";
}

/** Pickup coordinates as the browser or phone reported them, or null. */
export function cleanCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = typeof lat === "number" ? lat : Number(lat);
  const b = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(b * 1e6) / 1e6 };
}
