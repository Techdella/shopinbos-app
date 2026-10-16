import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { parseBody } from "@/lib/api/validate";
import { customPageSlug, TEMPLATE_PAGE_TYPES } from "@shared/storefront-pages";

export const runtime = "nodejs";
export const maxDuration = 120;

const PageInputSchema = z.object({
  type: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  publish: z.boolean().optional(),
  userContent: z.string().max(4000).optional(),
  designStyle: z.string().max(60).optional(),
  storeName: z.string().max(120).optional(),
  storeTagline: z.string().max(400).optional(),
  category: z.string().max(120).optional(),
  order: z.number().int().min(0).max(100).optional(),
});

const PagesCreateSchema = z.object({
  pages: z.array(PageInputSchema).min(1).max(20),
});

type PageInput = z.infer<typeof PageInputSchema>;
type PageContent = Record<string, unknown>;

/** Home is stored as slug "home" everywhere (templates, Rex drafts, the storefront maps it to "/"). */
function slugForPage(type: string) {
  const slug = type === "home" ? "home" : type.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "page";
  // Template page types keep their slug (found by type); any other page can't take a store route's address
  // (/links is the link in bio page): "links" → "links-page".
  return TEMPLATE_PAGE_TYPES.has(slug) ? slug : customPageSlug(slug);
}

async function generatePageContent(page: PageInput): Promise<{ content: PageContent; provider: string } | null> {
  const prompt = `You are building a store page for "${page.storeName || "My Store"}" — ${page.storeTagline || ""}.
Category: ${page.category || "retail"}
Design style: ${page.designStyle || "minimal"}
Page: ${page.type} — "${page.title}"
${page.userContent ? `Seller's notes for this page: ${page.userContent}` : ""}

Write compelling, specific, African-market focused copy for this ${page.type} page, for shoppers.
Build a full page, not a thin placeholder. Include 6-8 sections that match the page type.
For ecommerce pages, include conversion-focused blocks such as trust points, product/category highlights, process, FAQ, CTA, proof, and policy details where relevant.
Never invent facts the notes don't support (delivery times, certifications, awards); keep those general. Do not mention AI, Rex, Peggy or Shopinbos.
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

  const result = await aiText({ prompt, fast: true, maxTokens: 8000 });
  if (!result) return null;
  const content = firstJsonObject(result.text);
  if (!content || !Array.isArray(content.sections)) return null;
  return { content, provider: result.provider };
}

/** Neutral starter content, used only when no AI key is configured. Nothing in it claims to be AI-written. */
function starterContent(page: PageInput, storeName: string, description: string): PageContent {
  return {
    hero: { headline: page.title === "Home" ? `Welcome to ${storeName}` : page.title, subline: description },
    sections: [
      { type: "text", heading: page.title, body: page.userContent || description || `Find out more about ${storeName}.` },
      { type: "feature-grid", heading: "Why shop with us", body: "Clear product details, careful delivery, and friendly support before and after you buy." },
      { type: "faq", heading: "Common questions", body: "Questions about delivery, payment or returns? Get in touch and we will help." },
      { type: "cta", heading: "Ready to shop?", body: "Browse the collection and check out in a few taps." },
    ],
    seo: { metaTitle: `${page.title} | ${storeName}`, metaDescription: description },
    starter: true,
  };
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(PagesCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const { pages } = parsed.data;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    return NextResponse.json({ error: { code: "no_store", message: "Store not found" } }, { status: 404 });
  }

  const useAi = aiConfigured();
  if (useAi) {
    const limited = await meterAi(user.id, "text", pages.length);
    if (limited) return limited;
  }

  const saved = [];
  const failures: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const slug = slugForPage(page.type);
    const order = page.order ?? i;

    let content: PageContent;
    let generated = false;
    if (useAi) {
      let result: Awaited<ReturnType<typeof generatePageContent>> = null;
      try {
        result = await generatePageContent({ ...page, storeName: store.name, storeTagline: store.description ?? "" });
      } catch (error) {
        console.error(`[store/pages] ${page.type} failed`, error);
      }
      if (!result) {
        failures.push(page.title);
        continue;
      }
      content = result.content;
      generated = true;
    } else {
      content = starterContent(page, store.name, store.description ?? "");
    }

    // A page that is already live keeps its live content; new copy goes to its draft until published.
    const existing = await db.storePage.findUnique({
      where: { storeId_slug: { storeId: store.id, slug } },
      select: { isPublished: true },
    });
    const json = content as Prisma.InputJsonValue;
    const keepLive = existing?.isPublished && page.publish !== true;
    const savedPage = await db.storePage.upsert({
      where: { storeId_slug: { storeId: store.id, slug } },
      create: { storeId: store.id, type: page.type, title: page.title, slug, content: json, draftContent: json, order, isPublished: page.publish === true, status: page.publish === true ? "published" : "draft" },
      update: keepLive
        ? { title: page.title, draftContent: json, order }
        : {
            title: page.title,
            content: json,
            draftContent: json,
            order,
            ...(page.publish !== undefined ? { isPublished: page.publish, status: page.publish ? "published" : "draft" } : {}),
          },
    });

    saved.push({ ...savedPage, generated });
  }

  if (!saved.length && failures.length) {
    return NextResponse.json(
      { error: { code: "AI_FAILED", message: `Rex couldn't write ${failures.join(", ")} right now. Try again in a moment.` } },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: saved,
    ...(failures.length ? { failed: failures } : {}),
    ...(useAi ? {} : { aiOff: true, notice: "AI isn't switched on, so these pages have starter text to edit yourself." }),
  });
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
