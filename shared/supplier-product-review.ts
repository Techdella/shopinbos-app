// When a supplier edits a live product, does it go back to the Shopinbos team for review? Only when what shops and
// their customers see about it changes: the name, description, category, photos or prices. Stock, the minimum
// order, dropship / bulk / sample availability, delivery regions and processing time change straight away, so a
// supplier can mark stock or adjust what they send without the product leaving the marketplace.
// Pure: the web form (src/app/actions/supplier.ts), the supplier API and the phone app's quick edit all use it.
// Tested in tests/supplier-product-review.test.mjs.

export const REVIEWED_PRODUCT_FIELDS = ["name", "description", "categoryId", "images", "wholesalePrice", "wholesalePriceTo", "suggestedRetailPrice", "pricingTiers", "currency"] as const;

function same(a: unknown, b: unknown): boolean {
  const norm = (value: unknown): string => {
    if (value === undefined || value === null || value === "") return "null";
    if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "null";
    if (typeof value === "string") return JSON.stringify(value.trim());
    if (Array.isArray(value)) return `[${value.map(norm).join(",")}]`;
    if (typeof value === "object") {
      return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${key}:${norm((value as Record<string, unknown>)[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return norm(a) === norm(b);
}

/** True when an edit to a product changes something the team reviews. Fields left out of `next` aren't changing. */
export function editNeedsReview(current: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return REVIEWED_PRODUCT_FIELDS.some((field) => field in next && next[field] !== undefined && !same(current[field], next[field]));
}

/**
 * The status after saving an edit. A live product stays live unless the edit needs review; a draft stays a draft
 * unless the supplier asked for review; unverified suppliers only keep drafts.
 */
export function statusAfterEdit(input: { current: string; verified: boolean; submit: boolean; needsReview: boolean }): "draft" | "pending_review" | "published" {
  if (!input.verified) return "draft";
  if (input.current === "published") return input.needsReview ? "pending_review" : "published";
  if (input.submit || input.current === "pending_review") return "pending_review";
  return "draft";
}
