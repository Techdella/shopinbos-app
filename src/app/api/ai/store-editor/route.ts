import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { aiCost, meterAiPreview } from "@/lib/ai/usage";
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
              title: "",
              body: prompt,
            },
          },
        ],
      },
    }];
  }

  return [{ op: "add-section", pageType, section: createSectionFromLibrary("text-columns") }];
}

function describeOps(ops: unknown[]) {
  const words = ops.map((raw) => {
    const op = (raw && typeof raw === "object" ? raw : {}) as { op?: string; pageType?: string; section?: { kind?: string; name?: string } };
    const where = op.pageType ? ` on the ${op.pageType} page` : "";
    if (op.op === "add-section") return `add a ${op.section?.name ?? op.section?.kind ?? "new"} section${where}`;
    if (op.op === "update-section") return `update a section${where}`;
    if (op.op === "toggle-section") return `show or hide a section${where}`;
    if (op.op === "remove-section") return `remove a section${where}`;
    return `change the layout${where}`;
  });
  return words.length ? `Suggested changes: ${words.join("; ")}.` : "No changes were suggested.";
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
    /** Chat-style callers send the conversation and context instead of prompt/pageType/sectionId. */
    messages?: Array<{ role?: string; content?: string }>;
    context?: { storeName?: string; page?: string; selectedSection?: string | null };
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

  const lastUserMessage = Array.isArray(body?.messages)
    ? [...body.messages].reverse().find((message) => message?.role === "user" && typeof message.content === "string")?.content
    : undefined;
  const prompt = (body?.prompt ?? lastUserMessage)?.trim().slice(0, 4000);
  if (!prompt) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "prompt is required" } }, { status: 400 });
  }

  const pageType = guessPageType(body?.pageType ?? body?.context?.page ?? "home");
  const sectionId = body?.sectionId ?? body?.context?.selectedSection ?? undefined;
  const storeContext = body?.store ?? (body?.context?.storeName ? { name: body.context.storeName } : null);

  // Keyword-based layout ops only when no AI key is configured at all, and labelled as such.
  if (!aiConfigured()) {
    const ops = fallbackOps(prompt, pageType, sectionId);
    return NextResponse.json({
      data: {
        ops,
        aiOff: true,
        reply: `AI isn't switched on, so Rex matched your request to a standard section instead of writing it. ${describeOps(ops)}`,
      },
    });
  }

  // Rex's edit is a preview in the builder: free to look at (daily cap only). Applying it costs credits
  // (/api/ai/store-editor/apply).
  const limited = await meterAiPreview(user.id, "text");
  if (limited) return limited;

  const templateSummary = body?.templateId ? summarizeTemplateForAi(body.templateId) : null;
  const editorPrompt = `You are Rex, editing a store template section for Shopinbos.
Return only valid JSON with this shape:
{"ops":[{"op":"update-section","pageType":"home","sectionId":"hero","changes":{"blocks":[{"id":"hero-copy","type":"copy","content":{"title":"...","body":"..."}}]}}]}

You are not limited to what the template has: you can create new sections and layouts by adding library sections with your own copy and items, change theme colours and fonts with op update-theme ({"op":"update-theme","changes":{...}}), reorder, show or hide sections.
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
${JSON.stringify(storeContext)}

Current target page: ${pageType}
Current target section: ${sectionId ?? "none selected"}

Seller request:
${prompt}`;

  let text: string | null = null;
  try {
    text = (await aiText({ prompt: editorPrompt, fast: true, maxTokens: 8000 }))?.text ?? null;
  } catch (error) {
    console.error("[ai/store-editor] failed", error);
  }
  if (!text) {
    return NextResponse.json({ error: { code: "AI_FAILED", message: "Rex couldn't reach the AI right now. Nothing was changed; try again." } }, { status: 502 });
  }

  const parsed = firstJsonObject(text) as { ops?: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.ops) || !parsed.ops.length) {
    return NextResponse.json({ error: { code: "AI_FORMAT", message: "Rex's edit came back in a format that couldn't be applied. Nothing was changed; try rephrasing." } }, { status: 502 });
  }
  return NextResponse.json({ data: { ops: parsed.ops, reply: describeOps(parsed.ops), applyCost: await aiCost("text", 1, "store_design") } });
});
