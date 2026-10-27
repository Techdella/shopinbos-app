"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { chinaImportProblem, productLimitProblem } from "@/lib/plans/gates.server";
import { withShortCode } from "@/lib/products/short-code.server";
import { getCurrentAppUser } from "@/lib/server-auth";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { clampSellingPrice } from "@/lib/marketplace/find";
import { importTitle, looksLikeLink, parseImportLink } from "@/lib/imports/pure";
import {
  ImportError,
  acceptQuote,
  cancelRequest,
  chinaImportsOpen,
  createImport,
  declineQuote,
  importStatus,
  linkStoreProduct,
  notifyPartner,
} from "@/lib/imports/service.server";

// Find products › From China (the request form) and My imports (accept or decline the partner's quote, cancel,
// add delivered goods to the store). The sourcing partner works on them in Admin › China imports.

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const ImportSchema = z.object({
  query: z.string().trim().max(500),
  quantity: z.number().int().min(1).max(100_000),
  shipping: z.enum(["air", "sea"]),
  notes: z.string().trim().max(600),
});

/** From China "Get a quote": a request to the sourcing partner. Shows up in My imports. */
export async function requestChinaImport(formData: FormData) {
  function back(error: string): never {
    redirect(`/marketplace?tab=china&error=${encodeURIComponent(error)}`);
  }
  if (!chinaImportsOpen()) back("Importing from China is coming soon.");
  const quantityRaw = Number(formData.get("quantity") || 0);
  const parsed = ImportSchema.safeParse({
    query: String(formData.get("query") || ""),
    quantity: Number.isFinite(quantityRaw) ? Math.floor(quantityRaw) : 0,
    shipping: formData.get("shipping") === "sea" ? "sea" : "air",
    notes: String(formData.get("notes") || ""),
  });
  if (!parsed.success) back("Check the link and how many you want, then try again.");
  const { query, quantity, shipping, notes } = parsed.data;
  const entry = formData.get("photo");
  const photo = entry instanceof File && entry.size > 0 ? entry : null;

  const link = looksLikeLink(query) ? parseImportLink(query) : null;
  if (looksLikeLink(query) && !link) back("Paste a link from ShopKonfam or 1688, or describe the product.");
  if (!link && !photo && query.length < 3) back("Paste a ShopKonfam or 1688 link, add a photo, or describe what you want.");
  if (photo && (!IMAGE_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES)) back("Use a JPG, PNG or WebP photo under 8MB.");

  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") redirect("/login");
  const importLimit = await chinaImportProblem(user.id);
  if (importLimit) back(importLimit);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, city: true, country: true } });
  if (!store) redirect("/builder?firstRun=1");

  let photoUrl: string | null = null;
  if (photo) {
    try {
      photoUrl = (await uploadFileServer("products", photo, uploadPath(`imports/${store.id}`, photo))).publicUrl;
    } catch (error) {
      console.error("[imports] photo upload failed", error);
      back("That photo didn't upload. Try again.");
    }
  }

  const description = link ? null : query;
  let order;
  try {
    order = await createImport({
      storeId: store.id,
      sellerId: user.id,
      source: link?.source ?? (photo ? "photo" : "description"),
      title: importTitle({ description, link, hasPhoto: Boolean(photo) }),
      link: link?.url ?? null,
      productRef: link?.productRef ?? null,
      photoUrl,
      quantity,
      shipping,
      notes: notes || null,
      destination: [store.city, store.country].filter(Boolean).join(", ") || null,
    });
  } catch (error) {
    console.error("[imports] request failed", error);
    back(error instanceof ImportError ? error.message : "Couldn't send the request. Try again.");
  }
  await notifyPartner(order, `New import request ${order.ref}`, `${store.name} wants ${quantity} × ${order.title} by ${shipping}.${order.link ? ` ${order.link}` : ""}`);
  revalidatePath("/home/imports");
  redirect(`/home/imports?requested=${encodeURIComponent(order.ref)}&open=${order.id}`);
}

async function sellerStore() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "seller") return null;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  return store ? { user, store } : null;
}

const IdSchema = z.string().min(1).max(64);
const SIGN_IN: Result<never> = { ok: false, error: "Sign in to your store first." };

/** Runs a seller's change and turns ImportError into a message (the caller has already checked who it is). */
async function settle<T>(work: () => Promise<T>): Promise<Result<{ value: T }>> {
  try {
    const value = await work();
    revalidatePath("/home/imports");
    return { ok: true, value };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message };
    console.error("[imports] action failed", error);
    return { ok: false, error: "That didn't work. Try again." };
  }
}

/** "Accept and pay": records the acceptance and hands back the partner's payment link. */
export async function acceptImportQuote(id: string): Promise<Result<{ value: { paymentUrl: string | null } }>> {
  const ctx = await sellerStore();
  if (!ctx || !IdSchema.safeParse(id).success) return SIGN_IN;
  return settle(async () => ({ paymentUrl: (await acceptQuote(id, ctx.store.id)).paymentUrl }));
}

export async function declineImportQuote(id: string, reason?: string): Promise<Result<{ value: null }>> {
  const ctx = await sellerStore();
  if (!ctx || !IdSchema.safeParse(id).success) return SIGN_IN;
  const text = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  return settle(async () => {
    await declineQuote(id, ctx.store.id, text || null);
    return null;
  });
}

export async function cancelImportRequest(id: string): Promise<Result<{ value: null }>> {
  const ctx = await sellerStore();
  if (!ctx || !IdSchema.safeParse(id).success) return SIGN_IN;
  return settle(async () => {
    await cancelRequest(id, ctx.store.id);
    return null;
  });
}

/** Delivered goods → a draft product in the store at the landed cost, with the stock count filled in. */
export async function addImportToProducts(id: string): Promise<Result<{ value: { storeProductId: string } }>> {
  const ctx = await sellerStore();
  if (!ctx || !IdSchema.safeParse(id).success) return SIGN_IN;
  const storeId = ctx.store.id;
  const userId = ctx.user.id;
  return settle(async () => {
    const order = await db.importOrder.findFirst({ where: { id, storeId } });
    if (!order) throw new ImportError("That import wasn't found.");
    if (order.storeProductId) return { storeProductId: order.storeProductId };
    if (importStatus(order) !== "in_stock") throw new ImportError("Add it once it's delivered.");
    const limit = await productLimitProblem(userId, storeId, 1, false);
    if (limit) throw new ImportError(limit);
    const quantity = order.quantity ?? 0;
    const cost = order.total && quantity > 0 ? Math.round(order.total / quantity) : 0;
    const retailPrice = cost > 0 ? clampSellingPrice(cost * 1.6, cost) : 0;
    const images = [order.photoUrl, ...order.qcPhotos].filter((url): url is string => Boolean(url)).slice(0, 6);
    const product = await withShortCode(storeId, { name: order.title, categoryId: null }, (shortCode) =>
      db.storeProduct.create({
        data: {
          storeId,
          userId,
          name: order.title,
          shortCode,
          description: order.notes,
          images,
          retailPrice,
          costPrice: cost || null,
          currency: "NGN",
          margin: cost ? retailPrice - cost : null,
          sourceType: "imported",
          currentStock: quantity,
          trackStock: quantity > 0,
          status: "draft",
        },
      }),
    );
    await linkStoreProduct(order.id, product.id);
    revalidatePath("/products");
    return { storeProductId: product.id };
  });
}

