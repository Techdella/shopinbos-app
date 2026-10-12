import type { VerificationDoc } from "@shared/verification-docs";
import { api } from "./api";

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
  buyer: { name: string; phone: string | null; address: string } | null;
}

export interface DispatchRider {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  /** Jobs the rider is carrying now. The server sends riders best first: free and out, then busy, then offline. */
  openJobs?: number;
}

export interface LogisticsOverview {
  partner: { name: string; city: string; areas: string; logoUrl: string | null; verificationStatus: string; onboarded: boolean; taking: boolean };
  firstName: string;
  deliveredToday: number;
  earnedToday: number;
  counts: { new: number; quotes: number; active: number; issues: number };
  newJobs: Job[];
  riders: { total: number; out: number; offline: number };
  riderList: DispatchRider[];
  cashToPayIn: number;
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
  | { action: "decline" }
  | { action: "assign"; riderId: string | null }
  | { action: "status"; to: "confirmed" | "picked_up" | "in_transit" | "delivered" | "failed"; code?: string | null; recipientName?: string | null; codCollected?: number | null; codMethod?: "cash" | "transfer" | null; failedReason?: string | null };

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
  openJobs: number;
  deliveredToday: number;
  earnedToday: number;
}

export const fetchRiders = () => api<{ riders: RiderRow[] }>("/api/mobile/logistics/riders");

/** Add a rider with just a name and WhatsApp number. Returns their Riders app link and a ready WhatsApp invite. */
export const addRider = (input: { name: string; whatsapp: string }) =>
  api<{ id: string; name: string; url: string; whatsapp: string; inviteUrl: string }>("/api/mobile/logistics/riders", { method: "POST", json: input });

/** The "Taking new jobs" switch. */
export const setTakingJobs = (taking: boolean) => api<{ taking: boolean }>("/api/mobile/logistics/taking", { method: "POST", json: { taking } });

export interface Earnings {
  today: { amount: number; jobs: number };
  week: { amount: number; jobs: number };
  month: { amount: number; jobs: number };
  cashToPayIn: number;
  remittances: Array<{ id: string; amount: number; method: string; reference: string | null; createdAt: string }>;
  recent: Array<{ id: string; ref: string; from: string; to: string; rider: string | null; deliveredAt: string | null; amount: number }>;
  bank: { bankName: string; account: string; accountName: string; ready: boolean } | null;
}

export const fetchEarnings = () => api<Earnings>("/api/mobile/logistics/earnings");

export interface LogisticsMe {
  partner: { displayName: string; companyName: string; verificationStatus: string; verificationDocuments: VerificationDoc[]; trustScore: number };
  user: { name: string; email: string | null } | null;
}

export const fetchLogisticsMe = () => api<LogisticsMe>("/api/logistics/me");
