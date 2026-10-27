// Preorders: selling a product before the stock arrives. Pure (no imports): shared by the seller's product form,
// the supplier's product form, the storefront, the marketplace and checkout, and tests/preorder.test.mjs.
//
// Two places use it:
//   - A supplier takes preorders on a marketplace listing (SupplierProduct): shops order stock now and the supplier
//     ships from the date it gives. The shop pays the supplier as for any bulk order.
//   - A seller takes preorders on a store product (StoreProduct): shoppers order now, the seller ships from the date.
//
// Money: Shopinbos never holds it. A preorder is paid like any other order (each share straight to its owner's
// bank), so there is no escrow. What protects the buyer is what the seller promises in plain words (`note`: when it
// ships, what happens if it's late) and an optional cap on how many are taken. The seller runs their business.

export interface PreorderSettings {
  enabled?: boolean | null;
  /** When it ships (or the stock arrives). Null: "soon". */
  shipsAt?: Date | string | null;
  /** Most units taken as preorders; null: no cap. */
  limit?: number | null;
  /** Units already taken (orders that still hold them). */
  taken?: number | null;
  /** The seller's / supplier's own promise to buyers, shown beside the button. */
  note?: string | null;
}

/** Longest note: a couple of sentences on a product page. */
export const PREORDER_NOTE_MAX = 280;
/** The highest cap anyone can set. */
export const PREORDER_LIMIT_MAX = 100_000;

export interface PreorderState {
  /** Preorders are switched on. */
  on: boolean;
  /** Buyers can preorder now (on, and the cap isn't reached). */
  open: boolean;
  /** Units still open under the cap; null: no cap. */
  left: number | null;
  /** The ship date as YYYY-MM-DD, or null. */
  shipsOn: string | null;
  note: string | null;
}

