"use server";

import { storeSafeMessage } from "@/lib/app-session.server";
import { revalidatePath } from "next/cache";
import { parseDepositPct, parsePreorderInput, preorderSaveData } from "@shared/preorder";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { requireRole } from "@/lib/server-auth";
import { isOnboardingComplete } from "@/lib/role-queries";
import { supplierPlanLimits } from "@/lib/plan-limits";
import { atLimit } from "@shared/plans";
import { OrderStatusUpdateSchema, QuoteResponseSchema, SupplierProductCreateSchema } from "@/lib/schemas";
import { slugify } from "@/lib/workspace";
import { z } from "zod";
import Papa from "papaparse";
import { parseSupplierImport } from "@shared/supplier-import";
import { moveSupplierOrder } from "@/lib/supplier-orders/service.server";
import { moveWholesaleOrder } from "@/lib/supplier-orders/wholesale.server";
import { setSupplierPayout } from "@/lib/supplier-orders/money.server";
import { notifyProductForReview, notifySupplierQuoteAnswered } from "@/lib/notifications/events.server";
import { editNeedsReview, statusAfterEdit } from "@shared/supplier-product-review";
import { notifyPriceNotice, supplierPriceEdit } from "@/lib/marketplace/price-notice.server";
import { channelPriceProblem, cleanDropshipMinQty, cleanHandlingDays } from "@shared/dropship-rules";
import { preorderLevelProblem } from "@/lib/supplier-levels.server";

async function getSupplierActor() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });

  if (!supplier) {
    redirect("/supplier/profile");
  }

  return { user, supplier };
}

/** Onboarded is enough to draft products; only verified suppliers can send them for review. */
function assertOnboardedSupplier(supplier: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(supplier)) redirect("/supplier/onboarding");
  return supplier.verificationStatus === "verified";
}

const DRAFT_UNTIL_VERIFIED = "Saved as a draft. You can send products for review once your business is verified.";

function assertVerifiedSupplier(supplier: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(supplier)) redirect("/supplier/onboarding");
  if (supplier.verificationStatus !== "verified") redirect("/supplier/verification");
}

function splitList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  const amount = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function readCheckbox(formData: FormData, name: string) {
  return formData.getAll(name).some((value) => value === "true");
}

function parsePricingTiers(value: FormDataEntryValue | null) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [quantityPart, pricePart] = line.split(":").map((part) => part?.trim());
      const [minRaw, maxRaw] = String(quantityPart || "").split("-").map((part) => Number(part.trim()));
      const price = Number(String(pricePart || "").replace(/,/g, ""));

      if (!Number.isFinite(minRaw) || minRaw < 1 || !Number.isFinite(price) || price <= 0) return null;
      return {
        minQty: Math.floor(minRaw),
        ...(Number.isFinite(maxRaw) && maxRaw >= minRaw ? { maxQty: Math.floor(maxRaw) } : {}),
        price,
      };
    })
    .filter((tier): tier is { minQty: number; maxQty?: number; price: number } => Boolean(tier));
}

/** Quantity breaks from the form's rows (tierMin / tierMax / tierPrice), or the older "10-49: 8500" text box. */
function readPricingTiers(formData: FormData) {
  const mins = formData.getAll("tierMin");
  if (!mins.length) return parsePricingTiers(formData.get("pricingTiers"));
  const maxes = formData.getAll("tierMax");
  const prices = formData.getAll("tierPrice");
  return mins
    .map((min, index) => {
      const minQty = Math.floor(parsePositiveNumber(min));
      const maxQty = Math.floor(parsePositiveNumber(maxes[index] ?? null));
      const price = parsePositiveNumber(prices[index] ?? null);
      if (!(minQty >= 1) || !(price > 0)) return null;
      return { minQty, ...(maxQty >= minQty ? { maxQty } : {}), price };
    })
    .filter((tier): tier is { minQty: number; maxQty?: number; price: number } => Boolean(tier))
    .sort((a, b) => a.minQty - b.minQty);
}

/** An optional price box: empty → null. */
function optionalPrice(formData: FormData, name: string) {
  const amount = parsePositiveNumber(formData.get(name));
  return amount > 0 ? amount : null;
}

