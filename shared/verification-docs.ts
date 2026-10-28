// Verification document types and rules shared by supplier/logistics onboarding, the verification
// pages, the upload API and the admin document viewer, so every screen agrees on what a document is
// and when it really has a file behind it.

export const DOC_TYPES = ["cac", "identity", "product-images", "tax", "utility", "bank", "insurance", "fleet", "other", "selfie", "courier-licence", "base-photo"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type DocStatus = "draft" | "uploaded" | "submitted" | "under_review" | "approved" | "rejected";

export interface VerificationDoc {
  id: string;
  type: DocType;
  label: string;
  fileName: string;
  /** Storage path inside the media bucket. Empty for old onboarding records that never uploaded a file. */
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: DocStatus;
  uploadedAt: string;
  updatedAt: string;
  rejectionReason?: string;
  /** Set when the business was checked against the CAC registry instead of (or before) a file upload. */
  registry?: RegistryCheck;
  /** Set on the "identity" document when the owner's BVN or NIN passed the Shopinbos Wallet ID check. */
  idCheck?: IdCheck;
  /** A delivery partner's selfie: the facial match against their NIN photo (shared/partner-tiers.ts selfieDecision). */
  faceMatch?: FaceMatchCheck;
  /** A delivery partner's selfie: the liveness check the browser reported (Korapay's reference, for the team to look up). */
  liveness?: LivenessCheck;
}

export interface FaceMatchCheck {
  provider: string;
  match: boolean | null;
  /** 0–100, as Korapay answers it. */
  confidence: number | null;
  checkedAt: string;
}

export interface LivenessCheck {
  provider: string;
  reference: string;
  passed: boolean;
  checkedAt: string;
}

/** The owner's ID check (Shopinbos Wallet, src/lib/wallet): stands in for an uploaded ID. Never the full number. */
export interface IdCheck {
  source: "wallet";
  idType: "bvn" | "nin";
  idLast4: string;
  /** Name on the ID. */
  name: string;
  checkedAt: string;
}

/** Result of an instant CAC registry lookup, kept on the "cac" document so admins see what was matched. */
export interface RegistryCheck {
  source: "cac";
  provider: string;
  rcNumber: string;
  companyType: string;
  enteredName: string;
  registeredName: string;
  registryStatus: string;
  /** Registered name matches what the business entered. */
  nameMatched: boolean;
  /** The account holder is listed on the CAC record as a director, proprietor or shareholder. */
  ownerMatched: boolean;
  /** Name and owner matched and the company is active: counts as the CAC document. */
  verified: boolean;
  address?: string;
  registeredAt?: string;
  checkedAt: string;
}

export interface DocConfig {
  type: DocType;
  label: string;
  required: boolean;
  hint: string;
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  cac: "Business registration or CAC certificate",
  identity: "Owner identity document (NIN)",
  "product-images": "Product images",
  tax: "Tax Identification Number (TIN)",
  utility: "Utility bill",
  bank: "Bank account proof",
  insurance: "Insurance certificate",
  fleet: "Fleet or vehicle documents",
  other: "Other document",
  selfie: "Selfie",
  "courier-licence": "NIPOST courier licence",
  "base-photo": "Photo of the base or shop",
};

/**
 * Supplier documents. None is required: a supplier is verified on their ID photo and selfie (onboarding,
 * shared/supplier-onboarding.ts), and the CAC number lookup replaces the certificate, uploaded only when the lookup
 * fails. The rest earn trust and badges.
 */
export const SUPPLIER_DOC_TYPES: DocConfig[] = [
  { type: "cac", label: DOC_TYPE_LABELS.cac, required: false, hint: "Only if the CAC number check didn't find your business. BN or RC document accepted" },
  { type: "product-images", label: DOC_TYPE_LABELS["product-images"], required: false, hint: "Photos of your products, combined into one PDF or a single clear image" },
  { type: "tax", label: DOC_TYPE_LABELS.tax, required: false, hint: "TIN certificate or tax document. Boosts your trust score" },
  { type: "utility", label: DOC_TYPE_LABELS.utility, required: false, hint: "For address verification. Boosts your trust score" },
  { type: "bank", label: DOC_TYPE_LABELS.bank, required: false, hint: "Bank letter or statement header that matches your business name" },
  { type: "insurance", label: DOC_TYPE_LABELS.insurance, required: false, hint: "Public liability. Unlocks badges" },
];

export const LOGISTICS_DOC_TYPES: DocConfig[] = [
  { type: "cac", label: DOC_TYPE_LABELS.cac, required: true, hint: "BN or RC document accepted" },
  { type: "insurance", label: DOC_TYPE_LABELS.insurance, required: true, hint: "Required for fleet operations" },
  { type: "utility", label: DOC_TYPE_LABELS.utility, required: false, hint: "For address verification" },
  { type: "fleet", label: DOC_TYPE_LABELS.fleet, required: false, hint: "Vehicle registration, road worthiness" },
];

/**
 * Files in the tiered partner verification (shared/partner-tiers.ts, /logistics/verification). None is "required"
 * here: the tier checklists decide what each tier needs (the ID photo and selfie for Tier 1, CAC for Tier 2). The
 * selfie, ID photo and base photo are taken in the sign-up flow (/api/logistics/kyc/*), not through the upload route.
 * LOGISTICS_DOC_TYPES above stays for the phone app's documents screen.
 */
export const LOGISTICS_TIER_DOC_TYPES: DocConfig[] = [
  { type: "selfie", label: DOC_TYPE_LABELS.selfie, required: false, hint: "A clear photo of your face, looking at the camera" },
  { type: "identity", label: "Photo of an ID", required: false, hint: "NIN slip, driver's licence, voter's card or passport" },
  { type: "base-photo", label: DOC_TYPE_LABELS["base-photo"], required: false, hint: "Optional. With the base pin it earns the Address Verified badge" },
  { type: "utility", label: DOC_TYPE_LABELS.utility, required: false, hint: "For address verification" },
  { type: "cac", label: DOC_TYPE_LABELS.cac, required: false, hint: "BN or RC document accepted" },
  { type: "courier-licence", label: DOC_TYPE_LABELS["courier-licence"], required: false, hint: "Optional. Shows a Licensed Courier badge" },
];

export function docTypesForRole(role: "supplier" | "logistics_partner"): DocConfig[] {
  return role === "supplier" ? SUPPLIER_DOC_TYPES : LOGISTICS_DOC_TYPES;
}

/** Every document type this role may upload (the upload API checks it). */
export function uploadableDocTypes(role: "supplier" | "logistics_partner"): DocType[] {
  if (role === "supplier") return SUPPLIER_DOC_TYPES.map((config) => config.type);
  return [...new Set([...LOGISTICS_DOC_TYPES, ...LOGISTICS_TIER_DOC_TYPES].map((config) => config.type))];
}

// ─── Files ────────────────────────────────────────────────────────────────────

/**
 * What one document can be once it's sent. Uploads can't be over about 4.5 MB on the server (Vercel's request
 * limit); photos are shrunk in the browser before they're checked against this, so only big PDFs hit it.
 */
export const MAX_DOC_BYTES = 4 * 1024 * 1024;
export const DOC_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const DOC_EXTENSIONS: Record<string, (typeof DOC_MIME_TYPES)[number]> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
/** What people are told they can upload. Keep in step with DOC_MIME_TYPES and MAX_DOC_BYTES. */
export const DOC_FORMATS_LABEL = "PDF, JPG, PNG or WebP, up to 4 MB";
/** Value for `<input type="file" accept>`. */
export const DOC_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

/** Resolves the file's MIME type, trusting the extension only when the browser sent none. */
export function docMimeType(file: { name: string; type?: string | null }): string | null {
  const declared = (file.type ?? "").toLowerCase();
  if (declared) return (DOC_MIME_TYPES as readonly string[]).includes(declared) ? declared : null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DOC_EXTENSIONS[ext] ?? null;
}

/** Returns a message the person can act on, or null when the file is fine. */
export function validateDocFile(file: { name: string; type?: string | null; size: number }): string | null {
  if (!docMimeType(file)) return `${file.name} isn't a PDF, JPG, PNG or WebP file.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_DOC_BYTES) return `${file.name} is ${formatBytes(file.size)}. The limit is 4 MB.`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Records ──────────────────────────────────────────────────────────────────

export function isDocType(value: unknown): value is DocType {
  return typeof value === "string" && (DOC_TYPES as readonly string[]).includes(value);
}

// Types the old supplier onboarding wrote before it uploaded real files.
const LEGACY_TYPES: Record<string, DocType> = { registration: "cac", factory: "other" };
// Statuses the old onboarding used. "pending"/"optional" meant nothing was chosen, so those rows are dropped.
const LEGACY_STATUSES: Record<string, DocStatus | null> = { pending: null, optional: null, reading: "uploaded", read: "uploaded" };
const STATUSES: DocStatus[] = ["draft", "uploaded", "submitted", "under_review", "approved", "rejected"];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Reads `verificationDocuments` JSON into clean records, mapping old onboarding rows onto the shared types. */
export function normalizeVerificationDocs(value: unknown): VerificationDoc[] {
  if (!Array.isArray(value)) return [];
  const docs: VerificationDoc[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const rawType = text(row.type);
    const type: DocType = isDocType(rawType) ? rawType : LEGACY_TYPES[rawType] ?? "other";
    const rawStatus = text(row.status);
    const status = STATUSES.includes(rawStatus as DocStatus) ? (rawStatus as DocStatus) : LEGACY_STATUSES[rawStatus];
    if (status === null) continue;
    const uploadedAt = text(row.uploadedAt);
    docs.push({
      id: text(row.id) || `${type}-${docs.length}`,
      type,
      label: text(row.label) || text(row.name) || DOC_TYPE_LABELS[type],
      fileName: text(row.fileName),
      filePath: text(row.filePath),
      fileSize: typeof row.fileSize === "number" && Number.isFinite(row.fileSize) ? row.fileSize : 0,
      mimeType: text(row.mimeType),
      status: status ?? "draft",
      uploadedAt,
      updatedAt: text(row.updatedAt) || uploadedAt,
      ...(typeof row.rejectionReason === "string" && row.rejectionReason ? { rejectionReason: row.rejectionReason } : {}),
      ...(normalizeRegistry(row.registry) ? { registry: normalizeRegistry(row.registry)! } : {}),
      ...(normalizeIdCheck(row.idCheck) ? { idCheck: normalizeIdCheck(row.idCheck)! } : {}),
      ...(normalizeFaceMatch(row.faceMatch) ? { faceMatch: normalizeFaceMatch(row.faceMatch)! } : {}),
      ...(normalizeLiveness(row.liveness) ? { liveness: normalizeLiveness(row.liveness)! } : {}),
    });
  }
  return docs;
}

function normalizeFaceMatch(value: unknown): FaceMatchCheck | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (!text(r.provider) || !text(r.checkedAt)) return null;
  return {
    provider: text(r.provider),
    match: typeof r.match === "boolean" ? r.match : null,
    confidence: typeof r.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : null,
    checkedAt: text(r.checkedAt),
  };
}

function normalizeLiveness(value: unknown): LivenessCheck | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (!text(r.provider) || !text(r.reference) || !text(r.checkedAt)) return null;
  return { provider: text(r.provider), reference: text(r.reference).slice(0, 120), passed: r.passed === true, checkedAt: text(r.checkedAt) };
}

function normalizeIdCheck(value: unknown): IdCheck | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (r.source !== "wallet" || (r.idType !== "bvn" && r.idType !== "nin") || !text(r.checkedAt)) return null;
  return { source: "wallet", idType: r.idType, idLast4: text(r.idLast4).slice(-4), name: text(r.name), checkedAt: text(r.checkedAt) };
}

function normalizeRegistry(value: unknown): RegistryCheck | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (r.source !== "cac" || !text(r.rcNumber) || !text(r.checkedAt)) return null;
  return {
    source: "cac",
    provider: text(r.provider),
    rcNumber: text(r.rcNumber),
    companyType: text(r.companyType),
    enteredName: text(r.enteredName),
    registeredName: text(r.registeredName),
    registryStatus: text(r.registryStatus),
    nameMatched: r.nameMatched === true,
    ownerMatched: r.ownerMatched === true,
    verified: r.verified === true,
    ...(text(r.address) ? { address: text(r.address) } : {}),
    ...(text(r.registeredAt) ? { registeredAt: text(r.registeredAt) } : {}),
    checkedAt: text(r.checkedAt),
  };
}

export function docHasFile(doc: Pick<VerificationDoc, "filePath"> | null | undefined): boolean {
  return Boolean(doc?.filePath && doc.filePath.trim());
}

/** The CAC registry confirmed this business, so no certificate upload is needed. */
export function docRegistryVerified(doc: Pick<VerificationDoc, "registry"> | null | undefined): boolean {
  return Boolean(doc?.registry?.verified);
}

/** The owner's BVN or NIN passed the Wallet ID check, so no ID upload is needed. */
export function docIdChecked(doc: Pick<VerificationDoc, "idCheck"> | null | undefined): boolean {
  return Boolean(doc?.idCheck);
}

/** A file, a registry match or a passed ID check backs the document. */
export function docHasEvidence(doc: Pick<VerificationDoc, "filePath" | "registry" | "idCheck"> | null | undefined): boolean {
  return docHasFile(doc) || docRegistryVerified(doc) || docIdChecked(doc);
}

/** A document counts towards verification only when a stored file (or a CAC registry match) backs it and it hasn't been rejected. */
export function isDocComplete(doc: VerificationDoc | null | undefined): boolean {
  return Boolean(doc && docHasEvidence(doc) && doc.status !== "draft" && doc.status !== "rejected");
}

export function findDoc(docs: VerificationDoc[], type: DocType): VerificationDoc | undefined {
  // Prefer a row with a file or registry match if an old record and a real one share a type.
  return docs.find((doc) => doc.type === type && docHasEvidence(doc)) ?? docs.find((doc) => doc.type === type);
}

export function missingRequiredDocs(configs: DocConfig[], docs: VerificationDoc[]): DocConfig[] {
  return configs.filter((config) => config.required && !isDocComplete(findDoc(docs, config.type)));
}

export type DocDisplayState = "missing" | "needs_file" | DocStatus;

export function docDisplayState(doc: VerificationDoc | null | undefined): DocDisplayState {
  if (!doc) return "missing";
  if (!docHasEvidence(doc) && doc.status !== "draft" && doc.status !== "rejected") return "needs_file";
  return doc.status;
}

/** Status wording. The owner is told to re-upload; admins are told there is nothing to look at. */
export function docStatusLabel(doc: VerificationDoc | null | undefined, audience: "owner" | "admin", required = false): string {
  const state = docDisplayState(doc);
  switch (state) {
    case "missing":
      return required ? "Needed" : "Optional";
    case "needs_file":
      return audience === "owner" ? "Needs re-upload" : "No file";
    case "draft":
      return "Draft";
    case "uploaded":
      return audience === "owner" ? "Uploaded" : "Not sent yet";
    case "submitted":
      return audience === "owner" ? "Sent for review" : "Submitted";
    case "under_review":
      return "Under review";
    case "approved":
      return docRegistryVerified(doc) && !docHasFile(doc) ? "Verified with CAC" : "Approved";
    case "rejected":
      return "Rejected";
  }
}

/** Marks uploaded documents as sent for review. Rows without a file are left alone. */
export function submitUploadedDocs(docs: VerificationDoc[], now = new Date().toISOString()): VerificationDoc[] {
  return docs.map((doc) => (doc.status === "uploaded" && docHasEvidence(doc) ? { ...doc, status: "submitted", updatedAt: now } : doc));
}
