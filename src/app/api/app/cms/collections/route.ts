import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { createCollection, listCollections, sellerStore } from "@/lib/cms/server";
import { cmsFailure, noStore } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: await listCollections(store.id) });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ data: await createCollection(store.id, body) }, { status: 201 });
  } catch (error) {
    return cmsFailure(error);
  }
});