/** Prices per channel and dropship options (shared/dropship-rules.ts) from the product form. */
function readDropshipFields(formData: FormData) {
  const perChannel = formData.get("priceMode") === "per_channel";
  const sizeBand = String(formData.get("sizeBand") || "");
  return {
    priceMode: perChannel ? ("per_channel" as const) : ("same" as const),
    dropshipPrice: perChannel ? optionalPrice(formData, "dropshipPrice") : null,
    preorderPrice: perChannel ? optionalPrice(formData, "preorderPrice") : null,
    minRetailPrice: optionalPrice(formData, "minRetailPrice"),
    dropshipMinQty: formData.get("dropshipSingles") === "min" ? cleanDropshipMinQty(formData.get("dropshipMinQty")) : 1,
    handlingDays: cleanHandlingDays(formData.get("handlingDays")),
    ...(sizeBand === "small" || sizeBand === "medium" || sizeBand === "bulky" ? { sizeBand } : {}),
  };
}

async function getUniqueSupplierProductSlug(name: string, supplierId: string) {
  const base = `${slugify(name)}-${supplierId.slice(0, 6)}`;
  let slug = base;
  let suffix = 2;

  while (await db.supplierProduct.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function readProductPayload(formData: FormData, status: "draft" | "pending_review") {
  const wholesalePriceTo = parsePositiveNumber(formData.get("wholesalePriceTo"));

  return {
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    categoryId: String(formData.get("categoryId") || "").trim(),
    images: splitList(formData.get("images")),
    wholesalePrice: parsePositiveNumber(formData.get("wholesalePrice")),
    ...(wholesalePriceTo > 0 ? { wholesalePriceTo } : {}),
    suggestedRetailPrice: parsePositiveNumber(formData.get("suggestedRetailPrice")),
    currency: String(formData.get("currency") || "NGN").trim().toUpperCase(),
    moq: Math.max(1, Math.floor(parsePositiveNumber(formData.get("moq")) || 1)),
    stockQuantity: Math.max(0, Math.floor(parsePositiveNumber(formData.get("stockQuantity")) || 0)),
    // "Same price for all" keeps one price: quantity breaks belong to "Different per channel".
    pricingTiers: formData.has("priceMode") && formData.get("priceMode") !== "per_channel" ? [] : readPricingTiers(formData),
    ...(formData.has("priceMode") ? readDropshipFields(formData) : {}),
    dropshipAvailable: readCheckbox(formData, "dropshipAvailable"),
    bulkOrderAvailable: readCheckbox(formData, "bulkOrderAvailable"),
    sampleAvailable: readCheckbox(formData, "sampleAvailable"),
    deliveryRegions: splitList(formData.get("deliveryRegions")),
    processingTime: String(formData.get("processingTime") || "").trim() || undefined,
    status,
  };
}

/** The product form's Preorders section (shared/preorder.ts): checked here, saved beside the Zod-checked fields. */
function readPreorder(formData: FormData, savedShipsAt?: Date | null) {
  return parsePreorderInput(
    {
      enabled: readCheckbox(formData, "preorderEnabled"),
      shipsAt: String(formData.get("preorderShipsAt") || "").trim() || null,
      limit: String(formData.get("preorderLimit") || "").trim() || null,
      note: String(formData.get("preorderNote") || ""),
    },
    new Date(),
    savedShipsAt,
  );
}

export async function createSupplierProduct(formData: FormData) {
  const { user, supplier } = await getSupplierActor();
  const verified = assertOnboardedSupplier(supplier);

  const [dbUser, productCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
  ]);
  if (atLimit(productCount, supplierPlanLimits(dbUser ?? {}).listings)) {
    redirect("/supplier/profile?tab=Billing%20%26%20Plan&limit=products");
  }

  const wantsReview = formData.get("intent") === "submit";
  const status = wantsReview && verified ? "pending_review" : "draft";
  const parsed = SupplierProductCreateSchema.safeParse(readProductPayload(formData, status));

  if (!parsed.success) {
    redirect(`/supplier/products/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the product details.")}`);
  }

  const priceProblem = channelPriceProblem(parsed.data);
  if (priceProblem) redirect(`/supplier/products/new?error=${encodeURIComponent(priceProblem)}`);

  const preorder = readPreorder(formData);
  if (!preorder.ok) redirect(`/supplier/products/new?error=${encodeURIComponent(preorder.message)}`);
  // Pre-orders open at Established (shared/dropship-rules.ts canTakePreorders).
  if (preorder.value.preorderEnabled) {
    const locked = await preorderLevelProblem(supplier.id);
    if (locked) redirect(`/supplier/products/new?error=${encodeURIComponent(locked)}`);
  }
  const deposit = parseDepositPct(String(formData.get("preorderDepositPct") ?? "").trim());
  if (!deposit.ok) redirect(`/supplier/products/new?error=${encodeURIComponent(deposit.message)}`);

  const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) redirect("/supplier/products/new?error=Choose%20a%20valid%20category.");

  const product = await db.supplierProduct.create({
    data: {
      ...parsed.data,
      ...preorderSaveData(preorder.value),
      preorderDepositPct: deposit.value,
      supplierId: supplier.id,
      slug: await getUniqueSupplierProductSlug(parsed.data.name, supplier.id),
    },
  });
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "product_added", ref: product.id })).catch(() => undefined);

  invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: supplier.slug, categorySlug: category.slug });
  if (product.status === "pending_review") await notifyProductForReview(product.id, product.name, supplier.displayName);
  revalidatePath("/supplier/products");
  revalidatePath("/supplier/dashboard");
  redirect(`/supplier/products/${product.id}/edit${wantsReview && !verified ? `?error=${encodeURIComponent(DRAFT_UNTIL_VERIFIED)}` : ""}`);
}

