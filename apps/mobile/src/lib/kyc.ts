import type { CheckStatus, ItemState, TierRules, GraduationProgress } from "@shared/partner-tiers";
import type { VerificationDoc } from "@shared/verification-docs";
import { api } from "./api";

// Delivery partner verification, the same calls as the web page (/api/logistics/kyc/*, src/lib/logistics/
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
  identity: {
    fullName: string | null;
    address: { value: string; state?: string } | null;
    phone: { value: string; status: CheckStatus } | null;
    email: { value: string; status: CheckStatus } | null;
    nin: { last4: string; status: CheckStatus; rejectionReason: string | null } | null;
    payout: { method: "bvn" | "bank"; last4: string; status: CheckStatus; bankName: string | null; accountName: string | null; nameMatched: boolean; rejectionReason: string | null } | null;
  };
  docs: VerificationDoc[];
  vehicles: Array<{ id: string; type: string; plateNumber: string; status: string; rejectionReason: string | null }>;
  guarantor: { fullName: string; phone: string; address: string; relationship: string; status: string; respondedVia: string | null; resendIn: number | null } | null;
  coverage: { deliveryAreas: string[]; deliveryMethods: string[] };
  business: { registeredName: string | null; cacType: string | null; cacNumber: string | null; businessAddress: string | null; companyName: string };
  tier1: Record<string, ItemState>;
  tier2: Record<string, ItemState>;
  readyToSubmit: boolean;
  limits: { limited: boolean; rules: TierRules; progress: GraduationProgress; liftedAt: string | null };
}

export interface PickedPhoto {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

const BASE = "/api/logistics/kyc";

export const fetchKyc = () => api<KycState>(BASE);

export const saveIdentity = (input: { firstName?: string; lastName?: string; address?: string; state?: string }) =>
  api<KycState>(`${BASE}/identity`, { method: "PATCH", json: input });

/** NIN with name, date of birth and the selfie: the server matches the face to the NIN photo (Korapay). */
export const checkNin = (input: { nin: string; firstName: string; lastName: string; dateOfBirth: string; selfie: string; liveness?: { reference: string; passed: boolean } }) =>
  api<KycState>(`${BASE}/nin`, { method: "POST", json: input });

/** Sends a phone code, or approves at once when it is the number the account signed up with (then there is no challenge). */
export const sendPhoneCode = (phone: string) => api<{ challenge: string } | KycState>(`${BASE}/phone`, { method: "POST", json: { action: "send", phone } });
export const verifyPhoneCode = (phone: string, challenge: string, code: string) =>
  api<KycState>(`${BASE}/phone`, { method: "POST", json: { action: "verify", phone, challenge, code } });

/** Sends an email code, or approves at once when it's the account's own confirmed email (then there's no challenge). */
export const sendEmailCode = (email: string) => api<{ challenge: string } | KycState>(`${BASE}/email`, { method: "POST", json: { action: "send", email } });
export const verifyEmailCode = (email: string, challenge: string, code: string) =>
  api<KycState>(`${BASE}/email`, { method: "POST", json: { action: "verify", email, challenge, code } });

export const fetchPayoutBanks = () => api<{ banks: string[] }>(`${BASE}/payout`);
/** A bank account in the NIN's name (partners are never asked for a BVN). */
export const savePayout = (input: { method: "bank"; bankName: string; accountNumber: string }) =>
  api<KycState>(`${BASE}/payout`, { method: "POST", json: input });

export const saveKycCoverage = (input: { deliveryAreas: string[]; deliveryMethods: string[] }) => api<KycState>(`${BASE}/coverage`, { method: "PATCH", json: input });

function photoPart(photo: PickedPhoto, name: string) {
  const type = photo.mimeType ?? "image/jpeg";
  const ext = type.split("/")[1] === "jpeg" ? "jpg" : (type.split("/")[1] ?? "jpg");
  return { uri: photo.uri, name: photo.fileName ?? `${name}.${ext}`, type } as unknown as Blob;
}

/** Adds a vehicle, or (with an id) sends a rejected one again with new photos or details. */
export function saveVehicle(input: { id?: string; type: string; plateNumber: string; photo?: PickedPhoto | null; licence?: PickedPhoto | null }) {
  const form = new FormData();
  form.append("type", input.type);
  form.append("plateNumber", input.plateNumber);
  if (input.photo) form.append("photo", photoPart(input.photo, "vehicle"));
  if (input.licence) form.append("licence", photoPart(input.licence, "licence"));
  return api<KycState>(input.id ? `${BASE}/vehicles/${encodeURIComponent(input.id)}` : `${BASE}/vehicles`, { method: "POST", body: form });
}

export const deleteVehicle = (id: string) => api<KycState>(`${BASE}/vehicles/${encodeURIComponent(id)}`, { method: "DELETE" });

export const saveGuarantor = (input: { fullName: string; phone: string; address: string; relationship: string }) => api<KycState>(`${BASE}/guarantor`, { method: "PUT", json: input });
export const resendGuarantor = () => api<KycState>(`${BASE}/guarantor`, { method: "POST", json: { action: "resend" } });

export const saveKycBusiness = (input: { registeredName: string; cacType: string; cacNumber: string; businessAddress?: string }) =>
  api<KycState>(`${BASE}/business`, { method: "PATCH", json: input });

export const acceptTerms = () => api<KycState>(`${BASE}/terms`, { method: "POST", json: {} });
export const submitKyc = () => api<KycState>(`${BASE}/submit`, { method: "POST", json: {} });
