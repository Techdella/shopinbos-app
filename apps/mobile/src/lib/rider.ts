import "expo-sqlite/localStorage/install";
import { ApiError, API_URL, send } from "./api";
import { filePart, preparePhoto, type PhotoInput } from "./upload-photo";
import type { RiderInboxSummary } from "@shared/logistics-chats";
import type { RiderNotifyPrefs } from "@shared/message-notifications";

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
  /** Cash to collect: only older jobs. Pay on delivery is paid in the app at the door (payInApp). */
  collect: number;
  /** Pay on delivery: the customer pays in the app and gets the code; `url` (their order page) is the QR code. */
  payInApp?: { amount: number; paid: boolean; url: string } | null;
  /** What this drop pays. */
  fee?: number;
  item: string;
  hasProof: boolean;
  /** A shop's or supplier's parcel: the rider photographs it sealed at pickup (needed before "Got the parcel"). */
  needsPickupPhoto?: boolean;
  hasPickupPhoto?: boolean;
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
    response = await send(`${API_URL}/api/mobile/logistics/rider${path}`, { ...init, headers: { Accept: "application/json", "X-Rider-Token": token, ...(init.headers as Record<string, string> | undefined) } });
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
  | { action: "language"; language: "en" | "pcm" | "yo" | "ha" | "ig" }
  | { action: "pay_link"; jobId: string }
  | { action: "plate"; plate: string };

export const riderAction = (body: RiderAction) =>
  riderFetch<{ done: true }>("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** A photo of the sealed parcel: "handover" (every drop) or "pickup" (shop and supplier parcels, before "Got the parcel"). */
export async function uploadRiderProof(jobId: string, photo: PhotoInput, kind: "handover" | "pickup" = "handover") {
  // Shrunk on the phone first (a camera photo can be over the ~4.5 MB upload limit).
  const ready = await preparePhoto(photo, { base: "proof" });
  const form = new FormData();
  form.append("jobId", jobId);
  form.append("kind", kind);
  form.append("file", filePart(ready));
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

// Rider chat (shared/rider-chat.ts): with the delivery company, or with the shop on a job the rider carries.
export interface RiderChatMessage {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
}

export function riderMessages(input: { with: "company" | "shop"; job?: string }) {
  const query = new URLSearchParams({ with: input.with, ...(input.job ? { job: input.job } : {}) });
  return riderFetch<{ messages: RiderChatMessage[]; with: string | null }>(`/messages?${query.toString()}`);
}

export const sendRiderMessage = (input: { with: "company" | "shop"; job?: string; body: string }) =>
  riderFetch<{ message: RiderChatMessage }>("/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });

/** Unread messages from the company and the shops on the rider's jobs (the "Messages" card on Today). */
export const fetchRiderMessageSummary = () => riderFetch<RiderInboxSummary>("/messages/summary");

/** The rider's own rating from customers (Me). */
export const fetchRiderRating = () => riderFetch<{ rating: { average: number; count: number } | null }>("/reviews");

/** The customer's review link for a delivered job, and their number to WhatsApp it to. */
export const riderReviewLink = (jobId: string) => riderFetch<{ url: string; phone: string | null }>(`/reviews?job=${encodeURIComponent(jobId)}`);

/** The rider's notification settings (Me › Notifications): which messages buzz the phone, and quiet hours. */
export const fetchRiderNotify = () => riderFetch<RiderNotifyPrefs>("/notifications");

export const saveRiderNotify = (change: { company?: boolean; shops?: boolean; quiet?: Partial<RiderNotifyPrefs["quiet"]> }) =>
  riderFetch<RiderNotifyPrefs>("/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
