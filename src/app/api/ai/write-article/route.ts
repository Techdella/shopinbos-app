import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ArticleRequest {
  prompt: string;
  storeName?: string;
  category?: string;
  audience?: string;
  keywords?: string;
  tone?: string;
  targetWords?: number;
  conversionGoal?: string;
}

interface ArticleResponse {
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  bodyMarkdown: string;
  wordCount: number;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function clampWords(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1800;
  return Math.min(5500, Math.max(500, Math.round(parsed)));
}

function fallbackArticle(body: ArticleRequest, targetWords: number): ArticleResponse {
  const title = body.prompt.trim().slice(0, 80) || `How to shop smarter from ${body.storeName || "your store"}`;
  const keywords = (body.keywords || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const sections = [
    "Introduction",
    "What customers should know first",
    "How to compare the right options",
    "Common mistakes to avoid",
    "Why this matters before checkout",
    "Recommended next steps",
  ];
  const bodyMarkdown = [
    `# ${title}`,
    "",
    `AI isn't switched on, so this is an outline to write yourself (target: about ${targetWords.toLocaleString()} words). Add OPENAI_API_KEY or ANTHROPIC_API_KEY and Peggy will write the full article.`,
    "",
    ...sections.flatMap((section) => [
      `## ${section}`,
      "Write this section yourself: educate customers, answer objections, use your keywords naturally, and point shoppers to the right product.",
      "",
    ]),
  ].join("\n");

  return {
    title,
    slug: slugify(title),
    excerpt: "Outline only: AI isn't switched on, so the article still needs writing.",
    metaTitle: title,
    metaDescription: "A helpful SEO article designed to educate customers and support store conversion.",
    keywords,
    bodyMarkdown,
    wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length,
  };
}

// Sellers, suppliers and logistics partners all have a blog CMS that calls this.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as ArticleRequest;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  if (!prompt) {
    return NextResponse.json({ error: { code: "invalid", message: "Prompt is required" } }, { status: 400 });
  }

  const targetWords = clampWords(body.targetWords);

  // The outline is only for when no AI key is configured at all, and it says so.
  if (!aiConfigured()) {
    return NextResponse.json({
      data: fallbackArticle({ ...body, prompt }, targetWords),
      demo: true,
      aiOff: true,
      notice: "AI isn't switched on, so this is an outline, not a written article.",
    });
  }

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const articlePrompt = `You are Peggy, the writing assistant for Shopinbos sellers.
Write a complete, SEO-optimized, conversion-focused article for an ecommerce store.
Do not use emojis.

Store: ${body.storeName || "Shopinbos seller"}
Category: ${body.category || "retail"}
Audience: ${body.audience || "potential customers"}
Tone: ${body.tone || "clear, helpful, commercial, trustworthy"}
Target length: ${targetWords} words. It is acceptable to write more than 5000 words when the target requires it.
Primary keywords: ${body.keywords || "use natural ecommerce and product keywords"}
Conversion goal: ${body.conversionGoal || "educate readers and guide them toward products, contact, cart, or checkout"}

User prompt:
${prompt}

Structure requirements:
- Use a strong H1 title.
- Include a short excerpt.
- Include a meta title under 60 characters.
- Include a meta description under 155 characters.
- Include primary and secondary keywords naturally.
- Use H2 and H3 sections.
- Include practical examples, objections, buyer questions, and soft calls to action.
- Write in Markdown.

Return ONLY valid JSON in this exact shape:
{
  "title": "...",
  "slug": "...",
  "excerpt": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "keywords": ["..."],
  "bodyMarkdown": "...",
  "wordCount": 0
}`;

  let text = "";
  try {
    const result = await aiText({
      prompt: articlePrompt,
      // Claude also spends tokens thinking; stay under the non-streaming request ceiling.
      maxTokens: Math.min(20000, Math.max(6000, Math.round(targetWords * 3))),
    });
    if (!result) {
      return NextResponse.json({ error: { code: "AI_FAILED", message: "Peggy couldn't reach the AI right now. Try again in a moment." } }, { status: 502 });
    }
    text = result.text;
  } catch (error) {
    console.error("[ai/write-article] failed", error);
    return NextResponse.json({ error: { code: "AI_FAILED", message: "Peggy couldn't write the article right now. Try again." } }, { status: 500 });
  }

  const parsed = firstJsonObject(text) as Partial<ArticleResponse> | null;
  if (parsed && typeof parsed.title === "string" && typeof parsed.bodyMarkdown === "string") {
    const data: ArticleResponse = {
      title: parsed.title,
      slug: parsed.slug || slugify(parsed.title),
      excerpt: parsed.excerpt ?? "",
      metaTitle: parsed.metaTitle ?? parsed.title,
      metaDescription: parsed.metaDescription ?? parsed.excerpt ?? "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((item): item is string => typeof item === "string") : [],
      bodyMarkdown: parsed.bodyMarkdown,
      wordCount: parsed.bodyMarkdown.split(/\s+/).filter(Boolean).length,
    };
    return NextResponse.json({ data });
  }

  const title = prompt.slice(0, 80);
  const data: ArticleResponse = {
    title,
    slug: slugify(title),
    excerpt: "Peggy wrote this article, but it needs its title and SEO fields checked.",
    metaTitle: title,
    metaDescription: "A long-form SEO article for your store.",
    keywords: (body.keywords || "").split(",").map((item) => item.trim()).filter(Boolean),
    bodyMarkdown: text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
  return NextResponse.json({ data });
}, ["seller", "supplier", "logistics_partner"]);