export async function updateSupplierProduct(formData: FormData) {
  const { supplier } = await getSupplierActor();
  const verified = assertOnboardedSupplier(supplier);
  const productId = String(formData.get("productId") || "");
  const product = productId
    ? await db.supplierProduct.findFirst({
        where: { id: productId, supplierId: supplier.id },
        include: { category: { select: { slug: true } } },
      })
    : null;

  if (!product) redirect("/supplier/products");

  const wantsReview = formData.get("intent") === "submit";
  const parsed = SupplierProductCreateSchema.safeParse(readProductPayload(formData, "draft"));

  if (!parsed.success) {
    redirect(`/supplier/products/${product.id}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the product details.")}`);
  }
  // A live product stays on sale when only stock, MOQ, availability or delivery details change; new photos, words
  // or prices go back to the team first (shared/supplier-product-review.ts).
  const nextStatus = statusAfterEdit({ current: product.status, verified, submit: wantsReview, needsReview: editNeedsReview(product, parsed.data) });

  const priceProblem = channelPriceProblem(parsed.data);
  if (priceProblem) redirect(`/supplier/products/${product.id}/edit?error=${encodeURIComponent(priceProblem)}`);

  const preorder = readPreorder(formData, product.preorderShipsAt);
  if (!preorder.ok) redirect(`/supplier/products/${product.id}/edit?error=${encodeURIComponent(preorder.message)}`);
  // Turning pre-orders on needs Established; a listing that already takes them stays editable and can be turned off.
  if (preorder.value.preorderEnabled && !product.preorderEnabled) {
    const locked = await preorderLevelProblem(supplier.id);
    if (locked) redirect(`/supplier/products/${product.id}/edit?error=${encodeURIComponent(locked)}`);
  }
  const deposit = parseDepositPct(String(formData.get("preorderDepositPct") ?? "").trim());
  if (!deposit.ok) redirect(`/supplier/products/${product.id}/edit?error=${encodeURIComponent(deposit.message)}`);

  const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) redirect(`/supplier/products/${product.id}/edit?error=Choose%20a%20valid%20category.`);

  // A price rise on a product shops already list waits 7 days (shared/price-notice.ts): the old prices stay live and
  // the shops are told; the edit page shows "Takes effect on …". Cuts go live now.
  const priceEdit = await supplierPriceEdit(product, {
    ...(parsed.data.priceMode !== undefined ? { priceMode: parsed.data.priceMode } : {}),
    wholesalePrice: parsed.data.wholesalePrice,
    ...(parsed.data.dropshipPrice !== undefined ? { dropshipPrice: parsed.data.dropshipPrice } : {}),
    pricingTiers: parsed.data.pricingTiers,
  });
  const updated = await db.supplierProduct.update({
    where: { id: product.id },
    data: { ...parsed.data, ...priceEdit.data, ...preorderSaveData(preorder.value, { wasEnabled: product.preorderEnabled }), preorderDepositPct: deposit.value, status: nextStatus },
  });
  if (priceEdit.plan.kind === "notice") await notifyPriceNotice(updated.id);

  invalidatePublicMarketplaceCache({ productSlug: updated.slug, supplierSlug: supplier.slug, categorySlug: category.slug ?? product.category.slug });
  if (updated.status === "pending_review" && product.status !== "pending_review") await notifyProductForReview(updated.id, updated.name, supplier.displayName);
  revalidatePath("/supplier/products");
  revalidatePath(`/supplier/products/${product.id}/edit`);
  revalidatePath("/supplier/dashboard");
  redirect(`/supplier/products/${product.id}/edit?${wantsReview && !verified ? `error=${encodeURIComponent(DRAFT_UNTIL_VERIFIED)}` : "saved=1"}`);
}

