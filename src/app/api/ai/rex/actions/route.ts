import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { isOwnImageUrl } from "@/lib/ai/images";
import { parseRexAction, productImagesAfterSave } from "@/lib/ai/rex/agent-pure";
import { rexActivateAutomation } from "@/lib/ai/rex/marketing.server";
import { recordMedia } from "@/lib/media/library.server";
import { setBrandAsset } from "@/lib/brand-assets.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: the seller's products, for "Add to a product" on a picture Rex made without one.
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return ok({ products: [] });
  const products = await db.storeProduct.findMany({
    where: { storeId: store.id, status: { not: "archived" } },
    orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, name: true, images: true },
  });
  return ok({ products: products.map((product) => ({ id: product.id, name: product.name, image: product.images[0] ?? null })) });
});

// The seller's taps on Rex's cards: save a picture to a product, use a logo, apply a product description,
// switch on an automation. Rex never does these himself; they are the seller's confirmation.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = parseRexAction(await req.json().catch(() => null));
  if (!parsed.ok) return apiError("BAD_REQUEST", parsed.error);
  const action = parsed.action;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.");

  const activity = (type: string, title: string, link: string, data: Record<string, unknown>) =>
    db.activityEvent
      .create({ data: { storeId: store.id, userId: user.id, type, title, metadata: { source: "rex", confirmedBy: "seller", link, ...data } as Prisma.InputJsonValue } })
      .catch((error) => console.error("[rex] activity log failed", error));

  if (action.action === "save_product_image" || action.action === "set_logo") {
    if (!isOwnImageUrl(action.imageUrl)) return apiError("BAD_REQUEST", "Only pictures saved in your shop can be used.");
  }
  if (action.action === "set_brand_asset" && !isOwnImageUrl(action.url)) return apiError("BAD_REQUEST", "Only pictures saved in your shop can be used.");
  if (action.action === "save_to_media" && !isOwnImageUrl(action.url)) return apiError("BAD_REQUEST", "Only files saved in your shop can go in your media.");

  switch (action.action) {
    case "save_product_image": {
      const product = await db.storeProduct.findFirst({ where: { id: action.productId, storeId: store.id }, select: { id: true, name: true, images: true } });
      if (!product) return apiError("NOT_FOUND", "That product isn't in your shop.");
      const images = productImagesAfterSave(product.images, action.imageUrl, action.mode, action.replaceIndex);
      await db.storeProduct.update({ where: { id: product.id }, data: { images } });
      const what = action.mode === "main" ? "as the main photo" : action.mode === "replace" ? "in place of the old photo" : "to its photos";
      await activity("product", `Saved Rex's picture to ${product.name}`, `/products/${product.id}`, { productId: product.id, mode: action.mode });
      return ok({ message: `Saved to ${product.name} ${what}.`, href: `/products/${product.id}`, images });
    }
    case "set_logo": {
      await db.store.update({ where: { id: store.id }, data: { logoUrl: action.imageUrl } });
      await activity("brand", "Changed the store logo with Rex", "/home/brand-kit", {});
      return ok({ message: "That's your logo now. It shows on your store and receipts.", href: "/home/brand-kit" });
    }
    case "apply_product_copy": {
      const product = await db.storeProduct.findFirst({ where: { id: action.productId, storeId: store.id }, select: { id: true, name: true } });
      if (!product) return apiError("NOT_FOUND", "That product isn't in your shop.");
      await db.storeProduct.update({ where: { id: product.id }, data: { description: action.description } });
      await activity("product", `Updated the description of ${product.name} with Rex`, `/products/${product.id}`, { productId: product.id });
      return ok({ message: `Updated the description of ${product.name}.`, href: `/products/${product.id}` });
    }
    case "set_brand_asset": {
      const assets = await setBrandAsset(user.id, action.kind, action.url);
      if (!assets) return apiError("NOT_FOUND", "Set up your store first.");
      await activity("brand", action.kind === "icon" ? "Changed the logo icon with Rex" : "Changed the favicon with Rex", "/home/brand-kit", {});
      return ok({ message: action.kind === "icon" ? "That's your logo icon now." : "That's your favicon now. It shows in browser tabs on your store.", href: "/home/brand-kit" });
    }
    case "save_to_media": {
      const asset = await recordMedia({ userId: user.id, storeId: store.id, url: action.url, kind: action.kind, name: action.name ?? undefined, source: "ai" });
      if (!asset) return apiError("UNAVAILABLE", "Couldn't save that to your media. Try again.", 503);
      return ok({ message: action.kind === "video" ? "Saved to your media. Pick it any time from “Choose from my media”." : "Saved to your media library. Pick it any time from “Choose from my media”.", asset });
    }
    case "activate_automation": {
      const rule = await rexActivateAutomation(store.id, action.id);
      if (!rule) return apiError("NOT_FOUND", "That automation isn't in your shop any more.");
      await activity("marketing", `Turned on automation ${rule.name}`, "/home/automations", { automationId: rule.id });
      return ok({ message: `"${rule.name}" is on. It runs for new customers from now.`, href: "/home/automations" });
    }
  }
});
