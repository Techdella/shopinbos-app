"use server";

import { revalidatePath } from "next/cache";
import { productLimitProblem } from "@/lib/plans/gates.server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { linkSupplierProduct } from "@/lib/marketplace/quick-add.server";
import { getCurrentAppUser } from "@/lib/server-auth";
import { mergeBrandSettings } from "@/lib/workspace";
import { createNotification } from "@/lib/notifications/create";
import { ConversationError, sendPartnerMessage } from "@/lib/conversations/service.server";
import { VISIBLE_SUPPLIER, listingCheck, requestAgreement } from "@/lib/marketplace/agreements.server";
import { clampSellingPrice, isSampleId, parseSourcing, type SourcingSettings } from "@/lib/marketplace/find";
import { ListingChoiceSchema, checkDropshipListing, skuFields, type ListingChoiceInput } from "@/lib/marketplace/dropship-listing.server";

// Find products (/marketplace) and My imports (/home/imports): add a supplier's product to the store, ask for a
// wholesale quote, save, message the supplier and get told when suppliers join. China imports: ./imports.ts.

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

const AddSchema = ListingChoiceSchema.extend({ supplierProductId: z.string().min(1).max(64), retailPrice: z.number().positive().max(100_000_000).optional() });

/**
 * "Add to store" / "Add to my store at ₦X": a draft product in the seller's store, linked to the supplier. Dropship:
 * at the supplier's dropship price, never below its lowest allowed price, with who pays delivery, the branding and
 * the seller's SKU, and refused when the price would lose money (src/lib/marketplace/dropship-listing.server.ts).
 */
export async function addSupplierProductToStore(input: { supplierProductId: string; retailPrice?: number } & ListingChoiceInput): Promise<Result<{ storeProductId: string; already: boolean }>> {
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That product couldn't be added." };
  if (isSampleId(parsed.data.supplierProductId)) return { ok: false, sample: true, error: SAMPLE_ERROR };
  const ctx = await sellerAndStore();
  if (!ctx) return { ok: false, error: "Sign in to your store first." };
  const { user, store } = ctx;

  const product = await liveSupplierProduct(parsed.data.supplierProductId);
  if (!product) return { ok: false, error: "This product isn't available any more." };

  const existing = await db.storeProduct.findFirst({ where: { storeId: store.id, supplierProductId: product.id, status: { not: "archived" } }, select: { id: true } });
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
  const check = dropship ? await checkDropshipListing(product, user.id, parsed.data, clampSellingPrice) : null;
  if (check && !check.ok) return { ok: false, error: check.message, code: check.code };
  const retailPrice = check?.ok ? check.retailPrice : clampSellingPrice(parsed.data.retailPrice ?? product.suggestedRetailPrice, product.wholesalePrice);
  const costPrice = check?.ok ? check.costPrice : product.wholesalePrice;
  // Made under the store's lock, so a double click or another device never adds it twice (quick-add.server.ts).
  const linked = await linkSupplierProduct({
    storeId: store.id,
    userId: user.id,
    product,
    retailPrice,
    costPrice,
    dropship,
    ...(check?.ok ? { deliveryPayer: check.deliveryPayer, deliveryFlatFee: check.deliveryFlatFee, brandingChoice: check.brandingChoice } : {}),
    ...skuFields(parsed.data),
  });
  if (linked.already) return { ok: true, storeProductId: linked.storeProductId, already: true };
  await db.store.update({ where: { id: store.id }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { setup: { productAdded: true } }) } });
  revalidatePath("/marketplace");
  revalidatePath("/products");
  return { ok: true, storeProductId: linked.storeProductId, already: false };
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
