// Peggy helping suppliers, delivery partners and sellers get set up (dashboard chat and voice): the question she
// asks for each step, and the answers she can save for them. Pure, unit-tested in tests/setup-peggy.test.mjs.

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
  | { type: "add_coverage"; areas: string[] }
  | { type: "set_base_price"; naira: number }
  | { type: "set_description"; text: string };

const ACTIONS_BY_ROLE: Record<SetupRole, SetupAction["type"][]> = {
  supplier: ["save_pickup_address", "set_description"],
  logistics_partner: ["add_pickup_point", "add_coverage", "set_base_price", "set_description"],
  seller: [],
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
      const areas = (Array.isArray(a.areas) ? a.areas : []).map((v) => text(v, 60)).filter(Boolean).slice(0, 30);
      if (areas.length) out.push({ type: "add_coverage", areas });
    } else if (a.type === "set_base_price") {
      const naira = Math.round(Number(a.naira));
      if (Number.isFinite(naira) && naira >= 200 && naira <= 500_000) out.push({ type: "set_base_price", naira });
    } else if (a.type === "set_description") {
      const value = text(a.text, 600);
      if (value.length >= 10) out.push({ type: "set_description", text: value });
    }
  }
  return out;
}

/** What Peggy says she saved, shown under her reply. */
export function actionLabel(action: SetupAction) {
  if (action.type === "save_pickup_address") return `Saved your pickup address: ${action.address}`;
  if (action.type === "add_pickup_point") return `Added pickup point "${action.name}": ${action.address}, ${action.state}`;
  if (action.type === "add_coverage") return `Added delivery areas: ${action.areas.join(", ")}`;
  if (action.type === "set_base_price") return `Set your starting price to ₦${action.naira.toLocaleString("en-NG")}`;
  return "Saved your business description";
}
