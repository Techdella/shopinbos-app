import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { sellerStore } from "@/lib/cms/server";
import { naira } from "@shared/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pickers in the item editor: the store's products, forms, and items of another collection.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ data: [] });
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const ids = (searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100);

  if (kind === "products") {
    const products = await db.storeProduct.findMany({
      where: { storeId: store.id, ...(ids.length ? { id: { in: ids } } : q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: ids.length ? 100 : 24,
      select: { id: true, name: true, images: true, retailPrice: true, status: true },
    });
    return NextResponse.json({ data: products.map((p) => ({ id: p.id, name: p.name, image: p.images[0] ?? null, price: naira(p.retailPrice), status: p.status })) });
  }
  if (kind === "forms") {
    const forms = await db.storeForm.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, name: true, active: true, type: true } });
    return NextResponse.json({ data: forms });
  }
  if (kind === "items") {
    const collectionId = searchParams.get("collectionId") ?? "";
    const items = await db.cmsItem.findMany({
      where: { storeId: store.id, ...(collectionId ? { collectionId } : {}), ...(ids.length ? { id: { in: ids } } : q ? { title: { contains: q, mode: "insensitive" as const } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: ids.length ? 100 : 24,
      select: { id: true, title: true, status: true, featuredImage: true, collection: { select: { name: true } } },
    });
    return NextResponse.json({ data: items.map((item) => ({ id: item.id, name: item.title, image: item.featuredImage, status: item.status, collection: item.collection.name })) });
  }
  return NextResponse.json({ error: { code: "BAD_REQUEST", message: "kind must be products, forms or items" } }, { status: 400 });
});
