"use server";

import { revalidatePath } from "next/cache";
import { chinaImportPriority, chinaImportProblem, productLimitProblem } from "@/lib/plans/gates.server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { mergeBrandSettings } from "@/lib/workspace";
import { createNotification } from "@/lib/notifications/create";
import { ConversationError, sendPartnerMessage } from "@/lib/conversations/service.server";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { VISIBLE_SUPPLIER, listingCheck, requestAgreement } from "@/lib/marketplace/agreements.server";
import {
  clampSellingPrice,
  isSampleId,
  nextImportRef,
  parse1688Link,
  parseSourcing,
  type ImportRequest,
  type SourcingSettings,
} from "@/lib/marketplace/find";

// Find products (/marketplace) and My imports (/home/imports): add a supplier's product to the store, ask for a
// wholesale quote, save, message the supplier, get told when suppliers join, and ask for a China import.

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; sample?: boolean; code?: string };

const SAMPLE_ERROR = "This is a sample product. Suppliers are joining Shopinbos now, and real products will show here.";

async function sellerAndStore() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "seller") return null;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, city: true, country: true, brandSettings: true } });
  return store ? { user, store } : null;
}

function sourcingOf(brandSettings: unknown): SourcingSettings {
  const settings = brandSettings && typeof brandSettings === "object" ? (brandSettings as Record<string, unknown>) : {};
  return parseSourcing(settings.sourcing);
}

async function saveSourcing(storeId: string, brandSettings: unknown, sourcing: SourcingSettings) {
  await db.store.update({
    where: { id: storeId },
    data: { brandSettings: mergeBrandSettings(brandSettings, { sourcing: JSON.parse(JSON.stringify(sourcing)) }) },
  });
}

async function liveSupplierProduct(id: string) {
  return db.supplierProduct.findFirst({
    where: { id, status: "published", supplier: VISIBLE_SUPPLIER },
    include: { supplier: { select: { id: true, userId: true, displayName: true, verificationStatus: true } } },
  });
}

const AddSchema = z.object({ supplierProductId: z.string().min(1).max(64), retailPrice: z.number().positive().max(100_000_000).optional() });

/** "Add to store" / "Add to my store at ₦X": a draft product in the seller's store, linked to the supplier. */
export async function addSupplierProductToStore(input: { supplierProductId: string; retailPrice?: number }): Promise<Result<{ storeProductId: string; already: boolean }>> {
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That product couldn't be added." };
  if (isSampleId(parsed.data.supplierProductId)) return { ok: false, sample: true, error: SAMPLE_ERROR };
  const ctx = await sellerAndStore();
  if (!ctx) return { ok: false, error: "Sign in to your store first." };
  const { user, store } = ctx;

  const product = await liveSupplierProduct(parsed.data.supplierProductId);
  if (!product) return { ok: false, error: "This product isn't available any more." };

  const existing = await db.storeProduct.findFirst({ where: { storeId: store.id, supplierProductId: product.id }, select: { id: true } });
  if (existing) return { ok: true, storeProductId: existing.id, already: true };

  const dropship = product.dropshipAvailable;
  // Dropship: the seller called the supplier, checked the stock and both agreed (src/lib/marketplace/agreements.server.ts).
  if (dropship) {
    const gate = await listingCheck(user.id, product.supplierId);
    if (!gate.ok) return { ok: false, error: gate.message, code: gate.code };
  } else if (product.supplier.verificationStatus !== "verified") {
    return { ok: false, error: "Buy stock only from verified suppliers. This one isn't verified yet." };
  }
  const planLimit = await productLimitProblem(user.id, store.id, 1, dropship);
  if (planLimit) return { ok: false, error: planLimit, code: "PLAN_LIMIT" };
  const retailPrice = clampSellingPrice(parsed.data.retailPrice ?? product.suggestedRetailPrice, product.wholesalePrice);
  const storeProduct = await db.storeProduct.create({
    data: {
      storeId: store.id,
      userId: user.id,
      supplierProductId: product.id,
      name: product.name,
      description: product.description,
      images: product.images,
      retailPrice,
      costPrice: product.wholesalePrice,
      currency: product.currency,
      margin: retailPrice - product.wholesalePrice,
      categoryId: product.categoryId,
      fulfillmentType: dropship ? "dropship" : "merchant_fulfilled",
      inventoryType: dropship ? "dropshipping" : "seller",
      sourceType: dropship ? "dropship" : "supplier",
      supplierStock: product.stockQuantity,
      supplierLastSync: new Date(),
      status: "draft",
    },
  });
  if (dropship) {
    await db.dropshipRelationship.create({
      data: { sellerId: user.id, storeId: store.id, supplierId: product.supplierId, supplierProductId: product.id, storeProductId: storeProduct.id },
    });
  }
  await db.store.update({ where: { id: store.id }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { setup: { productAdded: true } }) } });
  revalidatePath("/marketplace");
  revalidatePath("/products");
  return { ok: true, storeProductId: storeProduct.id, already: false };
}

