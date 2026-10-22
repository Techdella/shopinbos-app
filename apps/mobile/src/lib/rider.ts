import "expo-sqlite/localStorage/install";
import { ApiError, API_URL } from "./api";

// The Riders app inside the mobile app. Riders don't have a Shopinbos account: their dispatcher shares a private
// link (…/rider/<token>) and that token is the key, kept on this phone and sent as X-Rider-Token to
// /api/mobile/logistics/rider (same data and actions as the web Riders app).

const TOKEN_KEY = "shopinbos.rider.token";

export function riderToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveRiderToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable: the rider opens their link again next time.
  }
}

export function forgetRiderToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WELCOMED_KEY);
  } catch {
    // Nothing stored.
  }
}

// First run: "{Company} added you as a rider" and the language picker, once per rider on this phone.
const WELCOMED_KEY = "shopinbos.rider.welcomed";

export function riderWelcomed(riderId: string) {
  try {
    return localStorage.getItem(WELCOMED_KEY) === riderId;
  } catch {
    return true;
  }
}

export function markRiderWelcomed(riderId: string) {
  try {
    localStorage.setItem(WELCOMED_KEY, riderId);
  } catch {
    // Storage unavailable: the welcome shows again next time, which is harmless.
  }
}

// "Take this job" has nothing to tell the server (the company already gave the job to this rider): the app remembers
// it on this phone so Today shows it as the job in hand ("On a job") instead of a new one.
const TAKEN_KEY = "shopinbos.rider.taken";

export function takenJobs(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(TAKEN_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function markJobTaken(jobId: string) {
  try {
    localStorage.setItem(TAKEN_KEY, JSON.stringify([jobId, ...takenJobs().filter((id) => id !== jobId)].slice(0, 30)));
  } catch {
    // Storage unavailable: the job shows as new again, and taking it again is harmless.
  }
}

export interface RiderDrop {
  id: string;
  status: string;
  address: string;
  area: string;
  buyerName: string | null;
  buyerPhone: string | null;
  collect: number;
  /** What this drop pays. */
  fee?: number;
  item: string;
  hasProof: boolean;
  /** "Lekki": the known area the address names, when there is one. */
  areaShort?: string | null;
  /** The shop has a 4-digit pickup code to give the rider (the app never gets the code itself). */
  hasPickupCode?: boolean;
  /** "SB-2041": the shop's order number, to ask for at pickup. null for bookings without a shop order. */
  orderNumber?: string | null;
  /** Where the drop-off is, when the address could be placed on the map (only for the job in hand). */
  dropLat?: number | null;
  dropLng?: number | null;
}

export interface RiderRun {
  key: string;
  pickupName: string;
  pickupAddress: string;
  /** Supplier pickups: "Pick up 12–4pm today". */
  pickupWindow?: string | null;
  /** Straight-line km from the rider's last known spot. */
  pickupKm?: number | null;
  /** "Yaba": the known area of the pickup address. */
  pickupArea?: string | null;
  /** The shop's phone (E.164), for "Call" at pickup. */
  pickupPhone?: string | null;
  /** Where the pickup is, for the map (null until the address has been placed). */
  pickupLat?: number | null;
  pickupLng?: number | null;
  fees: number;
  drops: RiderDrop[];
}

export interface RiderWeekDelivery {
  id: string;
  from: string;
  to: string;
  deliveredAt: string;
  amount: number;
}

export interface RiderOverview {
  rider: { id?: string; name: string; partnerName: string; partnerPhone: string | null; online: boolean; plate?: string | null; language?: string | null };
  earnedToday: number;
  /** The partner set this rider's pay, so the amounts are earnings rather than delivery fees (older servers leave it out). */
  paySet?: boolean;
  dropsDone: number;
  cashInHand: number;
  /** This week (Monday 00:00 Lagos onwards): total earned, deliveries and the list. */
  week?: { total: number; count: number; deliveries: RiderWeekDelivery[] };
  runs: RiderRun[];
}

async function riderFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = riderToken();
  if (!token) throw new ApiError("Open the Riders app link your dispatcher sent you.", 401);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/mobile/logistics/rider${path}`, { ...init, headers: { Accept: "application/json", "X-Rider-Token": token, ...(init.headers as Record<string, string> | undefined) } });
  } catch {
    throw new ApiError("We couldn't reach Shopinbos. Check your connection and try again.", 0);
  }
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string; code?: string } } | null;
  if (!response.ok) throw new ApiError(body?.error?.message ?? "Something went wrong. Please try again.", response.status, body?.error?.code);
  return body?.data as T;
}

export const fetchRider = () => riderFetch<RiderOverview>("");

export type RiderAction =
  | { action: "online"; online: boolean }
  | { action: "start_run"; jobIds: string[]; codes?: Record<string, string> }
  | { action: "delivered"; jobId: string; code: string; recipientName?: string | null; codCollected?: number | null; codMethod?: "cash" | "transfer" | null }
  | { action: "failed"; jobId: string; reason: string }
  | { action: "skip"; jobId: string }
  | { action: "help"; jobId: string; reason: string }
  | { action: "check_code"; jobId: string; code: string }
  | { action: "language"; language: "en" | "pcm" | "yo" | "ha" | "ig" };

export const riderAction = (body: RiderAction) =>
  riderFetch<{ done: true }>("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function uploadRiderProof(jobId: string, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  form.append("jobId", jobId);
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `proof.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  return riderFetch<{ proofUrl: string }>("/proof", { method: "POST", body: form });
}

export interface RiderLocationPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** Epoch ms when the phone took the reading. */
  at: number;
}

/** Sends queued locations (lib/rider-location.ts). tracking: false means stop: the rider is offline with no job. */
export const sendRiderLocations = (points: RiderLocationPoint[]) =>
  riderFetch<{ saved: number; tracking: boolean }>("/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points }) });

// Riders sign in with their number and a code (POST /api/mobile/rider-sign-in), as well as with the link. The answer
// is a Riders app key, kept and sent exactly like a link's token (signing in replaces the partner's old link).

export interface RiderCodeSent {
  challenge: string;
  channel: string;
  expiresAt: string;
  /** Seconds before another code can be sent. */
  resendAfter: number;
}

async function riderSignIn<T>(body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/mobile/rider-sign-in`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("We couldn't reach Shopinbos. Check your connection and try again.", 0);
  }
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string; code?: string } } | null;
  if (!response.ok) throw new ApiError(json?.error?.message ?? "Something went wrong. Please try again.", response.status, json?.error?.code);
  return json?.data as T;
}

export const sendRiderSignInCode = (phone: string, via?: "whatsapp" | "sms") => riderSignIn<RiderCodeSent>({ phone, via });

export const checkRiderSignInCode = (phone: string, challenge: string, code: string) =>
  riderSignIn<{ token: string; name: string; partnerName: string }>({ phone, challenge, code });
