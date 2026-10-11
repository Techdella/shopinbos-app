import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { parseBody } from "@/lib/api/validate";
import { BlogPostCreateSchema } from "@/lib/schemas";
import { plainText, type RichDoc } from "@/lib/cms/richtext";
import { blogCollection, saveMarkdownPost, sellerStore } from "@/lib/cms/server";
import { cmsFailure } from "@/app/api/app/cms/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The original blog API, kept for older callers. Posts now live in the store's Blog collection (CMS);
// this answers in the old post shape. New screens use /api/app/cms/*.

type Item = Awaited<ReturnType<typeof db.cmsItem.findMany>>[number];

function asPost(item: Item) {
  const data = (item.data ?? {}) as Record<string, unknown>;
  const seo = (item.seo ?? {}) as Record<string, unknown>;
  const body = (data.body ?? Object.values(data).find((value) => value && typeof value === "object" && "json" in (value as object))) as { json?: RichDoc } | undefined;
  const text = body?.json ? plainText(body.json) : "";
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    bodyMarkdown: text,
    metaTitle: typeof seo.metaTitle === "string" ? seo.metaTitle : "",
    metaDescription: typeof seo.metaDescription === "string" ? seo.metaDescription : "",
    keywords: Array.isArray(data.tags) ? data.tags.map(String) : [],
    status: item.status === "draft" ? "draft" : "published",
    wordCount: text.split(/\s+/).filter(Boolean).length,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ data: [] });
  const collection = await blogCollection(store.id);
  const items = await db.cmsItem.findMany({ where: { collectionId: collection.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ data: items.map(asPost) });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "no_store", message: "Store not found" } }, { status: 404 });
  const parsed = await parseBody(BlogPostCreateSchema, req);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  try {
    const item = await saveMarkdownPost(store.id, {
      id: body.id,
      title: body.title,
      slug: body.slug,
      excerpt: body.excerpt,
      bodyMarkdown: body.bodyMarkdown,
      metaTitle: body.metaTitle,
      metaDescription: body.metaDescription,
      keywords: body.keywords,
      status: body.publish ? "published" : body.status,
    });
    return NextResponse.json({ data: asPost(item) });
  } catch (error) {
    return cmsFailure(error);
  }
});

export const DELETE = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "no_store", message: "Store not found" } }, { status: 404 });
  const postId = new URL(req.url).searchParams.get("id");
  if (!postId) return NextResponse.json({ error: { code: "invalid", message: "id query param required" } }, { status: 400 });
  const collection = await blogCollection(store.id);
  await db.cmsItem.deleteMany({ where: { collectionId: collection.id, OR: [{ id: postId }, { legacyId: postId }] } });
  return NextResponse.json({ ok: true });
});
