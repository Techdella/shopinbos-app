// Peggy helping suppliers, delivery partners and sellers get set up (dashboard chat and voice): the question she
// asks for each step, and the answers she can save for them. Pure, unit-tested in tests/setup-peggy.test.mjs.

import { coverageFrom } from "../../../shared/ng-places.ts";
import { formatArea, parseArea } from "../../../shared/delivery-market.ts";

export type SetupRole = "supplier" | "logistics_partner" | "seller";

/** Peggy's question for a step (no AI needed to start the conversation). */
export function stepQuestion(stepId: string, role: SetupRole, firstName: string) {
  const hi = firstName && firstName !== "there" ? `${firstName}, ` : "";
  const questions: Record<string, string> = {
    profile: role === "logistics_partner" ? `${hi}tell me about your delivery company: what's it called, which city are you based in, and what do you use (bikes, cars, vans)?` : `${hi}tell me about your business: what do you sell, and which city are you in?`,
    pickup: role === "logistics_partner" ? `${hi}where are your pickup points? Give me the address of an office or hub where parcels can be dropped or collected, and the opening hours.` : `${hi}where should riders collect orders from you? Send me the full pickup address (street, area and city).`,
    coverage: `${hi}which states and areas do you deliver to? For example: Lagos Island, Lekki, Ikeja, and Ibadan.`,
    rates: `${hi}what do you charge for a delivery within your city? A starting price in naira is enough for now.`,
    documents: `${hi}next is verification: upload your CAC certificate${role === "logistics_partner" ? " and insurance" : " and a few product photos"} on the Verification page. Want me to explain what's accepted?`,
    products: `${hi}let's add your first product. What's it called, what does it cost sellers, and how many do you have in stock?`,
    bank: `${hi}add the bank account you want to be paid into on the Wallet page. It must be in your name or your business's name.`,
    verified: `${hi}you've done your part: the Shopinbos team is checking your documents now. Anything else I can help with?`,
    store: `${hi}let's build your store with Rex. What do you sell, and what should the store be called?`,
    delivery: `${hi}where do you deliver to, and how much do you charge? I can set a starter delivery price for you.`,
    live: `${hi}you're nearly there: publish your store from Rex Studio when you're happy with it.`,
  };
  return questions[stepId] ?? `${hi}how can I help you get set up?`;
}

// ─── What Peggy can save from an answer ───────────────────────────────────────

export type SetupAction =
  | { type: "save_pickup_address"; address: string; city?: string }
  | { type: "add_pickup_point"; name: string; address: string; state: string; area?: string; hours?: string; phone?: string }
  /** areas: coverage tokens ("Lagos", "Ogun: Lafenwa"); label: what was said ("Abeokuta – Lafenwa, Kuto"). */
  | { type: "add_coverage"; areas: string[]; label?: string }
  | { type: "set_base_price"; naira: number }
  | { type: "set_description"; text: string }
  /** Anything else useful, always in English; "summary" is the end-of-call summary. Kept for the team. */
  | { type: "save_note"; text: string; kind: "note" | "summary" };

const ACTIONS_BY_ROLE: Record<SetupRole, SetupAction["type"][]> = {
  supplier: ["save_pickup_address", "add_coverage", "set_description", "save_note"],
  logistics_partner: ["add_pickup_point", "add_coverage", "set_base_price", "set_description", "save_note"],
  seller: ["save_pickup_address", "add_coverage", "set_description", "save_note"],
};

