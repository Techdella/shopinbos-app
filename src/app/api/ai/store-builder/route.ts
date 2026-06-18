import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import {
  getAnthropicClient,
  getOpenAIClient,
  CHIP_MODEL,
  CHIP_SYSTEM_PROMPT,
  DEFAULT_STORE_CONFIG,
  REX_OPENAI_MODEL,
  type StoreConfig,
} from "@/lib/ai/client";
import { getTemplateManifest, summarizeTemplateForAi } from "@/lib/store-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function encode(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"));
}

interface BrandContext {
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

interface TemplateContext {
  templateId: string;
  templateName: string;
  layoutFamily?: string;
  category?: string;
  sourcePack?: string;
  sourcePath?: string;
  supportedPages?: string[];
  aiHints?: string[];
}

interface ApiChatMessage extends ChatMessage {
  imageDataUrls?: string[];
}

function buildSystemPrompt(brandContext?: BrandContext | null): string {
  let prompt = CHIP_SYSTEM_PROMPT;
  if (!brandContext) return prompt;

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

  if (lines.length > 0) {
    prompt += `\n\nBrand and business context already set up by the user in onboarding:\n${lines.map((l) => `- ${l}`).join("\n")}\n\nAcknowledge this context naturally. Do not ask the same setup questions again. When generating store_config, use the remembered category, customer, document, logo, and palette values unless the user explicitly asks to change them.`;
  }
  return prompt;
}

function buildTemplatePrompt(prompt: string, templateContext?: TemplateContext | null) {
  if (!templateContext) return prompt;
  const manifest = getTemplateManifest(templateContext.templateId);
  const category = templateContext.category ?? manifest?.category;
  const sourcePack = templateContext.sourcePack ?? manifest?.sourcePack;
  const sourcePath = templateContext.sourcePath ?? manifest?.sourcePath;
  const supportedPages = templateContext.supportedPages ?? manifest?.supportedPages;
  const aiHints = templateContext.aiHints ?? manifest?.aiHints;
  const templateSummary = summarizeTemplateForAi(templateContext.templateId);

  return `${prompt}

The seller has already selected a store template:
- Template id: ${templateContext.templateId}
- Template name: ${templateContext.templateName}
- Layout family: ${templateContext.layoutFamily ?? manifest?.layoutFamily ?? "not specified"}
- Category: ${category ?? "not specified"}
- Source pack: ${sourcePack ?? "not specified"}
- Source preview path: ${sourcePath ?? "not specified"}
- Supported live pages: ${(supportedPages ?? []).join(", ") || "home, shop, product, categories, wishlist, cart, checkout, blog, contact, FAQ"}
- Template design hints: ${(aiHints ?? []).join("; ") || "Use the selected template's visual rhythm, spacing, merchandising structure, and page depth."}
- Editable template blueprint: ${JSON.stringify(templateSummary)}

Keep the generated store aligned with that chosen template family instead of starting from a generic blank store. If the template comes from an imported static HTML pack, translate the style and page structure into live Shopinbos data-backed sections instead of copying dead mockup content. Use the blueprint pageTypes and section kinds exactly; product detail stays pageType "product" and must not be added to visible navigation.`;
}

const STORE_BUILDER_OUTPUT_CONTRACT = `Return a short conversational reply first, then end with exactly these two machine-readable blocks:

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

The JSON inside the tags must be valid JSON. Do not wrap it in Markdown.`;

type AnthropicImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function toAnthropicMessages(
  messages: ApiChatMessage[],
  currentImageDataUrls?: string[],
  currentDocNames?: string[],
  currentStore?: StoreConfig,
) {
  return messages.map((m, idx) => {
    const isLast = idx === messages.length - 1;
    const images = isLast && currentImageDataUrls?.length ? currentImageDataUrls : (m.imageDataUrls ?? []);
    const docs = isLast && currentDocNames?.length ? currentDocNames : [];

    // Build text content
    let text = m.content;
    if (idx === 0 && currentStore && currentStore.name !== DEFAULT_STORE_CONFIG.name) {
      text = `Current store: ${currentStore.name} / ${currentStore.tagline} / products: ${currentStore.products.map((p) => p.name).join(", ")}\n\n${text}`;
    }
    if (docs.length > 0) {
      text += `\n\n[Documents attached: ${docs.join(", ")}]`;
    }

    if (images.length === 0) {
      return { role: m.role as "user" | "assistant", content: text };
    }

    // Multimodal: images + text
    const imageParts = images.map((dataUrl) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      const mediaType = (match?.[1] ?? "image/jpeg") as AnthropicImageMediaType;
      const data = match?.[2] ?? dataUrl;
      return {
        type: "image" as const,
        source: { type: "base64" as const, media_type: mediaType, data },
      };
    });

    return {
      role: m.role as "user" | "assistant",
      content: [...imageParts, { type: "text" as const, text }],
    };
  });
}