export async function respondToSupplierQuote(formData: FormData) {
  const { supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);
  const quoteId = String(formData.get("quoteId") || "");
  const intent = String(formData.get("intent") || "respond");
  const quotedPrice = parsePositiveNumber(formData.get("quotedPrice"));
  const supplierResponse = String(formData.get("supplierResponse") || "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") || "").trim();

  const quote = quoteId
    ? await db.supplierQuoteRequest.findFirst({
        where: { id: quoteId, supplierId: supplier.id },
        select: { id: true, status: true },
      })
    : null;

  if (!quote) redirect("/supplier/quote-requests?error=Quote%20not%20found.");

  if (quote.status !== "pending") {
    redirect("/supplier/quote-requests?error=This%20quote%20has%20already%20been%20handled.");
  }

  if (intent === "reject") {
    await db.supplierQuoteRequest.update({
      where: { id: quote.id },
      data: {
        status: "rejected",
        supplierResponse: supplierResponse || "Thanks for reaching out. This request is not a fit for us right now.",
      },
    });
    await notifySupplierQuoteAnswered(quote.id);

    revalidatePath("/supplier/quote-requests");
    revalidatePath("/supplier/dashboard");
    redirect("/supplier/quote-requests?saved=1");
  }

  const parsed = QuoteResponseSchema.safeParse({
    quotedPrice,
    supplierResponse: supplierResponse || undefined,
    expiresAt: expiresAtRaw || undefined,
  });

  if (!parsed.success) {
    redirect(`/supplier/quote-requests?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the quote details.")}`);
  }

  await db.supplierQuoteRequest.update({
    where: { id: quote.id },
    data: {
      status: "responded",
      quotedPrice: parsed.data.quotedPrice,
      supplierResponse: parsed.data.supplierResponse,
      expiresAt: parsed.data.expiresAt,
    },
  });
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: supplier.userId, kind: "quote_sent", ref: quote.id })).catch(() => undefined);
  await notifySupplierQuoteAnswered(quote.id);

  revalidatePath("/supplier/quote-requests");
  revalidatePath("/supplier/dashboard");
  redirect("/supplier/quote-requests?saved=1");
}

const SupplierOrderFormSchema = z.object({
  kind: z.enum(["dropship", "wholesale"]).default("wholesale"),
  orderId: z.string().min(1).max(64),
  action: z.enum(["accept", "ship", "deliver", "reject"]),
  trackingCode: OrderStatusUpdateSchema.shape.trackingCode,
  carrier: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(500).optional(),
  deliveryCode: z.string().trim().max(8).optional(),
});

