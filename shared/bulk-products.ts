// "Add many with Peggy": a seller or supplier picks many product photos at once (up to 300 in a session, in one go
// or several rounds), Peggy drafts each one from its photo and they price them by chatting, in English or Pidgin
// ("bag 15k, dress 12,500", "all the bags 15k", "1-20 na 5000", "remove 3"). Pure: shared by the server
// (src/lib/products/bulk/), the phone (apps/mobile/src/app/bulk-add.tsx) and the web
// (src/components/products/bulk/BulkAddWithPeggy.tsx). Unit-tested in tests/bulk-products.test.mjs.
//
// Money is always kobo here (₦1 = 100 kobo); StoreProduct and SupplierProduct still keep naira, so publishing divides
// by 100. Item numbers never change once given, so "remove 3" always means the same product.

export const BULK_MAX_ITEMS = 300;
export const BULK_MAX_PHOTOS_PER_ITEM = 8;
/** Photos per vision call: one small (512px, "low" detail) look at each product's first photo. */
export const BULK_VISION_BATCH = 10;
/** Products created per publish call; the client calls again until all are done (progress, short requests). */
export const BULK_PUBLISH_CHUNK = 20;
/** Uploads running at once from one phone or browser. */
export const BULK_UPLOAD_CONCURRENCY = 3;
/** The longest side of a photo before upload (the browser resizes; the server resizes again for phones). */
export const BULK_PHOTO_MAX_SIDE = 1600;
export const BULK_MAX_PRICE_KOBO = 1_000_000_000_00; // ₦1 billion
export const BULK_MAX_STOCK = 1_000_000;

export type BulkRole = "seller" | "supplier";

export interface BulkItem {
  id: string;
  number: number;
  photos: string[];
  name: string;
  description: string;
  category: string;
  priceKobo: number | null;
  hintLowKobo: number | null;
  hintHighKobo: number | null;
  stock: number | null;
  colours: string[];
  lookKey: string | null;
  colour: string | null;
  /** pending | working | done | skipped */
  aiState: string;
  removed: boolean;
  productId: string | null;
  publishError: string | null;
  fileName?: string | null;
}

/** One change Peggy made from a reply (or the person made by hand). */
export interface BulkChange {
  n: number;
  name?: string;
  description?: string;
  category?: string;
  priceKobo?: number;
  stock?: number;
  removed?: true;
}

/** Something Peggy needs to ask back instead of guessing. */
export type BulkQuestion =
  | { kind: "which"; ref: string; numbers: number[] }
  | { kind: "range"; ref: string; lowKobo: number; highKobo: number; numbers: number[] }
  | { kind: "unknownNumber"; n: number };

/** What Peggy asks next, so 200 products are priced a group at a time, never one by one. */
export type BulkAsk =
  | { kind: "ready"; count: number }
  | { kind: "group"; category: string; count: number; numbers: number[] }
  | { kind: "items"; numbers: number[] }
  | { kind: "range"; from: number; to: number; count: number }
  | { kind: "names"; numbers: number[] }
  | { kind: "waiting" };

export interface BulkSummary {
  total: number;
  priced: number;
  left: number;
  unnamed: number;
  published: number;
  drafting: number;
  /** Unpriced products by category, biggest first ("30 shoes, 20 caps"). */
  unpricedBy: Array<{ category: string; count: number }>;
}

export type BulkEvent =
  | { id: string; at: string; from: "me"; kind: "text"; text: string }
  | { id: string; at: string; from: "peggy"; kind: "hello" }
  | { id: string; at: string; from: "peggy"; kind: "intro"; numbers: number[]; ai: boolean; summary: BulkSummary; ask: BulkAsk }
  | { id: string; at: string; from: "peggy"; kind: "allSeen"; summary: BulkSummary; ask: BulkAsk }
  | { id: string; at: string; from: "peggy"; kind: "applied"; changes: BulkChange[]; unknown: string[]; questions: BulkQuestion[]; summary: BulkSummary; ask: BulkAsk; ai?: boolean }
  | { id: string; at: string; from: "peggy"; kind: "capped" }
  | { id: string; at: string; from: "peggy"; kind: "published"; count: number; live: boolean };

// ─── Money ────────────────────────────────────────────────────────────────────

const MULT: Record<string, number> = { k: 1_000, thousand: 1_000, grand: 1_000, m: 1_000_000, million: 1_000_000 };
const AMOUNT_SRC = String.raw`(?:₦|ngn\s*)?(\d+(?:\.\d+)?)\s*(k|thousand|grand|m|million)?(?![a-z])(?:\s*(?:naira|ngn))?`;
const AMOUNT = new RegExp(AMOUNT_SRC, "i");

/** "15k" → 1500000, "₦12,500" → 1250000, "1.2m" → 120000000, "5000 naira" → 500000. Null when it isn't money. */
export function parseNaira(text: string): number | null {
  const clean = normalise(text);
  const match = clean.match(new RegExp(`^\\s*${AMOUNT_SRC}\\s*$`, "i"));
  if (!match) return null;
  return toKobo(match[1], match[2]);
}