export const POST = withSeller(async (req: NextRequest) => {
  const body = (await req.json()) as {
    messages: ApiChatMessage[];
    store: StoreConfig;
    brandContext?: BrandContext | null;
    templateContext?: TemplateContext | null;
    currentImageDataUrls?: string[];
    currentDocNames?: string[];
  };
  const { messages, store: currentStore, brandContext, templateContext, currentImageDataUrls, currentDocNames } = body;

  const client = getAnthropicClient();
  const openai = getOpenAIClient();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (openai) {
          const systemPrompt = buildTemplatePrompt(buildSystemPrompt(brandContext), templateContext);
          const textHistory = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
          const response = await openai.responses.create({
            model: REX_OPENAI_MODEL,
            input: `${systemPrompt}

Build the store fully. The preview must render a complete premium storefront: strong hero with a headline that sells the experience, 3-8 products with realistic African pricing, proper nav links (Products, About, FAQ, Contact), category-appropriate palette with strong contrast, and product colors that match each item. Use section variety and image-led merchandising instead of a plain hero plus grid. Keep existing product imageUrl values from the current config unless the user asks to replace them. Do not use emojis.

${STORE_BUILDER_OUTPUT_CONTRACT}

Current store config:
${JSON.stringify(currentStore)}

Attached document names: ${(currentDocNames ?? []).join(", ") || "none"}

Conversation:
${textHistory}`,
          });

          const fullText = response.output_text ?? "";
          const visibleText = fullText.split("<store_config>")[0]?.trim();
          if (visibleText) encode(controller, { type: "token", text: visibleText });

          const storeMatch = fullText.match(/<store_config>([\s\S]*?)<\/store_config>/);
          if (storeMatch) {
            try {
              const storeData = JSON.parse(storeMatch[1].trim()) as Partial<StoreConfig>;
              encode(controller, { type: "store", data: { ...currentStore, ...storeData } });
            } catch {
              // ignore parse errors
            }
          }

          const chipsMatch = fullText.match(/<chips>([\s\S]*?)<\/chips>/);
          if (chipsMatch) {
            try {
              const chips = JSON.parse(chipsMatch[1].trim()) as string[];
              encode(controller, { type: "chips", data: chips });
            } catch {
              encode(controller, { type: "chips", data: ["Refine hero text", "Adjust palette", "Add a product", "Looks good"] });
            }
          }

          encode(controller, { type: "done" });
          controller.close();
          return;
        }

        if (!client) {
          encode(controller, {
            type: "error",
            message: "OPENAI_API_KEY or ANTHROPIC_API_KEY is required for Rex to build the store.",
          });
          encode(controller, {
            type: "token",
            text: "Rex needs an AI API key configured before he can build this store fully. Add OPENAI_API_KEY and try again.",
          });
          controller.close();
          return;
        }

        // Real Claude mode with vision + brand context
        const anthropicMessages = toAnthropicMessages(
          messages,
          currentImageDataUrls,
          currentDocNames,
          currentStore,
        );

        const systemPrompt = buildTemplatePrompt(buildSystemPrompt(brandContext), templateContext);

        const response = await client.messages.stream({
          model: CHIP_MODEL,
          max_tokens: 3200,
          system: `${systemPrompt}\n\nBuild the store fully. The preview must render a complete premium storefront: strong hero with a headline that sells the experience, 3-8 products with realistic African pricing, proper nav links (Products, About, FAQ, Contact), category-appropriate palette with strong contrast, and product colors that match each item. Use section variety and image-led merchandising instead of a plain hero plus grid. Keep existing product imageUrl values from the current config unless the user asks to replace them. Do not use emojis.\n\n${STORE_BUILDER_OUTPUT_CONTRACT}`,
          messages: anthropicMessages as Parameters<typeof client.messages.stream>[0]["messages"],
        });

        let fullText = "";

        for await (const chunk of response) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const text = chunk.delta.text;
            fullText += text;

            // Stream visible text (before the store_config block)
            if (!fullText.includes("<store_config>")) {
              encode(controller, { type: "token", text });
            }
          }
        }

        // Parse store config
        const storeMatch = fullText.match(/<store_config>([\s\S]*?)<\/store_config>/);
        if (storeMatch) {
          try {
            const storeData = JSON.parse(storeMatch[1].trim()) as Partial<StoreConfig>;
            encode(controller, { type: "store", data: { ...currentStore, ...storeData } });
          } catch {
            // ignore parse errors
          }
        }

        // Parse chips
        const chipsMatch = fullText.match(/<chips>([\s\S]*?)<\/chips>/);
        if (chipsMatch) {
          try {
            const chips = JSON.parse(chipsMatch[1].trim()) as string[];
            encode(controller, { type: "chips", data: chips });
          } catch {
            encode(controller, { type: "chips", data: ["Refine hero text", "Adjust palette", "Add a product", "Looks good"] });
          }
        }

        encode(controller, { type: "done" });
        controller.close();
      } catch (err) {
        encode(controller, { type: "error", message: String(err) });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