/** /supplier/orders: accept, ship (with tracking), mark delivered or decline (with a reason) one of the supplier's orders. */
export async function updateSupplierOrderStatus(formData: FormData) {
  const { supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);
  const text = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    return value || undefined;
  };
  // Older forms post status=shipped instead of an action.
  const legacy = text("status");
  const parsed = SupplierOrderFormSchema.safeParse({
    kind: text("kind"),
    orderId: text("orderId"),
    action: text("action") ?? (legacy === "shipped" ? "ship" : legacy === "delivered" ? "deliver" : legacy === "confirmed" ? "accept" : undefined),
    trackingCode: text("trackingCode"),
    carrier: text("carrier"),
    reason: text("reason"),
    deliveryCode: text("deliveryCode"),
  });
  const back = (query: Record<string, string>) => {
    const params = new URLSearchParams(query);
    const kind = text("kind");
    if (kind === "dropship" || kind === "wholesale") params.set("kind", kind);
    // From the order's own page (/supplier/orders/[id]), go back there.
    const orderPage = text("returnTo");
    if (orderPage && /^\/supplier\/orders\/[\w-]{6,64}$/.test(orderPage)) return `${orderPage}?${params.toString()}`;
    return `/supplier/orders?${params.toString()}`;
  };
  if (!parsed.success) redirect(back({ error: "Choose a valid order action." }));
  if (parsed.data.action === "ship" && !parsed.data.trackingCode && text("selfDelivery") !== "1") redirect(back({ error: "Add the tracking code before you mark it shipped." }));

  const input = { supplierId: supplier.id, orderId: parsed.data.orderId, action: parsed.data.action, trackingCode: parsed.data.trackingCode, carrier: parsed.data.carrier, reason: parsed.data.reason, deliveryCode: parsed.data.deliveryCode };
  const result = parsed.data.kind === "dropship" ? await moveSupplierOrder(input) : await moveWholesaleOrder(input);
  if (!result.ok) redirect(back({ error: result.message }));

  revalidatePath("/supplier/orders");
  revalidatePath(`/supplier/orders/${parsed.data.orderId}`);
  revalidatePath("/supplier/dashboard");
  redirect(back({ saved: "1" }));
}

/** /supplier/payouts: the supplier marks a shipped or delivered order as paid to them (or not paid after all). */
export async function markSupplierPayout(formData: FormData) {
  const { supplier } = await getSupplierActor();
  const kind = String(formData.get("kind") ?? "");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const paid = String(formData.get("paid") ?? "") === "1";
  if ((kind !== "wholesale" && kind !== "dropship") || !orderId) redirect("/supplier/payouts?error=" + encodeURIComponent("Choose an order."));
  const changed = await setSupplierPayout({ supplierId: supplier.id, kind, orderId, paid });
  revalidatePath("/supplier/payouts");
  revalidatePath("/supplier/dashboard");
  redirect(changed ? "/supplier/payouts?saved=1" : "/supplier/payouts?error=" + encodeURIComponent("That order has already been updated. Refresh to see it."));
}

