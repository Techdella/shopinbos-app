// "Call Peggy" in the app: the pure parts (unit-tested in tests/peggy-call.test.mjs). Where each thing Peggy saved
// can be edited, where to go after the call (the next setup step that's still missing, never silently the
// documents step), the setup wizards' own steps, and whether this build can run the call at all.

import type { AppRole } from "./partner-pure";
import { findScreen, openScreenReply, type PeggyScreen } from "../../../../shared/peggy-screens.ts";

export type CallRole = Exclude<AppRole, "admin">;
export type SavedKind = "pickup_address" | "pickup_point" | "coverage" | "price" | "description" | "note" | "summary";
export interface SavedItem {
  kind: SavedKind;
  /** The data: an address, "Abeokuta – Lafenwa, Kuto", "₦2,500", the note. */
  detail: string;
}
export interface SetupStepView {
  id: string;
  done: boolean;
}
export interface SetupView {
  done: number;
  total: number;
  next: string | null;
  steps: SetupStepView[];
}

/** The tools Peggy can call on the phone (src/lib/onboarding/peggy-call-tools.ts VOICE_TOOLS). */
export const CALL_TOOLS = ["save_pickup_address", "add_pickup_point", "add_coverage", "set_starting_price", "set_description", "save_note", "save_call_summary", "get_dashboard", "open_screen", "lookup_areas"] as const;

/**
 * Peggy's open_screen on the phone (run on the device, no server call): the allow-listed screen for this role
 * (shared/peggy-screens.ts), the route to push and her answer. Unknown screens are refused and nothing opens.
 */
export function openScreenOnPhone(role: CallRole, params: unknown): { screen: PeggyScreen | null; route: string | null; reply: string } {
  const asked = params && typeof params === "object" ? (params as Record<string, unknown>).screen : null;
  const screen = findScreen(role, asked);
  return { screen, route: screen?.app ?? null, reply: openScreenReply(screen, Boolean(screen)) };
}

/**
 * Whether this build can run the call: ElevenLabs' React Native SDK needs native WebRTC (LiveKit), which Expo Go
 * doesn't have, so the button hides there (and on the web build). There's no browser fallback.
 */
export function inAppCallPossible(env: { platform: string; expoGo: boolean }) {
  return (env.platform === "ios" || env.platform === "android") && !env.expoGo;
}

/** m_help keys for a saved item's line ("Peggy added coverage: {detail}"). */
export const savedKey = (kind: SavedKind) => `call.saved.${kind}` as const;

/** m_help key for a setup step's name. */
export const stepKey = (id: string) => `call.step.${id}` as const;
export const STEP_IDS = ["profile", "pickup", "coverage", "rates", "documents", "products", "bank", "verified", "store", "delivery", "live"] as const;

const EDIT: Record<CallRole, Partial<Record<SavedKind, string>>> = {
  logistics_partner: { coverage: "/logistics/coverage", price: "/logistics/rates", pickup_point: "/logistics/points", description: "/logistics/profile" },
  supplier: { pickup_address: "/supplier/setup?edit=pickup", coverage: "/supplier/setup?edit=where", description: "/supplier/account" },
  seller: { pickup_address: "/delivery/where", coverage: "/delivery/where", description: "/shop" },
};

/** Where to change something Peggy saved (null for notes: those are for the team). */
export function editPath(role: CallRole, kind: SavedKind): string | null {
  return EDIT[role][kind] ?? null;
}

const NEXT: Record<CallRole, Partial<Record<string, string>>> = {
  logistics_partner: { profile: "/logistics/profile", coverage: "/logistics/coverage", pickup: "/logistics/points", rates: "/logistics/rates", documents: "/logistics/verification", bank: "/logistics/payout" },
  supplier: { profile: "/supplier/setup?edit=biz", pickup: "/supplier/setup?edit=pickup", documents: "/supplier/verification", products: "/supplier/product/new", bank: "/supplier/setup?edit=bank" },
  seller: { store: "/start", products: "/start", delivery: "/start", bank: "/start", live: "/start" },
};

/** The screen for the next missing setup step, after the call (null when there's nothing left to do). */
export function nextStepPath(role: CallRole, next: string | null | undefined): string | null {
  if (!next) return null;
  return NEXT[role][next] ?? null;
}

/** Call length as m:ss. */
export function callClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
