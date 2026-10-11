import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { getItem, saveItem, sellerStore } from "@/lib/cms/server";
import { cmsFailure, noStore } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "Item not found" } }, { status: 404 });

export const GET = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const item = await getItem(store.id, String(params.id));
  return item ? NextResponse.json({ data: item }) : notFound();
});

export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const item = await getItem(store.id, String(params.id));
  if (!item) return notFound();
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ data: await saveItem(store.id, item.collectionId, body, { itemId: item.id }) });
  } catch (error) {
    return cmsFailure(error);
  }
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const result = await db.cmsItem.deleteMany({ where: { id: String(params.id), storeId: store.id } });
  return result.count ? NextResponse.json({ data: { deleted: true } }) : notFound();
});