function toKobo(digits: string, unit?: string) {
  const value = Number(digits) * (unit ? MULT[unit.toLowerCase()] ?? 1 : 1);
  if (!Number.isFinite(value) || value <= 0) return null;
  const kobo = Math.round(value * 100);
  return kobo > BULK_MAX_PRICE_KOBO ? null : kobo;
}

/** Lowercase, "₦" spaced, "N5,000" → "₦5000", thousands commas dropped ("12,500" → "12500"). */
function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\bn(?=\d)/g, "₦")
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Words ────────────────────────────────────────────────────────────────────

const STOP = new Set(["the", "a", "an", "my", "of", "them", "one", "ones", "di", "dem", "those", "these", "that", "this", "for", "price", "is", "are", "at", "na", "dey", "be", "e", "with", "all", "every", "everything", "each", "and", "product", "products", "item", "items", "colour", "color"]);

function singular(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ss|sh|ch|x)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9À-ɏ]+/g) ?? []).map(singular).filter((word) => word.length > 1 && !STOP.has(word));
}

/** A short key for "the same kind of product" (from Peggy's lookKey, else the name). */
export function itemKey(item: Pick<BulkItem, "lookKey" | "name">) {
  return (item.lookKey ?? "").trim().toLowerCase() || words(item.name).join("-");
}

const live = (items: BulkItem[]) => items.filter((item) => !item.removed && !item.productId);

// ─── Reading a reply ──────────────────────────────────────────────────────────

export interface ParseContext {
  /** The numbers Peggy just asked about ("What price for the 30 shoes?"): a bare "15k" goes to them. */
  asking?: number[];
  /** The last price set in this session, for "same price as the last one". */
  lastPriceKobo?: number | null;
}

export interface ParseResult {
  changes: BulkChange[];
  unknown: string[];
  questions: BulkQuestion[];
  /** True when every part of the message was understood (no AI needed). */
  complete: boolean;
  lastPriceKobo: number | null;
}

const CONNECT = String.raw`(?:\s*(?:[:=\-–]|is|are|na|dey|be|go for|sell(?:s)? for|sell(?:s)? at|cost(?:s)?|for|at|@|price(?: is)?|each|all)\s*)*`;
const ALL_WORDS = /^(?:all|all of them|all of dem|everything|every(?: one|thing)?|each(?: one)?|them all|dem all|the whole lot|all the products|all products|all items|everybody)$/;
const NUM = String.raw`(?:#|no\.?\s*|number\s*|item\s*)?(\d{1,3})`;