function whole(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** YYYY-MM-DD of a date (UTC), or null for anything that isn't one. */
export function preorderDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function preorderState(settings: PreorderSettings | null | undefined): PreorderState {
  const on = Boolean(settings?.enabled);
  const limit = typeof settings?.limit === "number" && Number.isFinite(settings.limit) && settings.limit > 0 ? Math.trunc(settings.limit) : null;
  const left = limit === null ? null : Math.max(0, limit - whole(settings?.taken));
  const note = settings?.note?.trim() ? settings.note.trim().slice(0, PREORDER_NOTE_MAX) : null;
  return { on, open: on && (left === null || left > 0), left, shipsOn: on ? preorderDay(settings?.shipsAt) : null, note: on ? note : null };
}

/** "12 Dec" (or "12 Dec 2027" when it isn't this year): the ship date in words. */
export function shipDateLabel(shipsOn: string, now: Date = new Date(), locale = "en-NG"): string {
  const date = new Date(`${shipsOn}T12:00:00Z`);
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** The line under a preorder button: "Ships from 12 Dec · 8 left", "Ships soon", "Preorders are full". */
export function preorderLine(state: PreorderState, now: Date = new Date()): string | null {
  if (!state.on) return null;
  if (!state.open) return "Preorders are full";
  const day = state.shipsOn && state.shipsOn >= now.toISOString().slice(0, 10) ? `Ships from ${shipDateLabel(state.shipsOn, now)}` : "Ships soon";
  return state.left !== null && state.left <= 20 ? `${day} · ${state.left} left` : day;
}

/** The most one bag line may hold: what's left under the cap, else no limit. */
export function preorderMaxQuantity(state: PreorderState): number | null {
  return state.open ? state.left : 0;
}

export type PreorderInput = { enabled?: unknown; shipsAt?: unknown; limit?: unknown; note?: unknown };

export type ParsedPreorder =
  | { ok: true; value: { preorderEnabled: boolean; preorderShipsAt: Date | null; preorderLimit: number | null; preorderNote: string | null } }
  | { ok: false; message: string };

/**
 * The preorder fields to save from a form or API body. A ship date must be a real date (YYYY-MM-DD or ISO); a cap
 * a whole number from 1; the note is trimmed and capped. Switching preorders off keeps the other values for next time.
 * `savedShipsAt`: the date already saved, which may have passed.
 */
export function parsePreorderInput(input: PreorderInput, now: Date = new Date(), savedShipsAt?: Date | string | null): ParsedPreorder {
  const enabled = input.enabled === true || input.enabled === "true" || input.enabled === "on";
  let shipsAt: Date | null = null;
  if (input.shipsAt !== undefined && input.shipsAt !== null && input.shipsAt !== "") {
    if (typeof input.shipsAt !== "string" && !(input.shipsAt instanceof Date)) return { ok: false, message: "Choose a valid ship date." };
    const raw = input.shipsAt instanceof Date ? input.shipsAt : new Date(/^\d{4}-\d{2}-\d{2}$/.test(input.shipsAt) ? `${input.shipsAt}T12:00:00Z` : input.shipsAt);
    if (Number.isNaN(raw.getTime())) return { ok: false, message: "Choose a valid ship date." };
    // A date already saved may have passed (an edit that doesn't touch it still saves); a new one can't be past.
    if (enabled && preorderDay(raw) !== preorderDay(savedShipsAt) && preorderDay(raw)! < now.toISOString().slice(0, 10)) return { ok: false, message: "The ship date has passed. Choose a date from today." };
    shipsAt = raw;
  }
  let limit: number | null = null;
  if (input.limit !== undefined && input.limit !== null && input.limit !== "") {
    const value = Number(input.limit);
    if (!Number.isInteger(value) || value < 1 || value > PREORDER_LIMIT_MAX) return { ok: false, message: "The preorder limit must be a whole number from 1." };
    limit = value;
  }
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, PREORDER_NOTE_MAX) : null;
  return { ok: true, value: { preorderEnabled: enabled, preorderShipsAt: shipsAt, preorderLimit: limit, preorderNote: note } };
}

/** What a preorder line says on an order: { preorder: true, shipsOn } (saved on the order's item, shown to the seller). */
export function preorderItemTag(state: PreorderState): { preorder: true; shipsOn: string | null } | null {
  return state.on ? { preorder: true, shipsOn: state.shipsOn } : null;
}

/** Whether an order's saved items include a preorder line. */
export function orderHasPreorder(items: unknown): boolean {
  return Array.isArray(items) && items.some((item) => Boolean(item && typeof item === "object" && (item as Record<string, unknown>).preorder === true));
}

/** The earliest ship date among an order's preorder lines (YYYY-MM-DD), or null. */
export function orderPreorderShipsOn(items: unknown): string | null {
  if (!Array.isArray(items)) return null;
  const days = items.flatMap((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    return row?.preorder === true && typeof row.shipsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.shipsOn) ? [row.shipsOn] : [];
  });
  return days.sort()[0] ?? null;
}

/** A ready-to-post message for sharing a preorder on WhatsApp, Instagram, X or Facebook. */
export function preorderShareText(input: { name: string; price?: string | null; shipsOn: string | null; url: string; now?: Date }): string {
  const when = input.shipsOn ? ` Ships from ${shipDateLabel(input.shipsOn, input.now ?? new Date())}.` : "";
  const price = input.price ? ` ${input.price}.` : "";
  return `Preorder now: ${input.name}.${price}${when} Reserve yours before they're gone 👉 ${input.url}`;
}

/**
 * The columns to save for a product's preorder settings. Dropship products can't take preorders (they sell the
 * supplier's stock), so they are saved switched off. Switching preorders back on starts a fresh count.
 */
export function preorderSaveData(value: Extract<ParsedPreorder, { ok: true }>["value"], options: { dropship?: boolean; wasEnabled?: boolean } = {}) {
  const enabled = value.preorderEnabled && !options.dropship;
  return { ...value, preorderEnabled: enabled, ...(enabled && !options.wasEnabled ? { preorderTaken: 0 } : {}) };
}