export async function updateSupplierProfile(formData: FormData) {
  const { user, supplier } = await getSupplierActor();
  const name = String(formData.get("name") || user.name).trim();
  const displayName = String(formData.get("displayName") || supplier.displayName).trim();
  const city = String(formData.get("city") || supplier.city).trim();
  const country = String(formData.get("country") || supplier.country).trim();
  const responseTimeLabel = String(formData.get("responseTimeLabel") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const whatsappNumber = String(formData.get("whatsappNumber") || "").trim();
  const website = String(formData.get("website") || "").trim();
  const returnPolicy = String(formData.get("returnPolicy") || "").trim().slice(0, 1500);

  await db.user.update({
    where: { id: user.id },
    data: { name, city, country },
  });

  await db.supplier.update({
    where: { id: supplier.id },
    data: {
      displayName,
      businessName: displayName,
      city,
      country,
      responseTimeLabel: responseTimeLabel || undefined,
      description: description || undefined,
      whatsappNumber: whatsappNumber || undefined,
      website: website || undefined,
      // Emptied on purpose: the minimum in the Supplier terms applies again.
      returnPolicy: formData.has("returnPolicy") ? returnPolicy || null : undefined,
    },
  });

  invalidatePublicMarketplaceCache({ supplierSlug: supplier.slug });

  redirect("/supplier/profile?saved=true");
}

export async function uploadSupplierCover(formData: FormData) {
  const { user, supplier } = await getSupplierActor();
  const file = formData.get("cover") as File | null;
  if (!file) redirect("/supplier/profile?error=No+file+selected");

  try {
    const { uploadFileServer, uploadPath } = await import("@/lib/supabase/storage.server");
    const { publicUrl } = await uploadFileServer("supplier-logos", file, uploadPath(`supplier-covers/${supplier.id}`, file));
    await db.supplier.update({ where: { id: supplier.id }, data: { bannerUrl: publicUrl } });
  } catch {
    redirect("/supplier/profile?error=Upload+failed");
  }
  redirect("/supplier/profile?saved=true");
}

export async function uploadSupplierPhoto(formData: FormData) {
  const { user, supplier } = await getSupplierActor();
  const file = formData.get("photo") as File | null;
  if (!file) redirect("/supplier/profile?error=No+file+selected");

  try {
    const { uploadFileServer, uploadPath } = await import("@/lib/supabase/storage.server");
    const { publicUrl } = await uploadFileServer("supplier-logos", file, uploadPath(`supplier-photos/${supplier.id}`, file));
    const state = typeof supplier.onboardingState === "object" && supplier.onboardingState ? { ...(supplier.onboardingState as Record<string, unknown>) } : {};
    const existingPhotos = Array.isArray(state.workshopPhotos) ? state.workshopPhotos : [];
    await db.supplier.update({
      where: { id: supplier.id },
      data: { onboardingState: { ...state, workshopPhotos: [...existingPhotos, publicUrl] } as any },
    });
  } catch {
    redirect("/supplier/profile?error=Upload+failed");
  }
  redirect("/supplier/profile?saved=true");
}

export async function saveSupplierNotificationPreferences(formData: FormData) {
  const user = await requireRole(["supplier"], "/supplier/login");

  await db.notificationPreference.upsert({
    where: {
      userId_eventKey_category: {
        userId: user.id,
        eventKey: "message_received",
        category: "marketplace",
      },
    },
    create: {
      userId: user.id,
      role: "supplier",
      eventKey: "message_received",
      category: "marketplace",
      inApp: formData.get("messageInApp") === "on",
      email: formData.get("messageEmail") === "on",
      sms: formData.get("messageSms") === "on",
    },
    update: {
      inApp: formData.get("messageInApp") === "on",
      email: formData.get("messageEmail") === "on",
      sms: formData.get("messageSms") === "on",
    },
  });

  revalidatePath("/supplier/settings");
  redirect("/supplier/settings?saved=true");
}

export async function addSupplierTeamMember(formData: FormData) {
  const { user, supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);

  const [dbUser, teamMemberCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.supplierTeamMember.count({ where: { supplierId: supplier.id, status: "active" } }),
  ]);

  if (atLimit(teamMemberCount, supplierPlanLimits(dbUser ?? {}).teamMembers)) {
    redirect("/supplier/profile?tab=Billing%20%26%20Plan&limit=team");
  }

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const role = String(formData.get("role") || "manager").trim() || "manager";

  if (name.length < 2 || !email.includes("@")) {
    redirect("/supplier/team?error=Add%20a%20valid%20name%20and%20email.");
  }

  await db.supplierTeamMember.upsert({
    where: {
      supplierId_email: {
        supplierId: supplier.id,
        email,
      },
    },
    create: {
      supplierId: supplier.id,
      name,
      email,
      phone: phone || undefined,
      role,
      status: "active",
    },
    update: {
      name,
      phone: phone || undefined,
      role,
      status: "active",
    },
  });

  revalidatePath("/supplier/team");
  revalidatePath("/supplier/profile");
  redirect("/supplier/team?saved=1");
}

export async function updateSupplierTeamMemberStatus(formData: FormData) {
  const { supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);

  const teamMemberId = String(formData.get("teamMemberId") || "");
  const status = String(formData.get("status") || "inactive");
  if (!["active", "inactive"].includes(status)) {
    redirect("/supplier/team?error=Choose%20a%20valid%20team%20member%20status.");
  }

  const teamMember = await db.supplierTeamMember.findFirst({
    where: { id: teamMemberId, supplierId: supplier.id },
    select: { id: true },
  });

  if (!teamMember) redirect("/supplier/team?error=Team%20member%20not%20found.");

  await db.supplierTeamMember.update({
    where: { id: teamMember.id },
    data: { status },
  });

  revalidatePath("/supplier/team");
  revalidatePath("/supplier/profile");
  redirect("/supplier/team?saved=1");
}

