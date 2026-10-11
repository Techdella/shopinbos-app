// Segment rules: what they look like, how to read them from the database, and how a contact is matched.
// Pure (no server imports) so the same code runs for the live count, campaign audiences, automation
// conditions and tests/behaviour.test.mjs.

export const SEGMENT_FIELDS = {
  spent: { label: "Total spent", ops: ["gte", "lte"], input: "money" },
  orders: { label: "Number of orders", ops: ["gte", "lte", "eq"], input: "number" },
  last_order: { label: "Last order", ops: ["within_days", "more_than_days", "never"], input: "days" },
  first_order: { label: "First order", ops: ["within_days", "more_than_days"], input: "days" },
  location: { label: "Location", ops: ["contains", "not_contains"], input: "text" },
  tag: { label: "Tag", ops: ["has", "not_has"], input: "tag" },
  source: { label: "Signed up through", ops: ["is", "is_not"], input: "source" },
  product: { label: "Product bought", ops: ["bought", "not_bought"], input: "product" },
  subscribed: { label: "Email marketing", ops: ["is_true", "is_false"], input: "none" },
  joined: { label: "Joined", ops: ["within_days", "more_than_days"], input: "days" },
  reachable: { label: "Can be reached by", ops: ["email", "phone"], input: "none" },
} as const;

export type SegmentField = keyof typeof SEGMENT_FIELDS;
export type SegmentOp = (typeof SEGMENT_FIELDS)[SegmentField]["ops"][number];

export const OP_LABEL: Record<SegmentOp, string> = {
  gte: "is at least",
  lte: "is at most",
  eq: "is exactly",
  within_days: "in the last",
  more_than_days: "more than",
  never: "never",
  contains: "includes",
  not_contains: "doesn't include",
  has: "has",
  not_has: "doesn't have",
  is: "is",
  is_not: "is not",
  bought: "bought",
  not_bought: "never bought",
  is_true: "subscribed",
  is_false: "not subscribed",
  email: "email",
  phone: "phone (SMS / WhatsApp)",
};

export const SOURCE_LABEL: Record<string, string> = {
  customer: "Bought, never subscribed",
  newsletter_form: "Sign-up form",
  popup: "Pop-up",
  checkout_optin: "Checkout",
  customer_account: "Customer account",
  lead_magnet: "Lead magnet",
  landing_page: "Landing page",
  manual_import: "Added by hand",
  csv_upload: "CSV import",
  api: "API",
  order: "Order",
};

export interface SegmentCondition {
  field: SegmentField;
  op: SegmentOp;
  value?: string | number | null;
  /** Display text for ids (the product name). */
  label?: string | null;
}

export interface SegmentRules {
  match: "all" | "any";
  conditions: SegmentCondition[];
}

/** One person the shop can market to: a subscriber, a buyer, or both (matched by email). */
export interface MarketingContact {
  email: string | null;
  phone: string | null;
  name: string | null;
  subscriberId: string | null;
  /** Subscriber status, or "customer" for a buyer with no subscriber row. */
  status: string;
  source: string;
  tags: string[];
  location: string;
  orders: number;
  spent: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  joinedAt: Date | null;
  productIds: string[];
  birthday: string | null;
  /** Agreed to texts (or is a buyer) and hasn't opted out. */
  smsOk: boolean;
  whatsappOk: boolean;
}

const DAY = 86_400_000;
const isField = (value: unknown): value is SegmentField => typeof value === "string" && value in SEGMENT_FIELDS;

/** Reads stored rules (new shape, or the old { minOrders, minSpent } JSON) into SegmentRules. */
export function normalizeRules(raw: unknown): SegmentRules {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const conditions: SegmentCondition[] = [];
  if (Array.isArray(value.conditions)) {
    for (const item of value.conditions) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      if (!isField(c.field)) continue;
      const ops = SEGMENT_FIELDS[c.field].ops as readonly string[];
      const op = typeof c.op === "string" && ops.includes(c.op) ? (c.op as SegmentOp) : (ops[0] as SegmentOp);
      const v = typeof c.value === "number" || typeof c.value === "string" ? c.value : null;
      conditions.push({ field: c.field, op, value: v, label: typeof c.label === "string" ? c.label : null });
    }
  } else {
    if (Number(value.minOrders) > 0) conditions.push({ field: "orders", op: "gte", value: Number(value.minOrders) });
    if (Number(value.minSpent) > 0) conditions.push({ field: "spent", op: "gte", value: Number(value.minSpent) });
    if (typeof value.tag === "string" && value.tag.trim()) conditions.push({ field: "tag", op: "has", value: value.tag.trim().toLowerCase() });
  }
  return { match: value.match === "any" ? "any" : "all", conditions: conditions.slice(0, 20) };
}

