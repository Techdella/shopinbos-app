// Preorders on the phone: the form (seller and supplier products), what a preorder box, line, pill and button say,
// and the ship-date choices. The rules are shared/preorder.ts (the same as the web); this file only shapes them for
// the screens. Words are m_ui "preorder.*". Relative imports only, so tests/mobile-preorder.test.mjs runs it in Node.
//
// Money: Shopinbos never holds preorder money (no escrow). Buyers pay as for any order; the seller or supplier writes
// a promise (`note`) shown beside the button.

import { parsePreorderInput, preorderDay, preorderState, PREORDER_NOTE_MAX, type PreorderState } from "../../../../shared/preorder.ts";

export type { PreorderState };
export { PREORDER_NOTE_MAX };

/** The app-language translator (useT(..., "m_ui")). Optional: without it the words are English. */
export type Say = { dynamic(key: string, fallback?: string, vars?: Record<string, string | number | null | undefined>): string };

const say = (t: Say | undefined, key: string, english: string, vars?: Record<string, string | number>) => (t ? t.dynamic(key, english, vars) : english);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Saved preorder settings as the phone gets them: a product's own (`shipsOn` YYYY-MM-DD) or a supplier listing's
 * columns (`preorderEnabled`, `preorderShipsAt`…). */
export interface SavedPreorder {
  enabled?: boolean | null;
  shipsOn?: string | null;
  limit?: number | null;
  taken?: number | null;
  note?: string | null;
}

/** What the form edits. `limit` is the typed text (empty: no limit). */
export interface PreorderForm {
  enabled: boolean;
  shipsOn: string | null;
  limit: string;
  note: string;
}

/** The body the APIs take as `preorder` (PreorderInputSchema in src/lib/schemas). */
export interface PreorderBody {
  enabled: boolean;
  shipsAt: string | null;
  limit: number | null;
  note: string | null;
}

export type PreorderProblem = "date" | "past" | "limit";

/** A supplier listing's columns (GET /api/supplier/products[/id]) as saved settings. */
export function savedFromColumns(row: { preorderEnabled?: boolean | null; preorderShipsAt?: string | Date | null; preorderLimit?: number | null; preorderTaken?: number | null; preorderNote?: string | null } | null | undefined): SavedPreorder {
  return { enabled: Boolean(row?.preorderEnabled), shipsOn: preorderDay(row?.preorderShipsAt ?? null), limit: row?.preorderLimit ?? null, taken: row?.preorderTaken ?? 0, note: row?.preorderNote ?? null };
}

/** The preorder state of saved settings (the supplier's own listing: ship date, places left, promise). */
export function stateOf(saved: SavedPreorder): PreorderState {
  return preorderState({ enabled: saved.enabled, shipsAt: saved.shipsOn, limit: saved.limit, taken: saved.taken, note: saved.note });
}

export function preorderFormFrom(saved: SavedPreorder | null | undefined): PreorderForm {
  return { enabled: Boolean(saved?.enabled), shipsOn: saved?.shipsOn ?? null, limit: saved?.limit ? String(saved.limit) : "", note: saved?.note ?? "" };
}

function problemOf(message: string): PreorderProblem {
  if (/passed/i.test(message)) return "past";
  if (/limit/i.test(message)) return "limit";
  return "date";
}

/**
 * What to send as `preorder`: checked with the same rules as the server (shared/preorder.ts parsePreorderInput: a
 * real date, not past unless already saved; a whole cap from 1). `patch` is null when nothing changed.
 */
export function preorderPatch(form: PreorderForm, saved: SavedPreorder | null | undefined, now: Date = new Date()): { ok: true; patch: PreorderBody | null } | { ok: false; problem: PreorderProblem } {
  const limitText = form.limit.replace(/[,\s]/g, "");
  const parsed = parsePreorderInput({ enabled: form.enabled, shipsAt: form.shipsOn, limit: limitText || null, note: form.note }, now, saved?.shipsOn ?? null);
  if (!parsed.ok) return { ok: false, problem: problemOf(parsed.message) };
  const body: PreorderBody = { enabled: parsed.value.preorderEnabled, shipsAt: preorderDay(parsed.value.preorderShipsAt), limit: parsed.value.preorderLimit, note: parsed.value.preorderNote };
  const before = preorderFormFrom(saved);
  const same = body.enabled === before.enabled && body.shipsAt === (before.shipsOn ?? null) && body.limit === (before.limit ? Number(before.limit) : null) && (body.note ?? "") === before.note.trim();
  return { ok: true, patch: same ? null : body };
}

