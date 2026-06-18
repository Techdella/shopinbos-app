import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const POST = withSeller(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { name?: string; description?: string } | null;
  const name = body?.name?.trim();
  if (!name || name.length < 2) return apiError("BAD_REQUEST", "Category name is required.");

  const baseSlug = slugify(name);
  if (!baseSlug) return apiError("BAD_REQUEST", "Category name must contain letters or numbers.");

  let slug = baseSlug;
  let index = 2;
  while (await db.category.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }

  const category = await db.category.create({
    data: {
      name,
      slug,
      description: body?.description?.trim() || null,
    },
    select: { id: true, name: true, slug: true },
  });

  return ok(category, 201);
});
