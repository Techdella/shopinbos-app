// Product short codes (BAG1, BAG2, DRS3…): what sellers say on live videos and Status posts ("Comment BAG2 to
// order"). Each store's products get a code from their type, category or name, numbered per prefix in the store
// (StoreProduct.shortCode, unique per store). Pure so the server (src/lib/products/short-code.server.ts), the phone,
// the web forms and the tests share one set of rules. docs/migrations/2026-11-28-product-short-codes.sql backfills
// existing products with the same prefix rules written in SQL: keep the two in step.

import { withChannelRef } from "./channels.ts";

/** Fixed prefixes for the preset product types (shared/product-types.ts). "other" has none: the name is used. */
export const TYPE_PREFIX: Readonly<Record<string, string>> = {
  clothing: "CLO",
  shoes: "SHOE",
  bags: "BAG",
  jewellery: "JWL",
  beauty: "BTY",
  hair: "HAIR",
  food: "FOOD",
  phones: "PHN",
  electronics: "ELEC",
  home: "HOME",
  baby: "BABY",
  books: "BOOK",
  digital: "DIGI",
};

/** When nothing else gives a prefix (no type, no category, a name with no letters). */
export const FALLBACK_PREFIX = "ITEM";

export const SHORT_CODE_MIN = 2;
export const SHORT_CODE_MAX = 8;
/** What a seller may type: uppercase letters and digits, 2–8 characters (checked after uppercasing). */
export const SHORT_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

/** The first word of at least two plain letters in `text`, uppercased, accents dropped ("Échelle" → "ECHELLE"). */
export function firstWord(text: string | null | undefined): string | null {
  if (!text) return null;
  const plain = text.normalize("NFD").replace(/[^A-Za-z\s]/g, "").toUpperCase();
  return plain.match(/[A-Z]{2,}/)?.[0] ?? null;
}

/**
 * A word made into a prefix of at most 4 letters: short words stay ("BAG", "SHOE"); longer ones keep their first
 * letter, drop the other vowels and repeated letters ("DRESS" → "DRS", "LEATHER" → "LTHR").
 */
export function shortenWord(word: string): string {
  if (word.length <= 4) return word;
  const consonants = (word[0] + word.slice(1).replace(/[AEIOU]/g, "")).replace(/(.)\1+/g, "$1");
  return consonants.length >= 2 ? consonants.slice(0, 4) : word.slice(0, 4);
}

/**
 * Common product words and their prefix, so "Leather bag" is BAG and "Ankara dress" is DRS (the word that says what
 * it is, wherever it sits in the name). Singular and plural spelled out so the SQL backfill can use the same list.
 */
export const PRODUCT_NOUNS: Readonly<Record<string, string>> = {
  BAG: "BAG", BAGS: "BAG", HANDBAG: "BAG", HANDBAGS: "BAG", PURSE: "PRS", PURSES: "PRS",
  DRESS: "DRS", DRESSES: "DRS", GOWN: "GOWN", GOWNS: "GOWN", SKIRT: "SKRT", SKIRTS: "SKRT",
  SHIRT: "SHRT", SHIRTS: "SHRT", TSHIRT: "TEE", TSHIRTS: "TEE", TEE: "TEE", TEES: "TEE", TOP: "TOP", TOPS: "TOP",
  JEAN: "JEAN", JEANS: "JEAN", TROUSER: "TRSR", TROUSERS: "TRSR",
  SHOE: "SHOE", SHOES: "SHOE", SNEAKER: "SNKR", SNEAKERS: "SNKR", SANDAL: "SNDL", SANDALS: "SNDL",
  SLIPPER: "SLPR", SLIPPERS: "SLPR", HEELS: "HEEL",
  WIG: "WIG", WIGS: "WIG", CAP: "CAP", CAPS: "CAP", HAT: "HAT", HATS: "HAT",
  WATCH: "WTCH", WATCHES: "WTCH", RING: "RING", RINGS: "RING", NECKLACE: "NCKL", NECKLACES: "NCKL",
  EARRING: "EAR", EARRINGS: "EAR", BRACELET: "BRCL", BRACELETS: "BRCL",
  PERFUME: "PRFM", PERFUMES: "PRFM", CREAM: "CRM", CREAMS: "CRM", LOTION: "LTN", SERUM: "SRM", SOAP: "SOAP", OIL: "OIL",
  CASE: "CASE", CASES: "CASE", CHARGER: "CHRG", CHARGERS: "CHRG", EARBUDS: "BUDS", HEADPHONES: "HDPH",
  FABRIC: "FBRC", FABRICS: "FBRC",
};

/** The prefix of the first common product word in a name ("Ankara maxi dress" → "DRS"), or null. */
export function nounPrefix(name: string | null | undefined): string | null {
  if (!name) return null;
  const words = name.normalize("NFD").replace(/[^A-Za-z\s]/g, "").toUpperCase().split(/\s+/);
  for (const word of words) if (Object.prototype.hasOwnProperty.call(PRODUCT_NOUNS, word)) return PRODUCT_NOUNS[word];
  return null;
}

/**
 * The letters a product's code starts with, from what says best what it is: a common product word in its name
 * ("Leather bag" → BAG), else its type's prefix, else the first word of its category, else of its name, else ITEM.
 */
