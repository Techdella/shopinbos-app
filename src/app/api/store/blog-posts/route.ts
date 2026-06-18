import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { parseBody } from "@/lib/api/validate";
import { BlogPostCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  status: "draft" | "published";
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function contentRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readPosts(value: unknown): BlogPost[] {
  const record = contentRecord(value);
  if (!Array.isArray(record.posts)) return [];
  return record.posts.filter((post): post is BlogPost => {
    return !!post && typeof post === "object" && typeof (post as BlogPost).title === "string";
  });
}

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ data: [] });

  const page = await db.storePage.findUnique({
    where: { storeId_slug: { storeId: store.id, slug: "blog" } },
  });

  return NextResponse.json({ data: readPosts(page?.content) });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    return NextResponse.json({ error: { code: "no_store", message: "Store not found" } }, { status: 404 });
  }

  const parsed = await parseBody(BlogPostCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;

  const page = await db.storePage.findUnique({
    where: { storeId_slug: { storeId: store.id, slug: "blog" } },
  });

  const now = new Date().toISOString();
  const existingPosts = readPosts(page?.content);
  const id = body.id ?? crypto.randomUUID();
  const post: BlogPost = {
    id,
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    excerpt: body.excerpt?.trim() || "",
    bodyMarkdown: body.bodyMarkdown,
    metaTitle: body.metaTitle?.trim() || body.title.trim(),
    metaDescription: body.metaDescription?.trim() || body.excerpt?.trim() || "",
    keywords: body.keywords,
    status: body.publish ? "published" : body.status,
    wordCount: body.wordCount ?? body.bodyMarkdown.split(/\s+/).filter(Boolean).length,
    createdAt: body.createdAt ?? now,
    updatedAt: now,
  };

  const posts = existingPosts.some((item) => item.id === id)
    ? existingPosts.map((item) => (item.id === id ? post : item))
    : [post, ...existingPosts];

  const existingContent = contentRecord(page?.content);
  const content = ({
    ...existingContent,
    cms: {
      enabled: true,
      assistant: "Peggy",
      message: "Your blog is set up. Peggy can write and publish articles from the CMS.",
    },
    posts,
  } as unknown) as Prisma.InputJsonValue;

  await db.storePage.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "blog" } },
    create: {
      storeId: store.id,
      type: "blog",
      title: "Blog",
      slug: "blog",
      content,
      isPublished: true,
      order: 99,
    },
    update: {
      title: "Blog",
      content,
      isPublished: true,
    },
  });

  return NextResponse.json({ data: post });
});

export const DELETE = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    return NextResponse.json({ error: { code: "no_store", message: "Store not found" } }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("id");
  if (!postId) {
    return NextResponse.json({ error: { code: "invalid", message: "id query param required" } }, { status: 400 });
  }

  const page = await db.storePage.findUnique({
    where: { storeId_slug: { storeId: store.id, slug: "blog" } },
  });

  const existingPosts = readPosts(page?.content);
  const posts = existingPosts.filter((item) => item.id !== postId);
  const existingContent = contentRecord(page?.content);
  const content = ({
    ...existingContent,
    cms: { enabled: true, assistant: "Peggy", message: "Your blog is set up." },
    posts,
  } as unknown) as Prisma.InputJsonValue;

  await db.storePage.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "blog" } },
    create: { storeId: store.id, type: "blog", title: "Blog", slug: "blog", content, isPublished: true, order: 99 },
    update: { title: "Blog", content, isPublished: true },
  });

  return NextResponse.json({ ok: true });
});