function daysAgo(date: Date | null, now: Date) {
  return date ? (now.getTime() - date.getTime()) / DAY : Infinity;
}

export function matchesCondition(contact: MarketingContact, condition: SegmentCondition, now = new Date()): boolean {
  const num = Number(condition.value ?? 0);
  const text = String(condition.value ?? "").trim().toLowerCase();
  switch (condition.field) {
    case "spent":
    case "orders": {
      const actual = condition.field === "spent" ? contact.spent : contact.orders;
      if (condition.op === "gte") return actual >= num;
      if (condition.op === "lte") return actual <= num;
      return actual === num;
    }
    case "last_order":
    case "first_order": {
      const date = condition.field === "last_order" ? contact.lastOrderAt : contact.firstOrderAt;
      if (condition.op === "never") return !date;
      if (!date) return false;
      return condition.op === "within_days" ? daysAgo(date, now) <= num : daysAgo(date, now) > num;
    }
    case "joined": {
      if (!contact.joinedAt) return false;
      return condition.op === "within_days" ? daysAgo(contact.joinedAt, now) <= num : daysAgo(contact.joinedAt, now) > num;
    }
    case "location": {
      if (!text) return true;
      const found = contact.location.toLowerCase().includes(text);
      return condition.op === "contains" ? found : !found;
    }
    case "tag": {
      const has = contact.tags.some((tag) => tag.toLowerCase() === text);
      return condition.op === "has" ? has : !has;
    }
    case "source": {
      const same = contact.source === text;
      return condition.op === "is" ? same : !same;
    }
    case "product": {
      const bought = contact.productIds.includes(String(condition.value ?? ""));
      return condition.op === "bought" ? bought : !bought;
    }
    case "subscribed": {
      const subscribed = contact.status === "active";
      return condition.op === "is_true" ? subscribed : !subscribed;
    }
    case "reachable":
      return condition.op === "email" ? Boolean(contact.email) : Boolean(contact.phone);
  }
}

/** True when the contact belongs to the segment. A segment with no conditions holds everyone. */
export function matchesSegment(contact: MarketingContact, rules: SegmentRules, now = new Date()) {
  if (!rules.conditions.length) return true;
  return rules.match === "any"
    ? rules.conditions.some((condition) => matchesCondition(contact, condition, now))
    : rules.conditions.every((condition) => matchesCondition(contact, condition, now));
}

/** "Total spent is at least ₦50,000" — for lists, previews and Peggy. */
export function describeCondition(condition: SegmentCondition, money: (n: number) => string = (n) => `₦${n.toLocaleString("en-NG")}`) {
  const field = SEGMENT_FIELDS[condition.field];
  const op = OP_LABEL[condition.op];
  const value = condition.value ?? "";
  switch (field.input) {
    case "money":
      return `${field.label} ${op} ${money(Number(value) || 0)}`;
    case "days":
      return condition.op === "never" ? `${field.label}: never ordered` : `${field.label} ${op} ${Number(value) || 0} days${condition.op === "more_than_days" ? " ago" : ""}`;
    case "source":
      return `${field.label} ${op} ${SOURCE_LABEL[String(value)] ?? value}`;
    case "product":
      return `${condition.op === "bought" ? "Bought" : "Never bought"} ${condition.label || "a product"}`;
    case "none":
      return condition.field === "subscribed" ? (condition.op === "is_true" ? "Subscribed to emails" : "Not subscribed to emails") : `Has ${op}`;
    default:
      return `${field.label} ${op} ${value}`;
  }
}

export function describeRules(rules: SegmentRules) {
  if (!rules.conditions.length) return "Everyone";
  return rules.conditions.map((condition) => describeCondition(condition)).join(rules.match === "any" ? " or " : " and ");
}

/** Lower-cased email, or null when it isn't one. */
export function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Digits with a leading + (Nigerian numbers starting 0 become +234…), or null when it can't be a phone number. */
export function normalizePhone(value: unknown, defaultCountryCode = "234"): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
  digits = digits.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}
