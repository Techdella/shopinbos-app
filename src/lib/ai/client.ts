import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { STORE_TEMPLATE_MEMORY } from "@/lib/ai/store-design-memory";

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

export const CHIP_MODEL = "claude-sonnet-4-6";
export const REX_OPENAI_MODEL = process.env.OPENAI_REX_MODEL ?? "gpt-5.4-mini";
export const PEGGY_OPENAI_MODEL = process.env.OPENAI_PEGGY_MODEL ?? process.env.OPENAI_REX_MODEL ?? "gpt-5.4-mini";
export const PEGGY_CLAUDE_MODEL = process.env.ANTHROPIC_PEGGY_MODEL ?? process.env.ANTHROPIC_MODEL ?? CHIP_MODEL;

export interface StoreConfig {
  name: string;
  slug: string;
  tagline: string;
  heroHeadline: string;
  heroSubline: string;
  heroCtaText: string;
  logoUrl?: string | null;
  palette: {
    heroBg: string;
    heroText: string;
    accent: string;
    ctaBg: string;
    ctaText: string;
    paperBg: string;
  };
  fontStyle: "fraunces" | "grotesk";
  navLinks: string[];
  products: Array<{
    name: string;
    subtitle: string;
    price: string;
    color: string;
    imageUrl?: string;
  }>;
  changed: string[];
}

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  name: "Your Store",
  slug: "your-store",
  tagline: "Quality products, delivered.",
  heroHeadline: "Tell Rex about your business.",
  heroSubline: "He'll build your store in real time.",
  heroCtaText: "Shop now",
  palette: {
    heroBg: "#0E2A38",
    heroText: "#FAF7F1",
    accent: "#73D8C8",
    ctaBg: "#73D8C8",
    ctaText: "#0E2A38",
    paperBg: "#FAF7F1",
  },
  fontStyle: "fraunces",
  navLinks: ["Products", "About", "Contact"],
  products: [
    { name: "Product One", subtitle: "Your first item", price: "â‚¦0", color: "#2E7E78" },
    { name: "Product Two", subtitle: "Your second item", price: "â‚¦0", color: "#F2A93B" },
    { name: "Product Three", subtitle: "Your third item", price: "â‚¦0", color: "#6B4F8A" },
  ],
  changed: [],
};

export const CHIP_SYSTEM_PROMPT = `You are Rex, the AI store builder for Shopinbos — Africa's AI commerce platform. You help entrepreneurs across Nigeria, Ghana, Kenya, and beyond build beautiful online stores through natural conversation.

When someone tells you about their business, you:
1. Respond specifically — use their actual product names, location, and brand story
2. Keep tone warm and competent, without emojis or over-excitement
3. Explain what you're building as you build it
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
