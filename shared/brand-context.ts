// What Rex and Peggy know about a seller's brand: logo, colours, what they sell, who buys, how they talk.
// Loaded on the server by src/lib/ai/brand-context.server.ts; the parts here are pure so the picture brief,
// the "with my logo" check and the idea list are unit-tested (tests/behaviour.test.mjs).

export interface BrandProductFact {
  id: string;
  name: string;
  /** "₦12,500" */
  price: string;
  category: string | null;
  /** The main photo, or null when it has none. */
  photo: string | null;
  sold: number;
}

export interface BrandContext {
  storeName: string;
  /** One or two lines on what the business is. */
  business: string | null;
  /** The onboarding category, e.g. "Food & drinks". */
  category: string | null;
  location: string | null;
  logoUrl: string | null;
  /** Hex colours from the store's theme (accent, text, background, button, hero). */
  colours: { accent: string; ink: string; paper: string; button: string; hero: string } | null;
  paletteName: string | null;
  /** "serif" or "grotesk" headings. */
  headingStyle: string | null;
  /** Who buys (from onboarding). */
  audience: string | null;
  /** The feel the seller described (from onboarding). */
  vibe: string | null;
  categories: Array<{ name: string; products: number }>;
  /** Best sellers first, then the newest. */
  products: BrandProductFact[];
  productCount: number;
}

/** The compact version that goes in Rex's and Peggy's context. */
export function brandContextForAi(brand: BrandContext) {
  return {
    name: brand.storeName,
    business: brand.business,
    category: brand.category,
    location: brand.location,
    logo: brand.logoUrl ? { url: brand.logoUrl } : "none yet (they can upload one in Brand kit, /home/brand-kit, or ask Rex to design one)",
    colours: brand.colours,
    palette: brand.paletteName,
    headings: brand.headingStyle,
    customers: brand.audience,
    feel: brand.vibe,
    categories: brand.categories,
    productCount: brand.productCount,
    products: brand.products.map((product) => ({ id: product.id, name: product.name, price: product.price, category: product.category, sold: product.sold, photo: product.photo })),
  };
}

const LOGO_ASK = /\b(?:my|our|the|with|add|put|include|use)\s+(?:shop'?s?\s+|store'?s?\s+|brand(?:'s)?\s+|business\s+)?logo\b|\bbranded\b|\bbrand\s+(?:mark|label)\b/i;

/** True when the seller asks for their own logo on the picture ("with my logo", "branded jar"). */
export function wantsLogo(prompt: string) {
  return LOGO_ASK.test(prompt);
}

export interface BrandBriefOptions {
  /** Put the seller's logo on it (the logo is passed as the first reference image). */
  logo: boolean;
  /** Keep to the brand colours and feel. */
  colours: boolean;
  /** How many other reference pictures come after the logo. */
  otherReferences?: number;
}

/**
 * Lines added to a picture request so the image model draws this brand: its colours, its logo (when it is
 * sent as a reference), what it sells, and a Nigerian setting when people or places appear.
 */
export function brandImageBrief(brand: BrandContext | null, options: BrandBriefOptions): string {
  const lines: string[] = [];
  const others = options.otherReferences ?? 0;
  if (brand) {
    if (options.logo && brand.logoUrl) {
      lines.push(
        `The first reference image is the logo of "${brand.storeName}". Put this exact logo on the product's label, packaging or sign where a brand would really go: same letters, shapes and colours, sharp and readable. Do not redraw, restyle, translate or misspell it, and do not add any other brand name.`,
      );
    } else if (options.logo) {
      lines.push(`Show the brand name "${brand.storeName}" on the label in clean, simple lettering.`);
    }
    if (options.colours && brand.colours) {
      lines.push(`Brand colours: ${brand.colours.accent} (accent), ${brand.colours.button} (buttons), ${brand.colours.ink} (text), ${brand.colours.paper} (background tone). Use them in props, labels and backdrop accents where it looks natural; never let them recolour the product itself.`);
    }
    if (options.colours && brand.vibe) lines.push(`The brand's feel: ${brand.vibe}.`);
    const sells = brand.business ?? (brand.categories.length ? brand.categories.map((c) => c.name).join(", ") : brand.category);
    if (sells) lines.push(`About the business: ${sells.slice(0, 240)}${brand.location ? `, based in ${brand.location}` : ""}.`);
  }
  if (others > 0) {
    lines.push(`${options.logo && brand?.logoUrl ? "The other reference images are" : others === 1 ? "The reference image is" : "The reference images are"} the seller's own photos: keep the product true to them (shape, colour, contents, details).`);
  }
  lines.push("If people or places appear, show Nigerian people and real Nigerian settings. No watermarks and no extra text unless asked.");
  return lines.join("\n");
}

/** A product name the seller would recognise in an idea ("plantain chips"). */
function short(name: string) {
  return name.replace(/\s*[-–|(].*$/, "").trim().slice(0, 60) || name.slice(0, 60);
}

/** The Nigerian moment coming up next, for seasonal ideas. */
export function nextNigerianMoment(now = new Date()) {
  const month = now.getMonth();
  const day = now.getDate();
  if (month === 0 || (month === 1 && day <= 14)) return "Val's Day";
  if (month <= 3) return "Easter and Sallah";
  if (month <= 5) return "Sallah celebrations";
  if (month <= 8) return "back-to-school";
  if (month === 9 && day <= 1) return "Independence Day";
  if (month <= 10) return "Black Friday";
  return "Detty December";
}

/**
 * Picture ideas from the seller's real products and categories (best sellers first), so the Ideas list
 * matches what they sell. Falls back to general ideas when the shop has no products yet.
 */
export function brandImageIdeas(brand: BrandContext | null, now = new Date()): string[] {
  if (!brand || !brand.products.length) return [];
  const [first, second, third] = brand.products.map((product) => short(product.name));
  const logo = brand.logoUrl ? " with my logo on the label" : "";
  const colours = brand.colours ? " in my brand colours" : "";
  const moment = nextNigerianMoment(now);
  const ideas = [
    `Professional product photo of ${first}${logo}, on a clean white background, soft studio lighting`,
    `Lifestyle photo of a young Nigerian woman enjoying ${second ?? first} at home in Lagos, warm natural light`,
    `${moment} promo banner for ${brand.storeName} featuring ${first}${third ? ` and ${third}` : ""}${colours}, bold headline space`,
    `Flat lay of ${[first, second, third].filter(Boolean).join(", ")} on Ankara fabric, shot from above${colours}`,
    `Instagram post of ${second ?? first} with props that suit it, square, bright and clean${logo}`,
  ];
  if (brand.categories.length > 1) ideas.push(`Banner showing my ${brand.categories.slice(0, 3).map((c) => c.name.toLowerCase()).join(", ")} side by side${colours}`);
  return ideas;
}
