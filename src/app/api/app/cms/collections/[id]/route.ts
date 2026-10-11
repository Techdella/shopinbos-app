import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { getCollection, sellerStore, updateCollection } from "@/lib/cms/server";
import { cmsFailure, noStore } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const collection = await getCollection(store.id, String(params.id));
  if (!collection) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Collection not found" } }, { status: 404 });
  return NextResponse.json({ data: collection });
});

export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ data: await updateCollection(store.id, String(params.id), body) });
  } catch (error) {
    return cmsFailure(error);
  }
});

// Deleting a collection deletes its items (cascade). The editor asks the seller to type the name first.
export const DELETE = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const result = await db.cmsCollection.deleteMany({ where: { id: String(params.id), storeId: store.id } });
  if (!result.count) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Collection not found" } }, { status: 404 });
  return NextResponse.json({ data: { deleted: true } });
});
