import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { readSeoMeta, sellerStore, writeSeoMeta } from "@/lib/cms/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The SEO tab of a product or a product collection: search title/description live on the product row
// (seoTitle/seoDescription); the share card, canonical, noindex and main phrase live in SeoMeta.
const Body = z.object({
  resourceType: z.enum(["product", "collection"]),
  resourceId: z.string().min(1).max(64),
  seo: z.record(z.string(), z.unknown()),
});

async function owns(storeId: string, type: "product" | "collection", id: string) {
  if (type === "product") return Boolean(await db.storeProduct.findFirst({ where: { id, storeId }, select: { id: true } }));
  return Boolean(await db.collection.findFirst({ where: { id, storeId }, select: { id: true } }));
}

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "NO_STORE", message: "Create your store first" } }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("resourceType") === "collection" ? "collection" : "product";
  const id = searchParams.get("resourceId") ?? "";
  if (!(await owns(store.id, type, id))) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  return NextResponse.json({ data: await readSeoMeta(store.id, type, id) });
});

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "NO_STORE", message: "Create your store first" } }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid SEO" } }, { status: 422 });
  const { resourceType, resourceId, seo } = parsed.data;
  if (!(await owns(store.id, resourceType, resourceId))) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  const saved = await writeSeoMeta(store.id, resourceType, resourceId, seo);
  if (resourceType === "product") {
    await db.storeProduct.update({ where: { id: resourceId }, data: { seoTitle: saved.metaTitle || null, seoDescription: saved.metaDescription || null } });
  }
  return NextResponse.json({ data: saved });
});