export function codePrefix(input: { productType?: string | null; categoryName?: string | null; name?: string | null }): string {
  const noun = nounPrefix(input.name);
  if (noun) return noun;
  const typed = input.productType ? TYPE_PREFIX[input.productType] : undefined;
  if (typed) return typed;
  const word = firstWord(input.categoryName) ?? firstWord(input.name);
  return word ? shortenWord(word) : FALLBACK_PREFIX;
}

/** The number after `prefix` in `code` ("BAG12" → 12), or null when the code isn't `prefix` + digits. */
export function codeNumber(prefix: string, code: string | null | undefined): number | null {
  if (!code || !code.startsWith(prefix)) return null;
  const rest = code.slice(prefix.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/** The next code for `prefix` in a store: one more than the highest number it already uses (BAG1, BAG2…). */
export function nextShortCode(prefix: string, existing: ReadonlyArray<string | null | undefined>): string {
  let highest = 0;
  for (const code of existing) {
    const number = codeNumber(prefix, code);
    if (number !== null && number > highest) highest = number;
  }
  return `${prefix}${highest + 1}`;
}

/** A typed code tidied up for saving ("  bag2 " → "BAG2"). */
export function normalizeShortCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export type ShortCodeProblem = "format";

/** Checks a code a seller typed: 2–8 uppercase letters and digits once tidied. Uniqueness is the database's job. */
export function checkShortCode(value: string | null | undefined): { ok: true; code: string } | { ok: false; problem: ShortCodeProblem } {
  const code = normalizeShortCode(value);
  return SHORT_CODE_PATTERN.test(code) ? { ok: true, code } : { ok: false, problem: "format" };
}

/** True for a unique-constraint clash on the code (Prisma P2002 naming shortCode), so the caller can retry. */
export function isShortCodeClash(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== "P2002") return false;
  const target = meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  // Older Prisma clients name the index instead of its columns; a clash with no target is treated as ours too.
  return !text || text.includes("shortCode") || text.includes("short_code");
}

/**
 * Codes a customer may have written in a message ("I want bag2 pls", "DRS 3?"): letters then digits, joined or
 * with one space between. Uppercased, without duplicates, in the order they appear.
 */
export function codesInText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(/(?:^|[^A-Za-z0-9])([A-Za-z]{2,6}) ?(\d{1,4})(?![A-Za-z0-9])/g)) {
    const code = `${match[1]}${match[2]}`.toUpperCase();
    if (SHORT_CODE_PATTERN.test(code) && !found.includes(code)) found.push(code);
  }
  return found;
}

/** The products whose code is in the message, in the order the message names them. */
export function productsByCodeInText<P extends { shortCode?: string | null }>(products: readonly P[], text: string | null | undefined): P[] {
  const codes = codesInText(text);
  return codes.flatMap((code) => products.filter((product) => product.shortCode === code).slice(0, 1));
}

/**
 * The record-sale and product pickers' search: a typed code ("bag2") finds that product first, then names and
 * codes that contain the words.
 */
export function searchProducts<P extends { name: string; shortCode?: string | null }>(products: readonly P[], query: string, limit = 8): P[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return products.slice(0, limit);
  const code = normalizeShortCode(needle).replace(/\s+/g, "");
  const exact = products.filter((product) => product.shortCode === code);
  const rest = products.filter((product) => product.shortCode !== code && (product.name.toLowerCase().includes(needle) || (product.shortCode ?? "").toLowerCase().startsWith(code.toLowerCase())));
  return [...exact, ...rest].slice(0, limit);
}

/** The one product with exactly this code (the "Find by code" box), or null. */
export function findByCode<P extends { shortCode?: string | null }>(products: readonly P[], typed: string): P | null {
  const code = normalizeShortCode(typed).replace(/\s+/g, "");
  return code ? products.find((product) => product.shortCode === code) ?? null : null;
}

// ─── Share to WhatsApp ───────────────────────────────────────────────────────

/**
 * The message a seller sends on WhatsApp for one product:
 *   "Ankara Maxi Dress – ₦18,500\nCode: DRS3\nOrder here: https://ada.mybos.store/product/…?ref=wa"
 * `words` are the person's own language ("Code", "Order here"); `price` is already formatted (₦18,500).
 */
export function productShareMessage(
  product: { name: string; price: string | null; code?: string | null; url: string },
  words: { code: string; orderHere: string },
): string {
  const title = product.price ? `${product.name.trim()} – ${product.price}` : product.name.trim();
  const lines = [title];
  if (product.code) lines.push(`${words.code}: ${product.code}`);
  lines.push(`${words.orderHere}: ${withChannelRef(product.url, "whatsapp")}`);
  return lines.join("\n");
}

/** WhatsApp's own share link (no number: the person picks the chat or Status). Opens the app or web.whatsapp.com. */
export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The phone's direct WhatsApp intent; when WhatsApp isn't installed the caller falls back to the share sheet. */
export function whatsappAppLink(text: string): string {
  return `whatsapp://send?text=${encodeURIComponent(text)}`;
}

/** A product's page on its storefront: `<shop link>/product/<id>`. */
export function storefrontProductUrl(shopUrl: string, productId: string): string {
  return `${shopUrl.replace(/\/+$/, "")}/product/${encodeURIComponent(productId)}`;
}
