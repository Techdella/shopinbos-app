import "server-only";
import { CHIP_SYSTEM_PROMPT, DEFAULT_STORE_CONFIG, type StoreConfig } from "@/lib/ai/client";
import { getTemplateManifest, summarizeTemplateForAi } from "@/lib/store-templates";

// System prompts shared by the streaming store builder (/api/ai/store-builder) and the one-shot
// "build my store" path (/api/ai/build-store).

export interface BrandContext {
  paletteName?: string;
  paletteColors?: Record<string, string>;
  logoUrl?: string | null;
  logoLabel?: string;
  customerWho?: string;
  customerVibe?: string;
  category?: string;
  businessDescription?: string;
  documentNotes?: string;
}

export interface TemplateContext {
  templateId: string;
  templateName: string;
  layoutFamily?: string;
  category?: string;
  sourcePack?: string;
  sourcePath?: string;
  supportedPages?: string[];
  aiHints?: string[];
}

export const STORE_BUILDER_OUTPUT_CONTRACT = `Return a short conversational reply first, then end with exactly these two machine-readable blocks:

<store_config>
{
  "name": "Store Name",
  "slug": "store-name",
  "tagline": "Distinctive tagline under 6 words",
  "heroHeadline": "Bold headline selling the experience, not just the product\\non 1-3 lines",
  "heroSubline": "One specific sentence for this store and audience.",
  "heroCtaText": "Shop now",
  "palette": {
    "heroBg": "#0E2A38",
    "heroText": "#FAF7F1",
    "accent": "#73D8C8",
    "ctaBg": "#73D8C8",
    "ctaText": "#0E2A38",
    "paperBg": "#FAF7F1"
  },
  "fontStyle": "fraunces",
  "navLinks": ["Products", "About", "FAQ", "Contact"],
  "products": [
    {"name": "Product name", "subtitle": "Short descriptor", "price": "NGN 2500", "color": "#2E7E78"}
  ],
  "changed": ["name", "palette", "hero", "products"]
}
</store_config>

<chips>["Refine hero text", "Adjust colors", "Add another product", "Publish this"]</chips>

The JSON inside the tags must be valid JSON. Do not wrap it in Markdown. If the seller only asks a question and nothing about the store should change, you may leave out the store_config block.`;

const BUILD_RULES = `Build the store fully. The preview must render a complete premium storefront: strong hero with a headline that sells the experience, 3-8 products with realistic African pricing, proper nav links (Products, About, FAQ, Contact), category-appropriate palette with strong contrast, and product colors that match each item. Use section variety and image-led merchandising instead of a plain hero plus grid. Keep existing product imageUrl values from the current config unless the user asks to replace them. When the seller asks for a change, change only what they asked for and keep everything else from the current config. Do not use emojis. Never claim you published the store, took payments or changed settings: publishing is a separate step the seller takes.`;

function brandLines(brandContext?: BrandContext | null) {
  if (!brandContext) return "";
  const lines: string[] = [];
  if (brandContext.paletteName) lines.push(`Palette chosen in onboarding: "${brandContext.paletteName}"`);
  if (brandContext.category) lines.push(`Product/business category from onboarding: ${brandContext.category}`);
  if (brandContext.businessDescription) lines.push(`Business description from onboarding: ${brandContext.businessDescription}`);
  if (brandContext.customerWho) lines.push(`Target customers: ${brandContext.customerWho}`);
  if (brandContext.customerVibe) lines.push(`Brand vibe the user wants: ${brandContext.customerVibe}`);
  if (brandContext.documentNotes) lines.push(`Useful notes from uploaded onboarding documents: ${brandContext.documentNotes}`);
  if (brandContext.logoLabel) lines.push(`Logo style selected: "${brandContext.logoLabel}"`);
  else if (brandContext.logoUrl) lines.push("User uploaded a custom logo in onboarding.");
  if (brandContext.paletteColors) {
    const c = brandContext.paletteColors;
    lines.push(`Palette hex values: heroBg=${c.heroBg}, accent=${c.accent}, paperBg=${c.paperBg}`);
  }
  if (!lines.length) return "";
  return `\n\nBrand and business context already set up by the user in onboarding:\n${lines.map((l) => `- ${l.slice(0, 1500)}`).join("\n")}\n\nAcknowledge this context naturally. Do not ask the same setup questions again. When generating store_config, use the remembered category, customer, document, logo, and palette values unless the user explicitly asks to change them.`;
}

