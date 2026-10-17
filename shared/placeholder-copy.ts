// Builder guidance written for the seller ("Add your shipping or payment message here.") must never reach shoppers.
// Templates now seed those fields empty and show the guidance as an input hint, but stores saved before that still
// hold the old text. This is the single list of that legacy copy: the live store hides it at render time
// (isPlaceholderCopy), the builder marks it "edit me", and scripts/clean-placeholder-copy.mjs blanks it in saved
// snapshots (blankPlaceholderCopy). Pure and dependency-free so Node can import it with type stripping.

/** `{store}` stands for any store name (the store may have been renamed since the text was seeded). */
export const LEGACY_PLACEHOLDER_COPY: readonly string[] = [
  // Blank store (src/lib/store-templates/editor.ts)
  "{store} is getting ready. Add your logo, products, contact details, and policies before publishing.",
  "Add your shipping or payment message here.",
  "Add your phone, email, address, and response details here.",
  "Start with a blank store",
  "Add content here.",
  "Add content here. Introduce what you sell, who it is for, and why shoppers should buy from you.",
  "Add content here. Share your values, sourcing, process, or customer promise.",
  "Use this space for a brand value.",
  "Use this space for a service promise.",
  "Use this space for customer support details.",
  "Click to replace image",
  "Product placeholder",
  "Connect a real product",
  "Connect products to display them here",
  "Connect products to display them here.",
  "Your latest products will appear here once added. You can also map specific products from the settings panel.",
  "Your products will appear here once added.",
  "Category, price, and sort controls are ready for shoppers.",
  "When a shopper selects a product, real product information, images, price, variants, reviews, and add-to-cart actions appear here.",
  "Cart items, totals, delivery estimates, and checkout actions appear here.",
  "Tell your story",
  // Section library (src/lib/store-templates/http.ts)
  "Share your story — sourcing, standards, process, values, or what makes you different.",
  "Build a beautiful storefront.",
  "Introduce your brand with a strong headline, supporting copy, and a clear call to action.",
  "Tell shoppers what makes this store different.",
  "Share your sourcing, process, values, or customer promise in clear language.",
  "Feature a fresh promotion.",
  "Use this section for launch drops, bundles, discounts, or a time-sensitive callout.",
  "Add more context here.",
  "Use this section for sourcing notes, policy details, brand story, or category guidance.",
  "Use this for a supporting point.",
  "Invite visitors back.",
  "Use this for email updates, launch alerts, or a WhatsApp join prompt.",
  "Showcase your best products and make it easy for shoppers to buy.",
  "Help shoppers browse by category, price, availability, and newest arrivals.",
  "Guide customers into the right collection.",
  "A conversion-ready product detail page with gallery, price, variations, quantity, trust notes, and add-to-cart actions.",
  "Customer details, delivery address, payment summary, and order confirmation are ready.",
  "Let shoppers return to products they love.",
  "Publish guides, announcements, and product education that help shoppers buy with confidence.",
  "Useful post ideas that support SEO and repeat visits.",
  "Add a new section.",
  "Rex or the visual editor can reshape this into a richer content block.",
  // Theme converter and layout elements
  "Edit this theme copy to match your brand.",
  "Tell shoppers something useful here.",
];

/** Shapes of seller guidance beyond the exact list ("Add your returns message here.", "... before publishing."). */
export const PLACEHOLDER_COPY_PATTERNS: readonly RegExp[] = [
  /^(add|write|type|put) your\b.*\bhere\.?$/i,
  /\bbefore publishing\.?$/i,
  /^add content here\b/i,
  /^click to (replace|add|upload)\b/i,
];

function normalise(text: string) {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EXACT = new Set<string>();
const WITH_STORE: RegExp[] = [];
for (const entry of LEGACY_PLACEHOLDER_COPY) {
  const key = normalise(entry);
  if (key.includes("{store}")) WITH_STORE.push(new RegExp(`^${key.split("{store}").map(escapeRegExp).join(".{1,160}?")}$`));
  else EXACT.add(key);
}

/**
 * True when `text` is builder guidance meant for the seller, not copy for shoppers. `storeName` lets a `{store}`
 * entry match exactly when the text was seeded with the current name (older names match through the pattern).
 */
export function isPlaceholderCopy(text: unknown, storeName?: string | null): boolean {
  if (typeof text !== "string") return false;
  const key = normalise(text);
  if (!key) return false;
  if (EXACT.has(key)) return true;
  const name = storeName ? normalise(storeName) : "";
  if (name && LEGACY_PLACEHOLDER_COPY.some((entry) => entry.includes("{store}") && normalise(entry).replace("{store}", name) === key)) return true;
  if (WITH_STORE.some((pattern) => pattern.test(key))) return true;
  return PLACEHOLDER_COPY_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

/** What a shopper sees for a saved text: the trimmed text, or "" when it's empty or seller guidance. */
export function shopperCopy(text: unknown, storeName?: string | null): string {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  return trimmed && !isPlaceholderCopy(trimmed, storeName) ? trimmed : "";
}

/**
 * The footer's line about the store on the live store: the seller's own summary, else the store description,
 * else the brand tagline, else nothing. Guidance copy never counts as a summary.
 */
export function footerSummaryForShoppers(summary: unknown, store: { name?: string | null; description?: string | null; tagline?: string | null }): string {
  return shopperCopy(summary, store.name) || shopperCopy(store.description, store.name) || shopperCopy(store.tagline, store.name);
}

/** The tagline saved in a store's brand settings (Brand kit), or "". */
export function brandTagline(brandSettings: unknown): string {
  if (!brandSettings || typeof brandSettings !== "object" || Array.isArray(brandSettings)) return "";
  const tagline = (brandSettings as Record<string, unknown>).tagline;
  return typeof tagline === "string" ? tagline.trim() : "";
}

/**
 * A copy of `value` (an editor snapshot, page content or any JSON) with every string that is seller guidance
 * replaced by "". Keys are never touched. Returns null when nothing changed, so callers can skip the write.
 */
export function blankPlaceholderCopy<T>(value: T, storeName?: string | null): T | null {
  let changed = false;
  const walk = (entry: unknown): unknown => {
    if (typeof entry === "string") {
      if (isPlaceholderCopy(entry, storeName)) {
        changed = true;
        return "";
      }
      return entry;
    }
    if (Array.isArray(entry)) return entry.map(walk);
    if (!entry || typeof entry !== "object") return entry;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(entry as Record<string, unknown>)) out[key] = walk(inner);
    return out;
  };
  const result = walk(value);
  return changed ? (result as T) : null;
}
