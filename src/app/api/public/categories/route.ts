import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { PUBLIC_LIST_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { okList } from "@/lib/api/response";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const parentOnly = req.nextUrl.searchParams.get("rootOnly") === "true";

  const categories = await db.category.findMany({
    where: parentOnly ? { parentId: null } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      parentId: true,
      sortOrder: true,
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
  });

  return withCors(
    req,
    okList(categories, { page: 1, limit: categories.length, total: categories.length }),
    { cacheControl: PUBLIC_LIST_CACHE },
  );
}
