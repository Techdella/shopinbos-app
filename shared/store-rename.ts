// When a seller renames their store, page text that still says the old name (SEO titles, the footer line, hero
// eyebrows, about copy...) follows the new one. Pure so the server, scripts and tests share the exact rules
// (src/lib/store-address.server.ts applies them to brandSettings.editor and StorePage rows).
//
// Rules:
// - Whole phrase, case-sensitive, on word boundaries: "Rexi" never touches "Rexington" or "rexi".
// - Only string values, never keys; never ids, URLs, image paths, slugs, colours or other machine values.
// - Old names shorter than 3 characters or that are common words ("Store", "Shop") are left alone: too likely to
//   be ordinary words in the seller's own copy.
// - Straight and curly apostrophes are the same, so the default "Ada's Store" also matches "Ada’s Store".

export const RENAME_MIN_LENGTH = 3;

/** Names too ordinary to replace in free text. Compared lowercased. */
export const COMMON_STORE_WORDS: ReadonlySet<string> = new Set([
  "store", "shop", "the store", "the shop", "my store", "my shop", "your store", "your shop", "our store", "our shop",
  "home", "products", "product", "boutique", "market", "mart", "online", "online store", "new", "sale", "brand",
  "fashion", "beauty", "kitchen", "foods", "food", "the", "and", "for", "you", "our", "your", "best", "shop now",
]);

/** Keys whose string values are machine values (ids, links, files, styles), never shopper-facing text. */
const SKIP_KEY = /^(id|key|slug|href|url|src|path|kind|type|pageType|templateId|layout|layoutFamily|variant|source|icon|color|colour|background|align|ratio|level|style|accept|answerSource|media|image|images|video|poster|font|fontStyle|headingStyle|radius|updatedAt|createdAt|publishedAt)$|(Id|Ids|Slug|Url|URL|Urls|Href|Path|Color|Colour|Image|Images|Src|Key)$/;

/** String values that look like links or file paths, whatever key holds them. */
const MACHINE_VALUE = /^(https?:|\/\/|\/|data:|mailto:|tel:|#|www\.)/i;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `oldName` is safe to replace in free text (long enough, not a common word). */
export function canRenameInText(oldName: string) {
  const name = oldName.trim();
  if (name.length < RENAME_MIN_LENGTH) return false;
  return !COMMON_STORE_WORDS.has(name.toLowerCase().replace(/[’]/g, "'"));
}

/** The matcher for `oldName` as a whole phrase, or null when it shouldn't be replaced. */
export function renamePattern(oldName: string): RegExp | null {
  const name = oldName.trim();
  if (!canRenameInText(name)) return null;
  const body = escapeRegExp(name).replace(/['’]/g, "['’]");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "gu");
}

/** One string with the old name replaced; the same string when nothing matched or the old name isn't safe. */
export function renameInText(text: string, oldName: string, newName: string) {
  const next = newName.trim();
  const pattern = renamePattern(oldName);
  if (!pattern || !next || next === oldName.trim() || MACHINE_VALUE.test(text.trim())) return text;
  return text.replace(pattern, () => next);
}

/**
 * A copy of `value` (an editor snapshot, page content, any JSON) with the old store name replaced by the new one
 * in every text value. Returns null when nothing changed, so callers can skip the write.
 */
export function renameInContent<T>(value: T, oldName: string, newName: string): T | null {
  if (!renamePattern(oldName) || !newName.trim() || newName.trim() === oldName.trim()) return null;
  let changed = false;
  const walk = (entry: unknown, key: string | null): unknown => {
    if (typeof entry === "string") {
      if (key !== null && SKIP_KEY.test(key)) return entry;
      const next = renameInText(entry, oldName, newName);
      if (next !== entry) changed = true;
      return next;
    }
    // Arrays inherit their key's rule (images: [...] stays as it is; items: [...] is walked).
    if (Array.isArray(entry)) return entry.map((inner) => walk(inner, key));
    if (!entry || typeof entry !== "object") return entry;
    const out: Record<string, unknown> = {};
    for (const [innerKey, inner] of Object.entries(entry as Record<string, unknown>)) out[innerKey] = walk(inner, innerKey);
    return out;
  };
  const result = walk(value, null);
  return changed ? (result as T) : null;
}
