import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { collectionSettings, getCollection, itemOrderBy, saveItem, sellerStore } from "@/lib/cms/server";
import { cmsFailure, noStore } from "../../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const collection = await getCollection(store.id, String(params.id));
  if (!collection) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Collection not found" } }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const status = searchParams.get("status");
  const items = await db.cmsItem.findMany({
    where: {
      collectionId: collection.id,
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
      ...(status === "draft" || status === "published" || status === "scheduled" ? { status } : {}),
    },
    orderBy: itemOrderBy(collectionSettings(collection.settings).sort),
    select: { id: true, title: true, slug: true, status: true, publishAt: true, publishedAt: true, featuredImage: true, excerpt: true, author: true, createdBy: true, updatedAt: true, createdAt: true },
    take: 500,
  });
  return NextResponse.json({ data: items, meta: { page: 1, limit: 500, total: items.length } });
});

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ data: await saveItem(store.id, String(params.id), body) }, { status: 201 });
  } catch (error) {
    return cmsFailure(error);
  }
});
