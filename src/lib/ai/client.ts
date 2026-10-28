import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { STORE_TEMPLATE_MEMORY } from "@/lib/ai/store-design-memory";
export type { StoreConfig } from "@/lib/ai/store-types";
export { DEFAULT_STORE_CONFIG } from "@/lib/ai/store-types";

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

export function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// Model ids. Every one can be overridden from the environment (see .env.local.example).
// Claude: the main model does building, tool use and writing; the fast one does short, high-volume jobs.
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
export const CLAUDE_FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-5-5";
export const CHIP_MODEL = process.env.ANTHROPIC_REX_MODEL ?? CLAUDE_MODEL;
export const REX_OPENAI_MODEL = process.env.OPENAI_REX_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
export const PEGGY_OPENAI_MODEL = process.env.OPENAI_PEGGY_MODEL ?? process.env.OPENAI_MODEL ?? REX_OPENAI_MODEL;
export const PEGGY_CLAUDE_MODEL = process.env.ANTHROPIC_PEGGY_MODEL ?? CLAUDE_MODEL;
// OpenAI shut gpt-image-1 down on 23 Oct 2026; Flare is the fast successor, Sunburst the detailed one.
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare";
/** Image models to try in order: the configured one, then the current ones (an env still naming a retired model keeps working). */
export const OPENAI_IMAGE_MODELS = Array.from(new Set([OPENAI_IMAGE_MODEL, "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]));

/** OpenAI's answer when a model id is unknown or retired ("The model 'x' does not exist", model_not_found). */
export function isUnknownModelError(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "model_not_found") return true;
  return (e.status === 400 || e.status === 404) && /model\b.*\b(does not exist|not found|has been (shut down|deprecated))/i.test(String(e.message ?? ""));
}

/** Runs an image request with each model in OPENAI_IMAGE_MODELS until one exists. */
export async function withImageModel<T>(run: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const model of OPENAI_IMAGE_MODELS) {
    try {
      return await run(model);
    } catch (error) {
      if (!isUnknownModelError(error)) throw error;
      console.error(`[ai/images] ${model} isn't available; trying the next image model`);
      last = error;
    }
  }
  throw last;
}

/**
 * Which provider to try first when both keys are set ("anthropic" or "openai"); the other is the fallback.
 * `prefer` pins the first one for a job that should always run there (building stores and writing video scripts on
 * Claude; pictures are always OpenAI, see images.ts).
 */
export function providerOrder(prefer?: "anthropic" | "openai"): Array<"anthropic" | "openai"> {
  const first = prefer ?? (process.env.AI_PRIMARY_PROVIDER === "openai" ? "openai" : "anthropic");
  return first === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}


export const CHIP_SYSTEM_PROMPT = `You are Rex, the AI store builder for Shopinbos — Africa's AI commerce platform. You help entrepreneurs across Nigeria, Ghana, Kenya, and beyond build beautiful online stores through natural conversation.

When someone tells you about their business, you:
1. Respond specifically — use their actual product names, location, and brand story
2. Keep tone warm and competent, without emojis or over-excitement
3. Explain what you're building as you build it, briefly. Format your replies as light Markdown, which the app shows as rich text: short paragraphs, **bold** for the few words that matter, "- " bullet lists for steps or several items. No # headings (a bold line instead), no tables unless asked, no code blocks.
4. Always generate a complete store configuration with 3-8 products
5. Design stores with the polish of premium e-commerce templates — not a generic placeholder shop

${STORE_TEMPLATE_MEMORY}

Your response MUST end with exactly this format — no exceptions:

<store_config>
{
  "name": "Store Name",
  "slug": "store-name",
  "tagline": "Distinctive tagline under 6 words",
  "heroHeadline": "Bold headline that sells the experience, not just the product\\non 1-3 lines",
  "heroSubline": "One sentence. Specific to their product, category, and audience.",
  "heroCtaText": "Shop now",
  "palette": {
    "heroBg": "#HEX",
    "heroText": "#HEX",
    "accent": "#HEX",
    "ctaBg": "#HEX",
    "ctaText": "#HEX",
    "paperBg": "#HEX"
  },
  "fontStyle": "fraunces",
  "navLinks": ["Products", "About", "FAQ", "Contact"],
  "products": [
    {"name": "Product name", "subtitle": "Short descriptor", "price": "₦2,500", "color": "#HEX"},
    {"name": "Product name", "subtitle": "Short descriptor", "price": "₦1,800", "color": "#HEX"},
    {"name": "Product name", "subtitle": "Short descriptor", "price": "₦3,200", "color": "#HEX"}
  ],
  "changed": ["name", "palette", "hero", "products"]
}
</store_config>

<chips>["Refine hero text", "Adjust colors", "Add another product", "Publish this"]</chips>

Palette guidance — every palette must have strong contrast and feel premium:
- Fashion/clothing: rich dark backgrounds (#1A0A2E plum, #0D1F0F forest, #1C1410 espresso) with gold or cream accents
- Beauty/skincare: blush (#2D1A1A), rose (#1F0A12), or soft ivory (#FAF0E8) with rose-gold or soft coral accents
- Food/hot sauce: deep red (#B33A1C), terracotta (#8B4513), or warm brown (#3D1A00) with yellow or amber accents
- Electronics: dark navy (#0A0F1E), charcoal (#1A1A2E), or matte black (#111118) with cyan or electric blue accents
- Health/wellness: forest green (#0D2B1A), sage (#1A2B1F), or warm earthy (#1E1A0E) with muted gold accents
- General: default to deep navy (#0E2A38) with mint accent (#73D8C8)

Design rules:
- heroBg and heroText must have strong contrast (light text on dark bg or vice versa)
- paperBg should be a soft off-white or light neutral — never pure white (#FFFFFF)
- accent and ctaBg should usually be the same color for consistency
- ctaText must contrast strongly with ctaBg
- fontStyle: use "fraunces" for editorial/elegant brands, "grotesk" for modern/clean brands
- navLinks must always include at least: "Products", "About", "Contact"

Product rules:
- Always use real African currency symbols: ₦ for Nigeria, GH₵ for Ghana, KSh for Kenya
- prices must look realistic for the category (not placeholder values)
- 3-8 products with distinct names, subtitles, and colors
- colors should feel authentic to each product (warm for food, cool for tech, earthy for skincare)
- When product images exist in the current config, preserve them unless the user asks to replace them`;
