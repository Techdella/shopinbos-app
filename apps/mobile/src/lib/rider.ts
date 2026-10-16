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
  } catch {
    // Nothing stored.
  }
}

export interface RiderDrop {
  id: string;
  status: string;
  address: string;
  area: string;
  /** Google Maps directions from the server (the buyer's exact pin when they picked one). Older servers omit it. */
  mapUrl?: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  collect: number;
  item: string;
  hasProof: boolean;
}

export interface RiderRun {
  key: string;
  pickupName: string;
  pickupAddress: string;
  pickupMapUrl?: string | null;
  /** Supplier pickups: "Pick up 12–4pm today". */
  pickupWindow?: string | null;
  fees: number;
  drops: RiderDrop[];
}

export interface RiderOverview {
  rider: { name: string; partnerName: string; partnerPhone: string | null; online: boolean };
  earnedToday: number;
  dropsDone: number;
  cashInHand: number;
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
  | { action: "start_run"; jobIds: string[] }
  | { action: "delivered"; jobId: string; code: string; recipientName?: string | null; codCollected?: number | null; codMethod?: "cash" | "transfer" | null }
  | { action: "failed"; jobId: string; reason: string };

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