const AgreementSchema = z.object({
  supplierId: z.string().min(1).max(64),
  called: z.boolean(),
  stockCheck: z.string().max(20),
  agreed: z.boolean(),
  note: z.string().max(600).optional(),
  /** The full name the seller typed to sign the Dropship agreement. */
  signedName: z.string().max(80),
});

/** Before listing a supplier's products: the seller called them, checked the stock and accepts the Dropship agreement. */
export async function requestDropshipAgreement(input: z.infer<typeof AgreementSchema>): Promise<Result<{ message: string }>> {
  const parsed = AgreementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fill in each step first." };
  const ctx = await sellerAndStore();
  if (!ctx) return { ok: false, error: "Sign in to your store first." };
  const result = await requestAgreement(ctx.user, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/marketplace");
  return { ok: true, message: result.message };
}

const QuoteSchema = z.object({
  supplierProductId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(1_000_000),
  notes: z.string().trim().max(1000).optional(),
});

/** Wholesale: "Request a quote" from the supplier (they answer in their portal). */
export async function requestSupplierQuote(input: { supplierProductId: string; quantity: number; notes?: string }): Promise<Result> {
  const parsed = QuoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter how many you want." };
  if (isSampleId(parsed.data.supplierProductId)) return { ok: false, sample: true, error: SAMPLE_ERROR };
  const ctx = await sellerAndStore();
  if (!ctx) return { ok: false, error: "Sign in to your store first." };
  const product = await liveSupplierProduct(parsed.data.supplierProductId);
  if (!product) return { ok: false, error: "This product isn't available any more." };
  if (parsed.data.quantity < product.moq) return { ok: false, error: `The minimum order is ${product.moq}.` };
  await db.supplierQuoteRequest.create({
    data: {
      sellerId: ctx.user.id,
      supplierId: product.supplierId,
      supplierProductId: product.id,
      quantity: parsed.data.quantity,
      destination: [ctx.store.city, ctx.store.country].filter(Boolean).join(", ") || "Nigeria",
      notes: parsed.data.notes || undefined,
    },
  });
  await createNotification({
    userId: product.supplier.userId,
    type: "suppliers",
    title: "New quote request",
    description: `A seller wants ${parsed.data.quantity} × ${product.name}.`,
    link: "/supplier/quotes",
    event: "quote.request",
    sendEmail: true,
  }).catch(() => null);
  return { ok: true };
}

/** "Save" on the product page. */
export async function toggleSavedProduct(supplierProductId: string): Promise<Result<{ saved: boolean }>> {
  if (typeof supplierProductId !== "string" || !supplierProductId || supplierProductId.length > 64) return { ok: false, error: "That product couldn't be saved." };
  if (isSampleId(supplierProductId)) return { ok: false, sample: true, error: SAMPLE_ERROR };
  const ctx = await sellerAndStore();
  if (!ctx) return { ok: false, error: "Sign in to your store first." };
  const sourcing = sourcingOf(ctx.store.brandSettings);
  const saved = !sourcing.saved.includes(supplierProductId);
  sourcing.saved = saved ? [supplierProductId, ...sourcing.saved].slice(0, 500) : sourcing.saved.filter((id) => id !== supplierProductId);
  await saveSourcing(ctx.store.id, ctx.store.brandSettings, sourcing);
  return { ok: true, saved };
}

const MessageSchema = z.object({ supplierProductId: z.string().min(1).max(64), text: z.string().trim().min(1).max(2000) });

/** "Message supplier": starts (or continues) the partner chat in Inbox. */
export async function messageSupplier(input: { supplierProductId: string; text: string }): Promise<Result<{ conversationId: string }>> {
  const parsed = MessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a message first." };
  if (isSampleId(parsed.data.supplierProductId)) return { ok: false, sample: true, error: SAMPLE_ERROR };
  const ctx = await sellerAndStore();
  if (!ctx) return { ok: false, error: "Sign in to your store first." };
  const product = await liveSupplierProduct(parsed.data.supplierProductId);
  if (!product) return { ok: false, error: "This supplier isn't available any more." };
  const me = ctx.user.id;
  const them = product.supplier.userId;
  if (me === them) return { ok: false, error: "That's your own product." };

  // One messaging system: the partner chat, with the product attached as a card (it also notifies the supplier).
  try {
    const sent = await sendPartnerMessage(ctx.user, them, { text: parsed.data.text, context: { kind: "product", id: product.id } });
    return { ok: true, conversationId: sent.conversationId };
  } catch (error) {
    return { ok: false, error: error instanceof ConversationError ? error.message : "Couldn't send that. Try again." };
  }
}

/** "Get notified" (from a sample product): an alert when real suppliers list products. */
export async function notifyWhenSuppliersJoin(): Promise<Result> {
  const ctx = await sellerAndStore();
  if (!ctx) return { ok: false, error: "Sign in to your store first." };
  const sourcing = sourcingOf(ctx.store.brandSettings);
  if (sourcing.notifyNewSuppliers) return { ok: true };
  await db.notificationPreference.upsert({
    where: { userId_eventKey_category: { userId: ctx.user.id, eventKey: "marketplace.new_supplier_products", category: "marketplace" } },
    create: { userId: ctx.user.id, role: "seller", eventKey: "marketplace.new_supplier_products", category: "marketplace", inApp: true, email: true },
    update: { inApp: true, email: true },
  });
  await saveSourcing(ctx.store.id, ctx.store.brandSettings, { ...sourcing, notifyNewSuppliers: true });
  await createNotification({
    userId: ctx.user.id,
    type: "marketplace",
    title: "We'll tell you when suppliers join",
    description: "You'll get an alert here and by email when verified suppliers list products in Find products.",
    link: "/marketplace",
  }).catch(() => null);
  return { ok: true };
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const ImportSchema = z.object({
  query: z.string().trim().max(500),
  quantity: z.number().int().min(1).max(100_000).nullable(),
  shipping: z.enum(["air", "sea"]),
});

const CHINA_IMPORTS_OPEN = false;

/** China · 1688 "Find it": a request to the sourcing partner. Shows up in My imports. */
export async function requestChinaImport(formData: FormData) {
  function back(error: string): never {
    redirect(`/marketplace?tab=china&error=${encodeURIComponent(error)}`);
  }
  // Importing goes through sourcing middlemen and isn't open yet (the China tab says "Coming soon").
  if (!CHINA_IMPORTS_OPEN) back("Importing from China is coming soon.");
  const quantityRaw = Number(formData.get("quantity") || 0);
  const parsed = ImportSchema.safeParse({
    query: String(formData.get("query") || ""),
    quantity: Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : null,
    shipping: formData.get("shipping") === "sea" ? "sea" : "air",
  });
  if (!parsed.success) back("Check the link and quantity and try again.");
  const { query, quantity, shipping } = parsed.data;
  const entry = formData.get("photo");
  const photo = entry instanceof File && entry.size > 0 ? entry : null;

  const looksLikeLink = /^(https?:\/\/|www\.)|\.(com|cn)\//i.test(query);
  const link = looksLikeLink ? parse1688Link(query) : null;
  if (looksLikeLink && !link) back("Paste a link from 1688.com, or describe the product.");
  if (!link && !photo && query.length < 3) back("Paste a 1688 link, add a photo, or describe what you want.");
  if (photo && (!IMAGE_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES)) back("Use a JPG, PNG or WebP photo under 8MB.");

  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") redirect("/login");
  const importLimit = await chinaImportProblem(user.id);
  if (importLimit) back(importLimit);
  const priority = await chinaImportPriority(user.id);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, brandSettings: true } });
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

  const sourcing = sourcingOf(store.brandSettings);
  const now = new Date().toISOString();
  const ref = nextImportRef(sourcing.imports);
  const title = link ? (query && !looksLikeLink ? query : `1688 item${link.offerId ? ` ${link.offerId}` : ""}`) : query || "Product from your photo";
  const request: ImportRequest = {
    id: `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ref,
    title: title.slice(0, 140),
    link: link?.url ?? null,
    photoUrl,
    quantity,
    shipping,
    status: "requested",
    total: null,
    note: null,
    qcPhotos: [],
    ...(priority ? { priority: true } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await saveSourcing(store.id, store.brandSettings, { ...sourcing, imports: [request, ...sourcing.imports].slice(0, 100) });

  // The sourcing team works from admin alerts until imports have their own admin screen.
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 20 }).catch(() => []);
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "marketplace",
        priority: priority ? "critical" : "warning",
        title: `${priority ? "Priority " : ""}China import request ${ref}`,
        description: `${store.name} wants ${quantity ? `${quantity} × ` : ""}${request.title} by ${shipping}.${request.link ? ` ${request.link}` : ""}`,
        link: request.link ?? undefined,
        metadata: { storeId: store.id, importId: request.id, photoUrl },
        event: "admin.review",
      }).catch(() => null),
    ),
  );
  revalidatePath("/home/imports");
  redirect(`/home/imports?requested=${encodeURIComponent(ref)}`);
}
