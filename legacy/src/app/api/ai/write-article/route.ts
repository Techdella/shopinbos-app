import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { CHIP_MODEL, getAnthropicClient } from "@/lib/ai/client";

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
    `This draft is ready for Peggy to expand into a full ${targetWords.toLocaleString()} word SEO article when the AI key is connected.`,
    "",
    ...sections.flatMap((section) => [
      `## ${section}`,
      `${body.storeName || "This store"} can use this section to educate customers, answer objections, include relevant keywords, and guide shoppers toward the right product or next action.`,
      "",
    ]),
  ].join("\n");

  return {
    title,
    slug: slugify(title),
    excerpt: "A conversion-focused article draft for your store audience.",
    metaTitle: title,
    metaDescription: "A helpful SEO article designed to educate customers and support store conversion.",
    keywords,
    bodyMarkdown,
    wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length,
  };
}

export const POST = withSeller(async (req: NextRequest) => {
  const body = (await req.json()) as ArticleRequest;
  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: { code: "invalid", message: "Prompt is required" } }, { status: 400 });
  }

  const targetWords = clampWords(body.targetWords);
  const client = getAnthropicClient();

  if (!client) {
    return NextResponse.json({ data: fallbackArticle(body, targetWords), demo: true });
  }

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

  const response = await client.messages.create({
    model: CHIP_MODEL,
    max_tokens: Math.min(14000, Math.max(3000, Math.round(targetWords * 2.2))),
    messages: [{ role: "user", content: articlePrompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : text) as ArticleResponse;
    return NextResponse.json({
      data: {
        ...data,
        slug: data.slug || slugify(data.title),
        wordCount: data.wordCount || data.bodyMarkdown.split(/\s+/).filter(Boolean).length,
      },
    });
  } catch {
    const title = prompt.slice(0, 80);
    const data: ArticleResponse = {
      title,
      slug: slugify(title),
      excerpt: "Peggy generated this article, but the response needed formatting cleanup.",
      metaTitle: title,
      metaDescription: "A long-form SEO article for your store.",
      keywords: (body.keywords || "").split(",").map((item) => item.trim()).filter(Boolean),
      bodyMarkdown: text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    };
    return NextResponse.json({ data });
  }
});
