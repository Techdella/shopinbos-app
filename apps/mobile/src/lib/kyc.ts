import type { CheckStatus, FlowAnswers, FlowScreen, IdType, ItemState, TierRules, GraduationProgress } from "@shared/partner-tiers";
import type { VerificationDoc } from "@shared/verification-docs";
import { api } from "./api";
import { uploadOnePhoto, type PhotoInput } from "./upload-photo";

// Delivery partner sign-up and verification, the same calls as the web page (/api/logistics/kyc/*, src/lib/logistics/
// partner-kyc.server.ts kycState). Every change answers with the whole state, so screens just replace it.

export interface KycState {
  state: "unverified" | "pending_review" | "tier1_verified" | "tier2_verified" | "rejected" | "suspended";
  tier: string;
  badges: string[];
  statusReason: string | null;
  submittedAt: string | null;
  termsCurrent: boolean;
  idChecksReady: boolean;
  displayName: string;
  /** The account holder's name (sign-up). */
  accountName: string;
  identity: {
    fullName: string | null;
    address: { value: string; state?: string } | null;
    base: { address: string; state?: string; lat?: number; lng?: number } | null;
    idDocument: { type: IdType } | null;
    phone: { value: string; status: CheckStatus } | null;
    nin: { last4: string; status: CheckStatus; rejectionReason: string | null } | null;
  };
  docs: VerificationDoc[];
  coverage: { deliveryAreas: string[]; deliveryMethods: string[]; interstate: boolean };
  pricing: { basePrice: number };
  business: { registeredName: string | null; cacType: string | null; cacNumber: string | null; businessAddress: string | null; companyName: string; logoUrl: string | null };
  flow: { answers: FlowAnswers; done: Record<FlowScreen, boolean>; first: FlowScreen };
  tier1: Record<string, ItemState>;
  tier2: Record<string, ItemState>;
  readyToSubmit: boolean;
  limits: { limited: boolean; rules: TierRules; progress: GraduationProgress; liftedAt: string | null };
}

const BASE = "/api/logistics/kyc";

export const fetchKyc = () => api<KycState>(BASE);

/** One of the plain-answer screens (business name, CAC answer, state, areas, vehicles, other states, how they charge). */
export const saveAnswer = (screen: FlowScreen, body: Record<string, unknown>) => api<KycState>(`${BASE}/answers`, { method: "PATCH", json: { screen, ...body } });

/** Where they're based: the address, the phone's location when shared, and an optional photo (data URI). */
export const saveBase = (input: { address: string; state?: string; lat?: number; lng?: number; photo?: string }) =>
  api<KycState>(`${BASE}/base`, { method: "POST", json: input });

/** Which ID and its photo (data URI). */
export const saveIdDocument = (idType: IdType, photo: string) => api<KycState>(`${BASE}/id-document`, { method: "POST", json: { idType, photo } });

/** NIN with name, date of birth and the selfie: the server matches the face to the NIN photo (Korapay). */
export const checkNin = (input: { nin: string; firstName: string; lastName: string; dateOfBirth: string; selfie: string; liveness?: { reference: string; passed: boolean } }) =>
  api<KycState>(`${BASE}/nin`, { method: "POST", json: input });

/** The selfie with any other ID: the team compares it with the ID photo. */
export const sendSelfie = (input: { selfie: string; liveness?: { reference: string; passed: boolean } }) => api<KycState>(`${BASE}/selfie`, { method: "POST", json: input });

export const sendPhoneCode = (phone: string) => api<{ challenge: string }>(`${BASE}/phone`, { method: "POST", json: { action: "send", phone } });
export const verifyPhoneCode = (phone: string, challenge: string, code: string) =>
  api<KycState>(`${BASE}/phone`, { method: "POST", json: { action: "verify", phone, challenge, code } });

/** "Do you have a company logo?": a photo of it (saved as the company's logo, kept see-through). */
export const saveKycLogo = (photo: PhotoInput) => uploadOnePhoto<KycState>(`${BASE}/logo`, photo, {}, { base: "logo", keepTransparency: true });

export const saveKycBusiness = (input: { registeredName: string; cacType: string; cacNumber: string; businessAddress?: string }) =>
  api<KycState>(`${BASE}/business`, { method: "PATCH", json: input });

/** The instant CAC lookup ("Is this your company?"); answers with the registered name when it found one. */
export const lookUpCac = (input: { businessName: string; number: string; companyType: "COMPANY" | "BUSINESS_NAME" }) =>
  api<{ outcome: string; message: string; registeredName?: string }>("/api/logistics/verification/cac", { method: "POST", json: input });

export const acceptTerms = () => api<KycState>(`${BASE}/terms`, { method: "POST", json: {} });
export const submitKyc = () => api<KycState>(`${BASE}/submit`, { method: "POST", json: {} });