export async function removeSupplierTeamMember(formData: FormData) {
  const { supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);

  const teamMemberId = String(formData.get("teamMemberId") || "");

  const teamMember = await db.supplierTeamMember.findFirst({
    where: { id: teamMemberId, supplierId: supplier.id },
    select: { id: true },
  });

  if (!teamMember) redirect("/supplier/team?error=Team%20member%20not%20found.");

  await db.supplierTeamMember.delete({
    where: { id: teamMember.id },
  });

  revalidatePath("/supplier/team");
  revalidatePath("/supplier/profile");
  redirect("/supplier/team?saved=1");
}

/** A shop asked to dropship this supplier's products: accept the Dropship agreement, or decline it saying why. */
export async function answerDropshipAgreementAction(agreementId: string, accept: boolean, note?: string, signedName?: string) {
  const { user } = await getSupplierActor();
  const { answerAgreement } = await import("@/lib/marketplace/agreements.server");
  // Accepting signs the shop's copy of the Dropship agreement with the typed name.
  const result = await answerAgreement(user, String(agreementId).slice(0, 40), accept === true, typeof note === "string" ? note.slice(0, 600) : undefined, accept === true ? String(signedName ?? "").slice(0, 80) : undefined);
  revalidatePath("/supplier/agreements");
  return result;
}

export interface SupplierImportResult {
  ok: boolean;
  created: number;
  errors: Array<{ row: number; message: string }>;
  message?: string;
}

/** CSV bulk upload (Supplier Plus and up): every good row becomes a draft product, within the plan's listings. */
export async function importSupplierProductsCsv(csvText: string): Promise<SupplierImportResult> {
  const { user, supplier } = await getSupplierActor();
  assertOnboardedSupplier(supplier);
  const [dbUser, productCount, categories] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
    db.category.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  const limits = supplierPlanLimits(dbUser ?? {});
  if (!limits.bulkUpload) return { ok: false, created: 0, errors: [], message: "CSV bulk upload comes with the Supplier Plus plan." };
  if (typeof csvText !== "string" || csvText.length > 2_000_000) return { ok: false, created: 0, errors: [], message: "Upload a CSV file under 2 MB." };
  const parsedCsv = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const { products, errors } = parseSupplierImport(parsedCsv.data, categories);
  const room = limits.listings === null ? products.length : Math.max(0, limits.listings - productCount);
  let created = 0;
  for (const [index, { row, product }] of products.entries()) {
    if (index >= room) {
      errors.push({ row, message: await storeSafeMessage(`Your plan includes ${limits.listings} listings. Upgrade to add more.`) });
      continue;
    }
    const valid = SupplierProductCreateSchema.safeParse({ ...product, status: "draft" });
    if (!valid.success) {
      errors.push({ row, message: valid.error.issues[0]?.message ?? "Check this row." });
      continue;
    }
    // Prices per channel (shared/dropship-rules.ts).
    const priceProblem = channelPriceProblem(valid.data);
    if (priceProblem) {
      errors.push({ row, message: priceProblem });
      continue;
    }
    if (valid.data.dropshipMinQty !== undefined) valid.data.dropshipMinQty = cleanDropshipMinQty(valid.data.dropshipMinQty);
    if (valid.data.handlingDays !== undefined) valid.data.handlingDays = cleanHandlingDays(valid.data.handlingDays);
    await db.supplierProduct.create({ data: { ...valid.data, supplierId: supplier.id, slug: await getUniqueSupplierProductSlug(valid.data.name, supplier.id) } });
    created += 1;
  }
  if (created) {
    invalidatePublicMarketplaceCache({ supplierSlug: supplier.slug });
    revalidatePath("/supplier/products");
    revalidatePath("/supplier/dashboard");
  }
  return { ok: true, created, errors: errors.sort((a, b) => a.row - b.row).slice(0, 100) };
}
