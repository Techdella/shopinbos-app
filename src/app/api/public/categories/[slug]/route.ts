import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { cachedPublic, PUBLIC_DETAIL_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_DETAIL_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const category = await cachedPublic(`categories:detail:${slug}`, PUBLIC_DETAIL_TTL_S, () =>
    db.category.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        parentId: true,
        sortOrder: true,
        parent: { select: { id: true, name: true, slug: true } },
        children: { select: { id: true, name: true, slug: true, imageUrl: true } },
        _count: {
          select: {
            supplierProducts: {
              where: {
                status: "published",
                supplier: {
                  status: "active",
                  verificationStatus: "verified",
                },
              },
            },
          },
        },
      },
    }),
  );

  if (!category) {
    return withCors(req, apiError("NOT_FOUND", "Category not found", 404));
  }

  return withCors(req, ok(category), { cacheControl: PUBLIC_DETAIL_CACHE });
}
