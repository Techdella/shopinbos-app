import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getAnthropicClient } from "@/lib/ai/client";
import { createSectionFromLibrary, guessPageType, summarizeTemplateForAi, type StoreBrandSettingsLike } from "@/lib/store-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fallbackOps(prompt: string, pageType: string, sectionId?: string) {
  const lower = prompt.toLowerCase();

  if (/(product page|product detail|variations|variant)/.test(lower)) {
    return [{ op: "add-section", pageType: "product", section: createSectionFromLibrary("product-detail") }];
  }

  if (/(filter|sort|category|categories)/.test(lower)) {
    return [
      { op: "add-section", pageType, section: createSectionFromLibrary("filters-toolbar") },
      { op: "add-section", pageType, section: createSectionFromLibrary("category-list") },
    ];
  }

  if (/(cart|basket)/.test(lower)) {
    return [{ op: "add-section", pageType, section: createSectionFromLibrary("cart-summary") }];
  }

  if (/(checkout|payment|pay)/.test(lower)) {
    return [{ op: "add-section", pageType, section: createSectionFromLibrary("checkout-form") }];
  }

  if (/(wishlist|saved|save for later)/.test(lower)) {
    return [{ op: "add-section", pageType, section: createSectionFromLibrary("wishlist-grid") }];
  }

  if (sectionId && /(hide|remove|take out)/.test(lower)) {
    return [{ op: "toggle-section", pageType, sectionId, visible: false }];
  }

  if (/(banner|promo|offer)/.test(lower)) {
    return [{ op: "add-section", pageType, section: createSectionFromLibrary("promo-banner") }];
  }

  if (/(newsletter|email|whatsapp join)/.test(lower)) {
    return [{ op: "add-section", pageType, section: createSectionFromLibrary("newsletter") }];
  }

  if (sectionId) {
    return [{
      op: "update-section",
      pageType,
      sectionId,
      changes: {
        blocks: [
          {
            id: `${sectionId}-copy`,
            type: "copy",
            content: {
              title: "Updated by Rex",
              body: prompt,
            },
          },
        ],
      },
    }];
  }

  return [{ op: "add-section", pageType, section: createSectionFromLibrary("text-columns") }];
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  void user;
  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
    pageType?: string;
    sectionId?: string;
    templateId?: string;
    brandSettings?: StoreBrandSettingsLike;
    store?: {
      name?: string | null;
      description?: string | null;
      slug?: string | null;
      city?: string | null;
      country?: string | null;
      currency?: string | null;
      products?: Array<{
        id?: string;
        name?: string;
        description?: string | null;
        price?: number | null;
        currency?: string | null;
        hasImages?: boolean;
      }>;
    };
  } | null;

  const prompt = body?.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "prompt is required" } }, { status: 400 });
  }

  const pageType = guessPageType(body?.pageType ?? "home");
  const client = getAnthropicClient();

  if (!client) {
    return NextResponse.json({ data: { ops: fallbackOps(prompt, pageType, body?.sectionId) } });
  }

  const templateSummary = body?.templateId ? summarizeTemplateForAi(body.templateId) : null;
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `You are Rex, editing a store template section for Shopinbos.
Return only valid JSON with this shape:
{"ops":[{"op":"update-section","pageType":"home","sectionId":"hero","changes":{"blocks":[{"id":"hero-copy","type":"copy","content":{"title":"...","body":"..."}}]}}]}

You may also add production ecommerce sections using op add-section. Good section kinds include:
hero-split, featured-products, filters-toolbar, category-list, product-detail, cart-summary, checkout-form, wishlist-grid, promo-banner, newsletter, story-split, text-columns, faq, contact-form.
For full-store requests, recreate the selected template's visual language as editable Shopinbos blocks: header/logo/nav, hero, categories, products, product detail, wishlist, cart, checkout, blog, contact form, newsletter, FAQ, reviews, and footer.
Do not add product-detail as a normal navigation page. Product detail belongs to pageType "product" and opens when a product card is selected.
Use "products" for any template link called shop, menu, catalogue, or store.
Every image, product, price, review, contact field, form, logo text, nav link, and footer line must remain dynamic and editable through the snapshot blocks/items, never hardcoded into static HTML.
Use pageType from the current target page exactly except product detail requests, which target pageType "product".
Use the real store context below for copy, product references, currency, contact/location hints, and page structure.
Do not use internal implementation phrases in shopper-facing copy. Avoid terms like database, DB synced, storage, API, dev, backend, connected data, or synced operations.

Template summary:
${JSON.stringify(templateSummary)}

Store context:
${JSON.stringify(body?.store ?? null)}

Current target page: ${pageType}
Current target section: ${body?.sectionId ?? "none selected"}

Seller request:
${prompt}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ data: { ops: fallbackOps(prompt, pageType, body?.sectionId) } });
  }

  try {
    const parsed = JSON.parse(match[0]) as { ops?: unknown[] };
    if (!Array.isArray(parsed.ops)) {
      return NextResponse.json({ data: { ops: fallbackOps(prompt, pageType, body?.sectionId) } });
    }
    return NextResponse.json({ data: { ops: parsed.ops } });
  } catch {
    return NextResponse.json({ data: { ops: fallbackOps(prompt, pageType, body?.sectionId) } });
  }
});