export function actionsFor(role: SetupRole) {
  return ACTIONS_BY_ROLE[role];
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keeps only well-formed actions this role may take (the model's output is never trusted as is). */
export function cleanActions(raw: unknown, role: SetupRole): SetupAction[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(ACTIONS_BY_ROLE[role]);
  const out: SetupAction[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (!allowed.has(a.type as SetupAction["type"])) continue;
    if (a.type === "save_pickup_address") {
      const address = text(a.address, 300);
      if (address.length >= 8) out.push({ type: "save_pickup_address", address, ...(text(a.city, 80) ? { city: text(a.city, 80) } : {}) });
    } else if (a.type === "add_pickup_point") {
      const address = text(a.address, 300);
      const state = text(a.state, 60);
      if (address.length >= 8 && state) out.push({ type: "add_pickup_point", name: text(a.name, 80) || "Pickup point", address, state, ...(text(a.area, 80) ? { area: text(a.area, 80) } : {}), ...(text(a.hours, 80) ? { hours: text(a.hours, 80) } : {}), ...(text(a.phone, 30) ? { phone: text(a.phone, 30) } : {}) });
    } else if (a.type === "add_coverage") {
      const coverage = coverageTokens(a);
      if (coverage.tokens.length) out.push({ type: "add_coverage", areas: coverage.tokens, ...(coverage.label ? { label: coverage.label } : {}) });
    } else if (a.type === "set_base_price") {
      const naira = Math.round(Number(a.naira));
      if (Number.isFinite(naira) && naira >= 200 && naira <= 500_000) out.push({ type: "set_base_price", naira });
    } else if (a.type === "set_description") {
      const value = text(a.text, 600);
      if (value.length >= 10) out.push({ type: "set_description", text: value });
    } else if (a.type === "save_note") {
      const value = text(a.text, 1500);
      if (value.length >= 3) out.push({ type: "save_note", text: value, kind: a.kind === "summary" ? "summary" : "note" });
    }
  }
  return out;
}

/**
 * Coverage from an action: a city with its neighbourhoods, a state, or a list of places, through the gazetteer
 * (shared/ng-places.ts), so "Lafenwa" in Abeokuta saves as "Ogun: Lafenwa". Places already written as tokens
 * ("Lagos: Ikeja", "South-West", "Nationwide") keep their meaning; anything we can't place comes back in `unknown`.
 */
export function coverageTokens(a: Record<string, unknown>) {
  const areas = (Array.isArray(a.areas) ? a.areas : []).map((v) => text(v, 60)).filter(Boolean).slice(0, 30);
  const known: string[] = [];
  const rest: string[] = [];
  for (const area of areas) {
    const token = parseArea(area);
    if (token && (area.includes(":") || token.kind === "region" || token.kind === "nationwide")) known.push(formatArea(token));
    else rest.push(area);
  }
  const city = text(a.city, 60) || null;
  const state = text(a.state, 40) || null;
  const placed = rest.length || (!known.length && (city || state)) ? coverageFrom({ city, state, areas: rest }) : { tokens: [] as string[], label: "", unknown: [] as string[] };
  // Names the gazetteer doesn't know but the market rules do ("Maryland" → "Lagos: Maryland").
  const unknown: string[] = [];
  for (const name of placed.unknown) {
    const token = parseArea(name);
    if (token) known.push(formatArea(token));
    else unknown.push(name);
  }
  const tokens = [...new Set([...placed.tokens, ...known])];
  const label = [placed.label, ...known.filter((token) => !placed.tokens.includes(token))].filter(Boolean).join(", ");
  return { tokens, label, unknown };
}

/** What Peggy says she saved, shown under her reply. */
export function actionLabel(action: SetupAction) {
  if (action.type === "save_pickup_address") return `Saved your pickup address: ${action.address}`;
  if (action.type === "add_pickup_point") return `Added pickup point "${action.name}": ${action.address}, ${action.state}`;
  if (action.type === "add_coverage") return `Added delivery areas: ${action.label || action.areas.join(", ")}`;
  if (action.type === "set_base_price") return `Set your starting price to ₦${action.naira.toLocaleString("en-NG")}`;
  if (action.type === "save_note") return action.kind === "summary" ? "Saved a summary of the call for the team" : "Saved a note for the team";
  return "Saved your business description";
}

/** What the phone shows for a saved action (its words are in the app's catalogs; `detail` is the data). */
export type SavedKind = "pickup_address" | "pickup_point" | "coverage" | "price" | "description" | "note" | "summary";
export interface SavedItem {
  kind: SavedKind;
  detail: string;
}

export function savedItem(action: SetupAction): SavedItem {
  if (action.type === "save_pickup_address") return { kind: "pickup_address", detail: action.address };
  if (action.type === "add_pickup_point") return { kind: "pickup_point", detail: `${action.name}: ${action.address}` };
  if (action.type === "add_coverage") return { kind: "coverage", detail: action.label || action.areas.join(", ") };
  if (action.type === "set_base_price") return { kind: "price", detail: `₦${action.naira.toLocaleString("en-NG")}` };
  if (action.type === "save_note") return { kind: action.kind, detail: action.text };
  return { kind: "description", detail: action.text };
}
