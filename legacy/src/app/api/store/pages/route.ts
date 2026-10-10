import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import { parseBody } from "@/lib/api/validate";

export const runtime = "nodejs";
export const maxDuration = 120;

const PageInputSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1).max(200),
  publish: z.boolean().optional(),
  userContent: z.string().optional(),
  designStyle: z.string().optional(),
  storeName: z.string().optional(),
  storeTagline: z.string().optional(),
  category: z.string().optional(),
});

const PagesCreateSchema = z.object({
  pages: z.array(PageInputSchema).min(1).max(20),
});

type PageInput = z.infer<typeof PageInputSchema>;

async function generatePageContent(page: PageInput, client: Anthropic): Promise<Record<string, unknown>> {
  const prompt = `You are building a store page for "${page.storeName || "My Store"}" — ${page.storeTagline || ""}.
Category: ${page.category || "retail"}
Design style: ${page.designStyle || "minimal"}
Page: ${page.type} — "${page.title}"
${page.userContent ? `User provided content: ${page.userContent}` : ""}

Write compelling African-market focused copy for this ${page.type} page.
Build a full page, not a thin placeholder. Include 6-8 sections that match the page type.
For ecommerce pages, include conversion-focused blocks such as trust points, product/category highlights, process, FAQ, CTA, proof, and policy details where relevant.
If the page is blog, mention that the CMS is ready in the seller workspace and Peggy can write long-form SEO articles there.
Return ONLY valid JSON with this structure:
{
  "hero": { "headline": "...", "subline": "..." },
  "sections": [
    { "type": "text", "heading": "...", "body": "..." },
    { "type": "feature-grid", "heading": "...", "body": "..." },
    { "type": "cta", "heading": "...", "body": "..." }
  ],
  "seo": { "metaTitle": "...", "metaDescription": "..." }
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return {};
  }
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(PagesCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const { pages } = parsed.data;

  // Get seller's store
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    return NextResponse.json({ error: { code: "no_store", message: "Store not found" } }, { status: 404 });
  }

  const client = getAnthropicClient();
  const saved = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const slug = page.type === "home" ? "home" : page.type;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let content: any = {};
    if (client) {
      content = await generatePageContent(
        { ...page, storeName: store.name, storeTagline: store.description ?? "" },
        client,
      );
    } else {
      content = {
        hero: { headline: `Welcome to ${store.name}`, subline: store.description ?? "" },
        sections: [
          { type: "text", heading: page.title, body: page.userContent || "Rex will shape this page around the details customers need before they buy." },
          { type: "feature-grid", heading: "Why customers choose us", body: "Clear product information, visible support, reliable delivery, and a checkout flow designed for trust." },
          { type: "text", heading: "How it works", body: "Customers can browse, compare, add to cart, and check out from one connected storefront." },
          { type: "text", heading: "Customer confidence", body: "Use this section for delivery promises, returns, warranty, care instructions, or support expectations." },
          { type: "faq", heading: "Common questions", body: "Peggy can write full answers for delivery, payment, sizing, ingredients, specs, or bulk orders." },
          { type: "cta", heading: "Ready to shop?", body: "Guide shoppers back to products, cart, or contact depending on the page goal." },
        ],
        seo: { metaTitle: `${page.title} | ${store.name}`, metaDescription: store.description ?? "" },
      };
    }

    const isPublished = page.publish === true;
    const savedPage = await db.storePage.upsert({
      where: { storeId_slug: { storeId: store.id, slug } },
      create: { storeId: store.id, type: page.type, title: page.title, slug, content, order: i, isPublished },
      update: { title: page.title, content, order: i, isPublished },
    });

    saved.push(savedPage);
  }

  return NextResponse.json({ data: saved });
});

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ data: [] });

  const pages = await db.storePage.findMany({
    where: { storeId: store.id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ data: pages });
});