function uniq(list: number[]) {
  return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * Finds the products a phrase means: "all", "3", "#3", "1-20", "1, 2 and 5", "the bags", "everything ankara",
 * "black handbag". `plural` says the phrase meant all matches ("bags", "all the bags", "everything ankara").
 */
export function resolveRef(ref: string, items: BulkItem[]): { numbers: number[]; plural: boolean } | null {
  const text = normalise(ref).replace(/^(?:and|then|plus|also|oh|ok|okay|pls|please)\s+/, "").trim();
  if (!text) return null;
  const pool = live(items);
  if (ALL_WORDS.test(text)) return { numbers: pool.map((item) => item.number), plural: true };
  const range = text.match(new RegExp(String.raw`^(?:from\s+)?${NUM}\s*(?:-|–|to|through|till|reach)\s*${NUM}$`));
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
    return { numbers: pool.filter((item) => item.number >= from && item.number <= to).map((item) => item.number), plural: true };
  }
  if (/^(?:#|no\.?\s*|number\s*|item\s*)?\d{1,3}(?:\s*(?:,|and|&|\s)\s*(?:#|no\.?\s*|number\s*|item\s*)?\d{1,3})*$/.test(text)) {
    const numbers = uniq((text.match(/\d{1,3}/g) ?? []).map(Number));
    return { numbers, plural: numbers.length > 1 };
  }
  const plural = /^(?:all|every|everything|each|any)\b/.test(text) || /\b(?:all|dem|them)$/.test(text) || (text.match(/[a-z]+/g) ?? []).some((word) => word.length > 3 && /s$/.test(word) && !/ss$/.test(word) && !STOP.has(word));
  const wanted = words(text);
  if (!wanted.length) return null;
  const matches = pool.filter((item) => {
    const have = new Set([...words(item.name), ...words(item.category), ...words(item.colour ?? ""), ...words(itemKey(item).replace(/-/g, " "))]);
    return wanted.every((word) => have.has(word));
  });
  if (!matches.length) return null;
  return { numbers: matches.map((item) => item.number), plural };
}

const COMMAND = /^(?:remove|delete|comot|drop|cancel|take out|rename|call|name|change|stock|qty|quantity|how many|put|move|describe|description|desc)\b/;
const NAMING = /^(?:rename|call|name|change (?:the )?name|describe|description|desc)\b/;

function hasPrice(part: string) {
  const end = part.match(new RegExp(String.raw`${AMOUNT_SRC}(?:\s*(?:each|per one|per piece|apiece|o|oo))?$`, "i"));
  const start = part.match(new RegExp(String.raw`^${AMOUNT_SRC}\s*(?:each\s*)?(?:for|on)\s`, "i"));
  const big = (m: RegExpMatchArray | null) => Boolean(m && (m[2] || /₦|naira|ngn/.test(m[0]) || Number(m[1]) >= 50));
  return big(end) || big(start);
}

/** A part that stands on its own (a price, a command, a stock count, "same as"). */
function standalone(part: string) {
  return hasPrice(part) || COMMAND.test(part) || /(?:pieces|piece|pcs|in stock|left|units)$/.test(part) || /\bsame\b/.test(part);
}

/**
 * Splits a reply into parts at commas, "and", "&", "then", semicolons and new lines, but keeps lists together:
 * "1, 2 and 3 are 5000", "remove 3, 4 and 5", "the bag and the shoes na 20k", "rename 2 to Ankara and lace top".
 */
function clauses(text: string) {
  const pieces = text.split(/(\s*(?:[;\n]|,|\band then\b|\bthen\b|\band\b|&)\s*)/);
  const out: string[] = [];
  let current = pieces[0] ?? "";
  for (let i = 1; i < pieces.length; i += 2) {
    const sep = pieces[i];
    let next = pieces[i + 1] ?? "";
    const hard = /[;\n]/.test(sep) || /then/.test(sep);
    const cur = current.trim();
    let merge = false;
    if (!hard && cur) {
      if (NAMING.test(cur) && /^#?\d{1,3}\s+(?:to|as)\s+/.test(next.trim())) next = `rename ${next.trim()}`;
      else if (NAMING.test(cur)) merge = !standalone(next.trim());
      else if (/^(?:remove|delete|comot|drop|cancel|take out)\b/.test(cur)) merge = !standalone(next.trim());
      else if (!standalone(cur)) merge = true;
    }
    if (merge) current = `${current}${sep}${next}`;
    else {
      out.push(current);
      current = next;
    }
  }
  out.push(current);
  // A lone ref left at the end ("1 15k, 2") goes with the part before it.
  return out.map((part) => part.trim()).filter(Boolean);
}

/**
 * Reads a reply into changes, without AI: prices ("bag 15k", "1 15000", "1-20 na 5000", "all the bags 15k",
 * "everything ankara 8500", "all of them 5000", a bare "15k" for what Peggy just asked about, "same price as the
 * last one"), names ("rename 2 to Ankara maxi dress", "1 black bag 15k" for a product with no name yet), stock
 * ("stock for all 10", "2 has 5 pieces"), categories ("put 4 in shoes"), descriptions and removals ("remove 3",
 * "comot 4 and 5"). A price range ("dresses 12k to 18k") and a name that matches several products are asked back.
 */
export function parseReply(message: string, items: BulkItem[], context: ParseContext = {}): ParseResult {
  const changes = new Map<number, BulkChange>();
  const unknown: string[] = [];
  const questions: BulkQuestion[] = [];
  const known = new Set(items.filter((item) => !item.removed).map((item) => item.number));
  let lastPrice = context.lastPriceKobo ?? null;

  const change = (n: number, patch: Omit<BulkChange, "n">) => {
    if (!known.has(n)) {
      if (!questions.some((q) => q.kind === "unknownNumber" && q.n === n)) questions.push({ kind: "unknownNumber", n });
      return;
    }
    changes.set(n, { ...(changes.get(n) ?? { n }), ...patch });
  };
  /** The numbers a phrase means; [] when Peggy has to ask which; null when it means nothing she knows. */
  const target = (ref: string): number[] | null => {
    const trimmed = ref.trim().replace(/^(?:for|of)\s+/, "");
    if (!trimmed) return context.asking?.length ? context.asking : null;
    const whole = resolveRef(trimmed, items);
    const pieces = whole ? [trimmed] : trimmed.split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean);
    if (!whole && pieces.length < 2) return null;
    const numbers: number[] = [];
    for (const piece of pieces) {
      const found = piece === trimmed ? whole : resolveRef(piece, items);
      if (!found) return null;
      if (found.numbers.length > 1 && !found.plural) {
        questions.push({ kind: "which", ref: piece, numbers: found.numbers });
        continue;
      }
      numbers.push(...found.numbers);
    }
    return uniq(numbers);
  };
  const byNumber = new Map(items.map((item) => [item.number, item]));

  for (const raw of clauses(normalise(message))) {
    const part = raw.replace(/^(?:and|then|plus|also|ok|okay|oya|pls|please|abeg)\s+/, "").replace(/[.!?]+$/, "").trim();
    if (!part) continue;
    let m: RegExpMatchArray | null;

    // Remove: "remove 3", "delete 4 and 5", "comot the red one".
    if ((m = part.match(/^(?:remove|delete|comot|drop|cancel|take out|no need for)\s+(.+)$/))) {
      const numbers = target(m[1]);
      if (numbers === null) unknown.push(raw);
      else numbers.forEach((n) => change(n, { removed: true }));
      continue;
    }
    // Rename: "rename 2 to Ankara maxi dress", "call 2 Ankara maxi dress", "change the name of 2 to …", "2 name is …".
    if ((m = part.match(/^(?:rename|change (?:the )?name (?:of )?|call|name)\s*(.+?)\s+(?:to|as|:)\s+(.+)$/)) || (m = part.match(new RegExp(String.raw`^${NUM}\s+name\s*(?:is|na|:|=)?\s*(.+)$`))) || (m = part.match(/^(?:call|name|rename)\s+(#?\d{1,3})\s+([a-z].*)$/))) {
      const numbers = target(m[1]);
      const name = cleanName(m[2], message);
      if (numbers === null || !name) unknown.push(raw);
      else numbers.forEach((n) => change(n, { name }));
      continue;
    }
    // Stock: "stock for all 10", "2 stock 5", "2 has 5 pieces", "5 pieces of 2".
    if ((m = part.match(/^(?:stock|qty|quantity|how many)\s+(?:for|of)?\s*(.+?)\s*(?:is|na|=|:)?\s*(\d+)$/)) || (m = part.match(/^(.+?)\s+(?:stock|qty|quantity|in stock)\s*(?:is|na|=|:)?\s*(\d+)$/)) || (m = part.match(/^(.+?)\s+(?:has|get|dey|i get|we get|i have|we have)?\s*(\d+)\s*(?:pieces|piece|pcs|pc|units|unit|in stock|left|remaining)$/))) {
      const numbers = target(m[1]);
      const stock = Number(m[2]);
      if (numbers === null || !Number.isFinite(stock) || stock > BULK_MAX_STOCK) unknown.push(raw);
      else numbers.forEach((n) => change(n, { stock }));
      continue;
    }
    // Category: "put 4 in shoes", "move 1-10 to bags".
    if ((m = part.match(/^(?:put|move)\s+(.+?)\s+(?:in|into|under|to)\s+(.+)$/))) {
      const numbers = target(m[1]);
      const category = cleanName(m[2], message);
      if (numbers === null || !category) unknown.push(raw);
      else numbers.forEach((n) => change(n, { category }));
      continue;
    }
    // Description: "describe 2 as …", "2 description: …".
    if ((m = part.match(/^(?:describe|description for|desc)\s+(.+?)\s*(?:as|:)\s*(.+)$/)) || (m = part.match(new RegExp(String.raw`^${NUM}\s+(?:description|desc)\s*(?:is|:)?\s*(.+)$`)))) {
      const numbers = target(m[1]);
      const description = m[2].trim().slice(0, 500);
      if (numbers === null || !description) unknown.push(raw);
      else numbers.forEach((n) => change(n, { description: originalCase(description, message) }));
      continue;
    }
    // Same price as another: "same price as the last one", "4 same as 3", "the shoes same as the bags".
    if ((m = part.match(/^(.*?)\s*(?:na |is |are )?(?:the )?same(?: price)?(?: as| with| like)?\s+(.+)$/))) {
      const from = m[2].trim();
      let price: number | null = null;
      if (/^(?:the )?(?:last|previous|before)(?: one)?$/.test(from)) price = lastPrice;
      else {
        const source = resolveRef(from, items);
        price = source?.numbers.map((n) => byNumber.get(n)?.priceKobo ?? changes.get(n)?.priceKobo ?? null).find((value): value is number => typeof value === "number") ?? null;
      }
      const numbers = target(m[1]);
      if (numbers === null || price === null) unknown.push(raw);
      else numbers.forEach((n) => change(n, { priceKobo: price! }));
      continue;
    }
    // A price range: ask, never pick one ("dresses 12k to 18k by size").
    if ((m = part.match(new RegExp(String.raw`^(.*?)${CONNECT}${AMOUNT_SRC}\s*(?:-|–|to|and)\s*${AMOUNT_SRC}(?:\s+[^\d]*)?$`, "i"))) && (m[3] || m[5] || Number(m[2]) >= 100)) {
      const low = toKobo(m[2], m[3] ?? m[5]);
      const high = toKobo(m[4], m[5]);
      const numbers = target(m[1]) ?? [];
      if (low && high) questions.push({ kind: "range", ref: m[1].trim(), lowKobo: Math.min(low, high), highKobo: Math.max(low, high), numbers });
      else unknown.push(raw);
      continue;
    }
    // "₦15k for the bag", "5000 each for 1-20".
    if ((m = part.match(new RegExp(String.raw`^${AMOUNT_SRC}\s*(?:each\s*)?(?:for|on)\s+(.+)$`, "i")))) {
      const price = toKobo(m[1], m[2]);
      const numbers = target(m[3]);
      if (!price || numbers === null) unknown.push(raw);
      else {
        numbers.forEach((n) => change(n, { priceKobo: price }));
        if (numbers.length) lastPrice = price;
      }
      continue;
    }
    // "<ref> <price>": "bag 15k", "1 15000", "1-20 na 5000", "all the bags 15k", a bare "15k".
    if ((m = part.match(new RegExp(String.raw`^(.*?)${CONNECT}${AMOUNT_SRC}(?:\s*(?:each|per one|per piece|apiece|o|oo))?$`, "i")))) {
      const tiny = !m[3] && !/₦|naira|ngn/.test(part) && Number(m[2]) < 50;
      const price = tiny ? null : toKobo(m[2], m[3]);
      let ref = m[1].trim();
      // "1 black bag 15k": a number, then a name for a product that has none yet.
      const named = ref.match(new RegExp(String.raw`^${NUM}\s+([a-z].*)$`));
      let name: string | null = null;
      if (named && byNumber.has(Number(named[1])) && !byNumber.get(Number(named[1]))?.removed) {
        ref = named[1];
        name = cleanName(named[2], message);
      }
      const numbers = target(ref);
      if (!price || numbers === null) unknown.push(raw);
      else {
        for (const n of numbers) change(n, { priceKobo: price, ...(name && !byNumber.get(n)?.name ? { name } : {}) });
        if (numbers.length) lastPrice = price;
      }
      continue;
    }
    unknown.push(raw);
  }

  return { changes: [...changes.values()].sort((a, b) => a.n - b.n), unknown, questions, complete: unknown.length === 0, lastPriceKobo: lastPrice };
}

/** The words as the person typed them (the reply is lower-cased to read it), trimmed to a product name. */
function cleanName(value: string, original: string) {
  const name = originalCase(value.replace(/^(?:the |a |an )/, "").trim(), original).replace(/\s+/g, " ").slice(0, 120);
  return name.length >= 2 ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}

function originalCase(lower: string, original: string) {
  const index = original.toLowerCase().indexOf(lower);
  return index >= 0 ? original.slice(index, index + lower.length) : lower;
}

/** Applies changes to the items (the server does the same to the rows). */
export function applyChanges(items: BulkItem[], changes: BulkChange[]): BulkItem[] {
  const byN = new Map(changes.map((c) => [c.n, c]));
  return items.map((item) => {
    const c = byN.get(item.number);
    if (!c || item.productId) return item;
    return {
      ...item,
      ...(c.name !== undefined ? { name: c.name } : {}),
      ...(c.description !== undefined ? { description: c.description } : {}),
      ...(c.category !== undefined ? { category: c.category } : {}),
      ...(c.priceKobo !== undefined ? { priceKobo: c.priceKobo } : {}),
      ...(c.stock !== undefined ? { stock: c.stock } : {}),
      ...(c.removed ? { removed: true } : {}),
    };
  });
}

// ─── Where things stand, and what to ask next ────────────────────────────────

export function readiness(item: BulkItem): "published" | "removed" | "drafting" | "needsName" | "needsPrice" | "ready" {
  if (item.productId) return "published";
  if (item.removed) return "removed";
  if (item.aiState === "pending" || item.aiState.startsWith("working")) return "drafting";
  if (item.name.trim().length < 2) return "needsName";
  if (!item.priceKobo || item.priceKobo <= 0) return "needsPrice";
  return "ready";
}

export function summarize(items: BulkItem[]): BulkSummary {
  const active = items.filter((item) => !item.removed);
  const open = active.filter((item) => !item.productId);
  const unpriced = open.filter((item) => !item.priceKobo);
  const counts = new Map<string, number>();
  for (const item of unpriced) {
    const category = item.category.trim() || "";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return {
    total: active.length,
    priced: open.length - unpriced.length,
    left: unpriced.length,
    unnamed: open.filter((item) => item.name.trim().length < 2).length,
    published: active.filter((item) => item.productId).length,
    drafting: open.filter((item) => readiness(item) === "drafting").length,
    unpricedBy: [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  };
}

/**
 * The next thing Peggy asks: a whole category ("What price for the 30 shoes?") while one has 3 or more without a
 * price; a short list once 8 or fewer are left; otherwise the next 20 by number ("What about 41 to 60?"). Names last.
 */
export function nextAsk(items: BulkItem[]): BulkAsk {
  const open = items.filter((item) => !item.removed && !item.productId);
  const unpriced = open.filter((item) => !item.priceKobo && readiness(item) !== "drafting");
  if (!unpriced.length) {
    const unnamed = open.filter((item) => readiness(item) === "needsName");
    if (unnamed.length) return { kind: "names", numbers: unnamed.slice(0, 20).map((item) => item.number) };
    if (open.some((item) => readiness(item) === "drafting")) return { kind: "waiting" };
    return { kind: "ready", count: open.length };
  }
  if (unpriced.length <= 8) return { kind: "items", numbers: unpriced.map((item) => item.number) };
  const groups = new Map<string, number[]>();
  for (const item of unpriced) {
    const category = item.category.trim();
    if (!category) continue;
    groups.set(category, [...(groups.get(category) ?? []), item.number]);
  }
  const biggest = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  if (biggest && biggest[1].length >= 3) return { kind: "group", category: biggest[0], count: biggest[1].length, numbers: biggest[1] };
  const next = unpriced.slice(0, 20);
  return { kind: "range", from: next[0].number, to: next[next.length - 1].number, count: next.length };
}

/** The numbers an ask is about, so a bare "15k" in the reply goes to them. */
export function askNumbers(ask: BulkAsk | null | undefined, items: BulkItem[]): number[] {
  if (!ask) return [];
  if (ask.kind === "group" || ask.kind === "items") return ask.numbers;
  if (ask.kind === "range") return items.filter((item) => !item.removed && !item.productId && !item.priceKobo && item.number >= ask.from && item.number <= ask.to).map((item) => item.number);
  return [];
}

// ─── Joining photos of the same product ──────────────────────────────────────

export interface BulkGroupSuggestion {
  /** Stable, so a "No" is remembered. */
  key: string;
  /** "angles": several photos of one product. "colours": the same product in different colours (versions). */
  kind: "angles" | "colours";
  numbers: number[];
  name: string;
  colours: string[];
}

/**
 * Photos Peggy thinks show the same product: the same lookKey. Same colour (or none) → angles of one product; different
 * colours → one product with colour options for sellers (StoreProduct versions), nothing for suppliers (no versions
 * on SupplierProduct, so they stay separate).
 */
export function suggestGroups(items: BulkItem[], role: BulkRole, dismissed: string[] = []): BulkGroupSuggestion[] {
  const byKey = new Map<string, BulkItem[]>();
  for (const item of live(items)) {
    if (!item.lookKey || item.aiState !== "done") continue;
    byKey.set(item.lookKey, [...(byKey.get(item.lookKey) ?? []), item]);
  }
  const out: BulkGroupSuggestion[] = [];
  for (const [lookKey, group] of byKey) {
    if (group.length < 2) continue;
    const colours = [...new Set(group.map((item) => (item.colour ?? "").trim().toLowerCase()).filter(Boolean))];
    const kind = colours.length > 1 ? "colours" : "angles";
    if (kind === "colours" && role !== "seller") continue;
    const numbers = group.map((item) => item.number).sort((a, b) => a - b);
    const key = `${kind}:${lookKey}:${numbers.join(",")}`;
    if (dismissed.includes(key)) continue;
    out.push({ key, kind, numbers, name: group[0].name, colours: kind === "colours" ? group.map((item) => item.colour ?? "") : [] });
  }
  return out.sort((a, b) => a.numbers[0] - b.numbers[0]);
}

/**
 * Joins items into the first one: its photos first, then the others' (up to BULK_MAX_PHOTOS_PER_ITEM). For colours,
 * each photo keeps its colour (`colours[i]` for `photos[i]`'s item). The others are removed.
 */
export function joinItems(items: BulkItem[], numbers: number[], kind: "angles" | "colours"): { keep: BulkItem; removed: number[] } | null {
  const picked = uniq(numbers).map((n) => items.find((item) => item.number === n && !item.removed && !item.productId)).filter((item): item is BulkItem => Boolean(item));
  if (picked.length < 2) return null;
  const [first, ...rest] = picked;
  const photos = picked.flatMap((item) => item.photos).slice(0, BULK_MAX_PHOTOS_PER_ITEM);
  const colours = kind === "colours" ? [...new Set(picked.map((item) => (item.colour ?? "").trim()).filter(Boolean))] : first.colours;
  const stripped = kind === "colours" && first.colour ? first.name.replace(new RegExp(`\\b${escapeRegExp(first.colour)}\\b\\s*`, "i"), "").trim() : "";
  const name = stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : first.name;
  const priceKobo = first.priceKobo ?? rest.find((item) => item.priceKobo)?.priceKobo ?? null;
  const stock = picked.every((item) => item.stock === null) ? null : picked.reduce((sum, item) => sum + (item.stock ?? 0), 0);
  return { keep: { ...first, name, photos, colours, priceKobo, stock }, removed: rest.map((item) => item.number) };
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Publishing ──────────────────────────────────────────────────────────────

/**
 * Which items to publish in this call: ready ones not yet published (in number order), at most `chunk`, and no more
 * than the plan has room for (`left`, null = no limit). `overLimit`: ready ones the plan has no room for; they stay.
 */
export function planPublish(items: BulkItem[], left: number | null, chunk = BULK_PUBLISH_CHUNK, only?: string[]) {
  const wanted = only?.length ? new Set(only) : null;
  const ready = items.filter((item) => readiness(item) === "ready" && (!wanted || wanted.has(item.id))).sort((a, b) => a.number - b.number);
  const room = left === null ? ready.length : Math.max(0, left);
  const allowed = ready.slice(0, room);
  return { batch: allowed.slice(0, chunk), remaining: Math.max(0, allowed.length - chunk), overLimit: ready.length - allowed.length, notReady: items.filter((item) => ["needsName", "needsPrice", "drafting"].includes(readiness(item))).length };
}

// ─── The draft list ──────────────────────────────────────────────────────────

export type BulkFilter = "all" | "needsPrice" | "needsName" | "ready" | "published" | `cat:${string}`;

/** The list's filter chips: by state, then by category (the biggest first). */
export function filterItems(items: BulkItem[], filter: BulkFilter): BulkItem[] {
  const shown = items.filter((item) => !item.removed);
  if (filter === "all") return shown;
  if (filter === "published") return shown.filter((item) => item.productId);
  if (filter.startsWith("cat:")) {
    const category = filter.slice(4).toLowerCase();
    return shown.filter((item) => item.category.trim().toLowerCase() === category);
  }
  return shown.filter((item) => readiness(item) === filter);
}

export function categoriesOf(items: BulkItem[], max = 8) {
  const counts = new Map<string, number>();
  for (const item of items) if (!item.removed && item.category.trim()) counts.set(item.category.trim(), (counts.get(item.category.trim()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([name, count]) => ({ name, count }));
}

/** A naira amount typed in a field ("15k", "12,500", "₦8,000") as kobo, or null. */
export function koboFromField(value: string): number | null {
  return value.trim() ? parseNaira(value) : null;
}

/** Kobo as the plain naira number a field shows ("1500000" → "15000"). */
export function fieldFromKobo(kobo: number | null | undefined): string {
  return kobo ? String(Math.round(kobo) / 100) : "";
}

// ─── Peggy's words (each event as lines, in the person's language) ───────────

export type BulkT = (key: string, values?: Record<string, string | number>) => string;

function list(numbers: number[], max = 12) {
  const shown = numbers.slice(0, max).join(", ");
  return numbers.length > max ? `${shown}…` : shown;
}

function asRanges(numbers: number[]) {
  const sorted = uniq(numbers);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(", "));
    i = j;
  }
  const text = parts.join(", ");
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function summaryLine(summary: BulkSummary, t: BulkT) {
  if (!summary.left) return t("peggy.allPriced", { count: summary.priced });
  const by = summary.unpricedBy.filter((group) => group.category).slice(0, 3).map((group) => `${group.count} ${group.category.toLowerCase()}`).join(", ");
  return by ? t("peggy.progressBy", { priced: summary.priced, left: summary.left, groups: by }) : t("peggy.progress", { priced: summary.priced, left: summary.left });
}

export function askLine(ask: BulkAsk, t: BulkT) {
  switch (ask.kind) {
    case "ready":
      return t("peggy.askReady", { count: ask.count });
    case "group":
      return t("peggy.askGroup", { count: ask.count, category: ask.category.toLowerCase(), example: ask.category.toLowerCase() });
    case "items":
      return t("peggy.askItems", { numbers: list(ask.numbers) });
    case "range":
      return t("peggy.askRange", { from: ask.from, to: ask.to });
    case "names":
      return t("peggy.askNames", { numbers: list(ask.numbers) });
    case "waiting":
      return t("peggy.askWaiting");
  }
}

/** One line per change, grouped when many got the same price ("1-20: ₦5,000"). */
export function changeLines(changes: BulkChange[], items: BulkItem[], t: BulkT, money: (kobo: number) => string) {
  const lines: string[] = [];
  const byNumber = new Map(items.map((item) => [item.number, item]));
  const removed = changes.filter((c) => c.removed).map((c) => c.n);
  const priced = changes.filter((c) => c.priceKobo !== undefined && !c.removed);
  const byPrice = new Map<number, number[]>();
  for (const c of priced) byPrice.set(c.priceKobo!, [...(byPrice.get(c.priceKobo!) ?? []), c.n]);
  for (const [price, numbers] of byPrice) {
    if (numbers.length === 1) {
      const item = byNumber.get(numbers[0]);
      const name = changes.find((c) => c.n === numbers[0])?.name ?? item?.name ?? "";
      lines.push(t("peggy.linePrice", { n: numbers[0], name: name || t("item.unnamed", { n: numbers[0] }), price: money(price) }));
    } else lines.push(t("peggy.linePriceMany", { count: numbers.length, numbers: asRanges(numbers), price: money(price) }));
  }
  const byValue = (pick: (c: BulkChange) => string | number | undefined) => {
    const map = new Map<string | number, number[]>();
    for (const c of changes) {
      const value = c.removed ? undefined : pick(c);
      if (value !== undefined) map.set(value, [...(map.get(value) ?? []), c.n]);
    }
    return map;
  };
  for (const c of changes) {
    if (c.removed) continue;
    if (c.name !== undefined && c.priceKobo === undefined) lines.push(t("peggy.lineName", { n: c.n, name: c.name }));
    if (c.description !== undefined) lines.push(t("peggy.lineDescription", { n: c.n }));
  }
  for (const [count, numbers] of byValue((c) => c.stock)) lines.push(numbers.length > 1 ? t("peggy.lineStockMany", { numbers: asRanges(numbers), count }) : t("peggy.lineStock", { n: numbers[0], count }));
  for (const [category, numbers] of byValue((c) => c.category)) lines.push(numbers.length > 1 ? t("peggy.lineCategoryMany", { numbers: asRanges(numbers), category }) : t("peggy.lineCategory", { n: numbers[0], category }));
  if (removed.length) lines.push(t("peggy.lineRemoved", { count: removed.length, numbers: asRanges(removed) }));
  // Many stock or category lines for a group read as one.
  const collapsed: string[] = [];
  for (const line of lines) if (!collapsed.includes(line)) collapsed.push(line);
  return collapsed.length > 14 ? [...collapsed.slice(0, 12), t("peggy.lineMore", { count: collapsed.length - 12 })] : collapsed;
}

export function questionLine(q: BulkQuestion, t: BulkT, money: (kobo: number) => string) {
  if (q.kind === "which") return t("peggy.qWhich", { ref: q.ref, count: q.numbers.length, numbers: asRanges(q.numbers) });
  if (q.kind === "range") return t("peggy.qRange", { ref: q.ref || t("peggy.these"), low: money(q.lowKobo), high: money(q.highKobo) });
  return t("peggy.qNumber", { n: q.n });
}

/** Peggy's message for an event, as paragraphs. Items are the current ones (names shown as they are now). */
export function eventLines(event: BulkEvent, items: BulkItem[], t: BulkT, money: (kobo: number) => string): string[] {
  switch (event.kind) {
    case "text":
      return [event.text];
    case "hello":
      return [t("peggy.hello")];
    case "intro":
      return [event.ai ? t("peggy.introAi", { count: event.summary.total }) : t("peggy.introNoAi", { count: event.summary.total }), askLine(event.ask, t), t("peggy.howToReply")];
    case "allSeen":
      return [t("peggy.allSeen", { count: event.summary.total }), summaryLine(event.summary, t), askLine(event.ask, t)];
    case "applied": {
      const lines = changeLines(event.changes, items, t, money);
      const out: string[] = [];
      if (lines.length) out.push(`${t("peggy.done")}\n${lines.map((line) => `• ${line}`).join("\n")}`);
      for (const q of event.questions) out.push(questionLine(q, t, money));
      if (event.unknown.length) out.push(t("peggy.notSure", { text: event.unknown.slice(0, 3).join("; ") }));
      if (!lines.length && !event.questions.length && !event.unknown.length) out.push(t("peggy.nothing"));
      out.push(summaryLine(event.summary, t));
      if (!event.questions.length) out.push(askLine(event.ask, t));
      return out;
    }
    case "capped":
      return [t("peggy.capped")];
    case "published":
      return [event.live ? t("peggy.publishedLive", { count: event.count }) : t("peggy.publishedDraft", { count: event.count })];
  }
}

// ─── WhatsApp catalogue screenshots ───────────────────────────────────────────
// "From my WhatsApp catalogue": the person uploads screenshots of their catalogue (the list, or one product open) and
// Peggy reads every product on each one. Unlike a product photo, a catalogue shows the person's own name and price,
// so both are taken as given; the photo is cut out of the screenshot. Server side: src/lib/products/bulk/catalogue.server.ts.

export const CATALOGUE_MAX_PER_SCREENSHOT = 12;

/** Where a product's photo is on the screenshot, as fractions of its width and height (0 to 1). */
export interface CatalogueBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CatalogueProduct {
  name: string;
  description: string;
  category: string;
  priceKobo: number | null;
  box: CatalogueBox | null;
}

const fraction = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
};

/** A photo box the reader gave, or null when it is missing, outside the screenshot or too small to be a photo. */
export function catalogueBox(value: unknown): CatalogueBox | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const x = fraction(raw.x);
  const y = fraction(raw.y);
  const w = fraction(raw.w);
  const h = fraction(raw.h);
  if (x === null || y === null || w === null || h === null) return null;
  const box = { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
  return box.w >= 0.05 && box.h >= 0.03 ? box : null;
}

/** The pixel rectangle to cut for a box, padded a little (the reader's boxes are close, not exact). */
export function cropRect(box: CatalogueBox, width: number, height: number, pad = 0.01) {
  const left = Math.max(0, Math.floor((box.x - pad) * width));
  const top = Math.max(0, Math.floor((box.y - pad) * height));
  const right = Math.min(width, Math.ceil((box.x + box.w + pad) * width));
  const bottom = Math.min(height, Math.ceil((box.y + box.h + pad) * height));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** The products the reader found on one screenshot: named ones only, at most CATALOGUE_MAX_PER_SCREENSHOT. */
export function readCatalogueProducts(parsed: unknown): CatalogueProduct[] {
  const list = parsed && typeof parsed === "object" && Array.isArray((parsed as { products?: unknown }).products) ? ((parsed as { products: unknown[] }).products) : [];
  const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const out: CatalogueProduct[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const name = clean(raw.name, 120);
    if (name.length < 2) continue;
    const price = typeof raw.price === "number" ? (raw.price > 0 ? Math.round(raw.price * 100) : null) : parseNaira(clean(raw.price, 40));
    out.push({ name, description: clean(raw.description, 300), category: clean(raw.category, 60), priceKobo: price && price <= BULK_MAX_PRICE_KOBO ? price : null, box: catalogueBox(raw.box) });
    if (out.length >= CATALOGUE_MAX_PER_SCREENSHOT) break;
  }
  return out;
}
