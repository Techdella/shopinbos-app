import "server-only";

import { firstJsonObject, generateText } from "@/lib/ai/text";
import { INFO_FIELD_LABEL, PRODUCT_TYPE_INFO, cleanContent, type PackContent, type ProductType } from "@shared/packaging";

// Peggy writes the words on a pack: name line, tagline, claims, a short description and the back-of-pack fields
// the product type needs (ingredients, how to use, storage, caution, care…). She never invents facts that matter for
// safety or the law: registration numbers, batch and expiry stay the seller's, and ingredients she wasn't given
// come back as a clearly marked template to fill in.

export interface CopyRequest {
  storeName: string;
  productType: ProductType;
  name: string;
  description?: string | null;
  brief?: string | null;
  price?: string | null;
  /** What's already on the pack, so Peggy improves rather than replaces. */
  current?: Partial<PackContent>;
}

export async function writePackCopy(input: CopyRequest): Promise<Partial<PackContent> | null> {
  const type = PRODUCT_TYPE_INFO[input.productType];
  const fields = type.fields.filter((field) => field !== "nutrition");
  const given = input.current ? Object.entries(input.current).filter(([, value]) => (typeof value === "string" ? value.trim() : Array.isArray(value) && value.length)) : [];
  const prompt = [
    `Write the words for the packaging of a product sold by ${input.storeName}, a Nigerian business.`,
    `Product: ${input.name}. Type: ${type.name}.${input.price ? ` Price: ${input.price}.` : ""}`,
    input.description ? `What the seller says about it: ${input.description.slice(0, 600)}` : "",
    input.brief ? `What they want on the pack: ${input.brief.slice(0, 500)}` : "",
    given.length ? `Already on the pack (keep facts, improve the wording): ${JSON.stringify(Object.fromEntries(given)).slice(0, 1500)}` : "",
    "Return JSON only with these keys:",
    `{"name": "product name as it should appear big on the front, max 3 words", "variant": "flavour, scent or variant line, max 4 words, or empty", "tagline": "max 8 words, warm and confident", "claims": ["3 short benefit badges, max 4 words each, only true to what you were told"], "description": "2 short sentences for the back, under 40 words", ${fields
      .map((field) => `"${field}": "${INFO_FIELD_LABEL[field]} text"`)
      .join(", ")}}`,
    "Rules: clear Nigerian English, no emojis, no hashtags. Never invent registration numbers, batch numbers, dates, prices or health claims.",
    fields.includes("ingredients") ? "If you weren't told the ingredients, write a short template like \"[Main ingredient], [ingredient], [ingredient]\" so the seller fills in the truth." : "",
    fields.includes("warnings") ? "Cautions: the standard ones for this kind of product (e.g. keep out of reach of children, for external use only)." : "",
  ]
    .filter(Boolean)
    .join("\n");
  const raw = await generateText(prompt, "You are Peggy, Shopinbos's product copywriter. You write short, honest packaging copy that reads well in print.").catch(() => null);
  const json = firstJsonObject(raw);
  if (!json) return null;
  const cleaned = cleanContent(json);
  const out: Partial<PackContent> = {};
  for (const key of ["name", "variant", "tagline", "description", ...fields] as Array<keyof PackContent>) {
    const value = cleaned[key];
    if (typeof value === "string" && value) (out as Record<string, unknown>)[key] = value;
  }
  if (cleaned.claims.length) out.claims = cleaned.claims.slice(0, 3);
  return out;
}

/** Fallback words when AI is off: still a usable starting point. */
export function fallbackPackCopy(input: CopyRequest): Partial<PackContent> {
  const type = PRODUCT_TYPE_INFO[input.productType];
  return {
    name: input.name.split(/\s+/).slice(0, 3).join(" "),
    tagline: `Made with care by ${input.storeName}`.slice(0, 90),
    claims: type.claims.slice(0, 3),
    description: (input.description ?? `${input.name} from ${input.storeName}.`).slice(0, 220),
    ...(type.fields.includes("ingredients") ? { ingredients: "[Main ingredient], [ingredient], [ingredient]" } : {}),
    ...(type.fields.includes("warnings") ? { warnings: "Keep out of reach of children." } : {}),
    ...(type.fields.includes("storage") ? { storage: "Store in a cool, dry place away from sunlight." } : {}),
  };
}