function templateLines(templateContext?: TemplateContext | null) {
  if (!templateContext?.templateId) return "";
  const manifest = getTemplateManifest(templateContext.templateId);
  const supportedPages = templateContext.supportedPages ?? manifest?.supportedPages;
  const aiHints = templateContext.aiHints ?? manifest?.aiHints;
  const templateSummary = summarizeTemplateForAi(templateContext.templateId);

  return `\n\nThe seller has already selected a store template:
- Template id: ${templateContext.templateId}
- Template name: ${templateContext.templateName}
- Layout family: ${templateContext.layoutFamily ?? manifest?.layoutFamily ?? "not specified"}
- Category: ${templateContext.category ?? manifest?.category ?? "not specified"}
- Supported live pages: ${(supportedPages ?? []).join(", ") || "home, shop, product, categories, wishlist, cart, checkout, blog, contact, FAQ"}
- Template design hints: ${(aiHints ?? []).join("; ") || "Use the selected template's visual rhythm, spacing, merchandising structure, and page depth."}
- Editable template blueprint: ${JSON.stringify(templateSummary)}

Keep the generated store aligned with that chosen template family instead of starting from a generic blank store.`;
}

function currentStoreLines(currentStore?: StoreConfig | null) {
  if (!currentStore || currentStore.name === DEFAULT_STORE_CONFIG.name) return "";
  return `\n\nThe store as it is right now (edit this, don't start over unless asked):\n${JSON.stringify(currentStore).slice(0, 12000)}`;
}

/** System prompt for the streaming builder chat (prose + <store_config> + <chips>). */
export function storeBuilderSystemPrompt(args: {
  brandContext?: BrandContext | null;
  templateContext?: TemplateContext | null;
  currentStore?: StoreConfig | null;
  docNames?: string[];
}) {
  const docs = args.docNames?.length ? `\n\nDocuments the seller attached (names only; you cannot read their contents): ${args.docNames.join(", ")}` : "";
  return `${CHIP_SYSTEM_PROMPT}${brandLines(args.brandContext)}${templateLines(args.templateContext)}${currentStoreLines(args.currentStore)}${docs}\n\n${BUILD_RULES}\n\n${STORE_BUILDER_OUTPUT_CONTRACT}`;
}

/** System prompt for the one-shot build: JSON only. */
export function buildStoreJsonSystemPrompt(args: {
  brandContext?: BrandContext | null;
  templateContext?: TemplateContext | null;
  currentStore?: StoreConfig | null;
}) {
  return `You are Rex, the AI store builder for Shopinbos, building a complete online store for an African business from the seller's brief and conversation.${brandLines(args.brandContext)}${templateLines(args.templateContext)}${currentStoreLines(args.currentStore)}

${BUILD_RULES}

Reply with ONE JSON object only (no prose, no Markdown), with exactly these keys:
{"name": string, "slug": string, "tagline": string, "heroHeadline": string, "heroSubline": string, "heroCtaText": string,
 "palette": {"heroBg": "#RRGGBB", "heroText": "#RRGGBB", "accent": "#RRGGBB", "ctaBg": "#RRGGBB", "ctaText": "#RRGGBB", "paperBg": "#RRGGBB"},
 "fontStyle": "fraunces" | "grotesk", "navLinks": string[],
 "products": [{"name": string, "subtitle": string, "price": "₦12,500", "color": "#RRGGBB"}],
 "changed": string[],
 "heroImagePrompt": "one sentence describing a photo (no words or logos in it) that suits the hero banner",
 "productImagePrompt": "one sentence describing a clean studio photo of the first product"}

Use the seller's real business, products and location. Prices use the local currency symbol (₦ for Nigeria, GH₵ for Ghana, KSh for Kenya). heroBg/heroText and ctaBg/ctaText must contrast strongly; paperBg is a soft off-white.`;
}
