import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

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

function readPosts(value: unknown): BlogPost[] {
  if (!Array.isArray(value)) return [];
  return value.filter((post): post is BlogPost => {
    return !!post && typeof post === "object" && typeof (post as BlogPost).title === "string";
  });
}

export const GET = withSupplier(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { blogPosts: true } });
  return ok({ data: readPosts(supplier?.blogPosts) });
});

export const POST = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const body = (await req.json()) as Partial<BlogPost> & { publish?: boolean };
  if (!body.title?.trim() || !body.bodyMarkdown?.trim()) {
    return apiError("BAD_REQUEST", "Title and body are required");
  }

  const now = new Date().toISOString();
  const existingPosts = readPosts(supplier.blogPosts);
  const id = body.id ?? crypto.randomUUID();
  const post: BlogPost = {
    id,
    title: body.title.trim(),
    slug: body.slug?.trim() || slugify(body.title),
    excerpt: body.excerpt?.trim() || "",
    bodyMarkdown: body.bodyMarkdown,
    metaTitle: body.metaTitle?.trim() || body.title.trim(),
    metaDescription: body.metaDescription?.trim() || body.excerpt?.trim() || "",
    keywords: Array.isArray(body.keywords) ? body.keywords.filter((item): item is string => typeof item === "string") : [],
    status: body.publish ? "published" : body.status ?? "draft",
    wordCount: body.wordCount ?? body.bodyMarkdown.split(/\s+/).filter(Boolean).length,
    createdAt: body.createdAt ?? now,
    updatedAt: now,
  };

  const posts = existingPosts.some((item) => item.id === id)
    ? existingPosts.map((item) => (item.id === id ? post : item))
    : [post, ...existingPosts];

  await db.supplier.update({
    where: { id: supplier.id },
    data: { blogPosts: posts as unknown as Prisma.InputJsonValue },
  });

  return ok({ data: post });
});