/** The m_ui key for a form problem. */
export const PREORDER_PROBLEM_KEY: Record<PreorderProblem, string> = { date: "preorder.problem.date", past: "preorder.problem.past", limit: "preorder.problem.limit" };

/** YYYY-MM-DD `days` from today (UTC, like the server's check). */
export function dayFromNow(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD (UTC). */
export const today = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/** Quick ship-date chips: in 1 week, 2 weeks, 1 month. */
export const SHIP_CHOICES = [
  { key: "preorder.in1w", english: "In 1 week", days: 7 },
  { key: "preorder.in2w", english: "In 2 weeks", days: 14 },
  { key: "preorder.in1m", english: "In 1 month", days: 30 },
] as const;

/** "12 Dec" (or "12 Dec 2027" in another year), with the month in the app language (m_ui day.month.N). */
export function shipDayText(shipsOn: string, now: Date = new Date(), t?: Say): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shipsOn);
  if (!match) return shipsOn;
  const [, year, month, day] = match;
  const index = Number(month) - 1;
  const text = `${Number(day)} ${say(t, `day.month.${index}`, MONTHS[index] ?? month)}`;
  return Number(year) === now.getUTCFullYear() ? text : `${text} ${year}`;
}

/** The line under a preorder: "Ships from 12 Dec · 8 left", "Ships soon", "Preorders are full" (in the app language;
 * the same rules as shared/preorder.ts preorderLine). Null when preorders are off. */
export function preorderLineText(state: PreorderState | null | undefined, now: Date = new Date(), t?: Say): string | null {
  if (!state?.on) return null;
  if (!state.open) return say(t, "preorder.full", "Preorders are full");
  const day = state.shipsOn && state.shipsOn >= today(now) ? say(t, "preorder.shipsOn", `Ships from ${shipDayText(state.shipsOn, now, t)}`, { date: shipDayText(state.shipsOn, now, t) }) : say(t, "preorder.shipsSoon", "Ships soon");
  return state.left !== null && state.left <= 20 ? `${day} · ${say(t, "preorder.left", `${state.left} left`, { count: state.left })}` : day;
}

/** The marketplace button: "Preorder 20 for ₦240,000", or "Preorders are full" and off; also off past the places left. */
export function preorderButton(state: PreorderState, quantity: number, total: string, t?: Say): { label: string; disabled: boolean } {
  if (!state.open) return { label: say(t, "preorder.full", "Preorders are full"), disabled: true };
  const over = state.left !== null && quantity > state.left;
  return { label: say(t, "preorder.buy", `Preorder ${quantity.toLocaleString("en-NG")} for ${total}`, { count: quantity.toLocaleString("en-NG"), total }), disabled: over };
}

/** The pill on an order: "Preorder · 12 Dec", or "Preorder" without a date. Null for an ordinary order. */
export function preorderPillText(preorder: { shipsOn?: string | null } | null | undefined, now: Date = new Date(), t?: Say): string | null {
  if (!preorder) return null;
  return preorder.shipsOn ? say(t, "preorder.pillDate", `Preorder · ${shipDayText(preorder.shipsOn, now, t)}`, { date: shipDayText(preorder.shipsOn, now, t) }) : say(t, "preorder.pill", "Preorder");
}

/** A seller product sells the supplier's stock (no preorders of its own: shared/preorder.ts preorderSaveData). */
export function isDropshipProduct(product: { dropship?: unknown; fulfillmentType?: string | null; inventoryType?: string | null }): boolean {
  return Boolean(product.dropship) || product.fulfillmentType === "dropship" || product.inventoryType === "dropshipping";
}
