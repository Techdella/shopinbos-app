"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { requireRole } from "@/lib/server-auth";
import { isOnboardingComplete, isProPlan } from "@/lib/role-queries";
import { SUPPLIER_FREE_PRODUCT_LIMIT } from "@/lib/plan-limits";
import { OrderStatusUpdateSchema, QuoteResponseSchema, SupplierProductCreateSchema } from "@/lib/schemas";
import { slugify } from "@/lib/workspace";

const orderStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;

async function getSupplierActor() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });

  if (!supplier) {
    redirect("/supplier/profile");
  }

  return { user, supplier };
}

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
    pricingTiers: parsePricingTiers(formData.get("pricingTiers")),
    dropshipAvailable: readCheckbox(formData, "dropshipAvailable"),
    bulkOrderAvailable: readCheckbox(formData, "bulkOrderAvailable"),
    sampleAvailable: readCheckbox(formData, "sampleAvailable"),
    deliveryRegions: splitList(formData.get("deliveryRegions")),
    processingTime: String(formData.get("processingTime") || "").trim() || undefined,
    status,
  };
}

export async function createSupplierProduct(formData: FormData) {
  const { user, supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);

  const [dbUser, productCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
  ]);
  if (!isProPlan(dbUser ?? {}) && productCount >= SUPPLIER_FREE_PRODUCT_LIMIT) {
    redirect("/supplier/profile?tab=Billing%20%26%20Plan&limit=products");
  }

  const status = formData.get("intent") === "submit" ? "pending_review" : "draft";
  const parsed = SupplierProductCreateSchema.safeParse(readProductPayload(formData, status));

  if (!parsed.success) {
    redirect(`/supplier/products/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the product details.")}`);
  }

  const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) redirect("/supplier/products/new?error=Choose%20a%20valid%20category.");

  const product = await db.supplierProduct.create({
    data: {
      ...parsed.data,
      supplierId: supplier.id,
      slug: await getUniqueSupplierProductSlug(parsed.data.name, supplier.id),
    },
  });

  invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: supplier.slug, categorySlug: category.slug });
  revalidatePath("/supplier/products");
  revalidatePath("/supplier/dashboard");
  redirect(`/supplier/products/${product.id}/edit`);
}

export async function updateSupplierProduct(formData: FormData) {
  const { supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);
  const productId = String(formData.get("productId") || "");
  const product = productId
    ? await db.supplierProduct.findFirst({
        where: { id: productId, supplierId: supplier.id },
        include: { category: { select: { slug: true } } },
      })
    : null;

  if (!product) redirect("/supplier/products");

  const requestedStatus = formData.get("intent") === "submit" ? "pending_review" : product.status === "published" ? "pending_review" : "draft";
  const parsed = SupplierProductCreateSchema.safeParse(readProductPayload(formData, requestedStatus));

  if (!parsed.success) {
    redirect(`/supplier/products/${product.id}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the product details.")}`);
  }

  const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) redirect(`/supplier/products/${product.id}/edit?error=Choose%20a%20valid%20category.`);

  const updated = await db.supplierProduct.update({
    where: { id: product.id },
    data: parsed.data,
  });

  invalidatePublicMarketplaceCache({ productSlug: updated.slug, supplierSlug: supplier.slug, categorySlug: category.slug ?? product.category.slug });
  revalidatePath("/supplier/products");
  revalidatePath(`/supplier/products/${product.id}/edit`);
  revalidatePath("/supplier/dashboard");
  redirect(`/supplier/products/${product.id}/edit?saved=1`);
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

  revalidatePath("/supplier/quote-requests");
  revalidatePath("/supplier/dashboard");
  redirect("/supplier/quote-requests?saved=1");
}

export async function updateSupplierOrderStatus(formData: FormData) {
  const { supplier } = await getSupplierActor();
  assertVerifiedSupplier(supplier);
  const orderId = String(formData.get("orderId") || "");
  const status = String(formData.get("status") || "");
  const trackingCode = String(formData.get("trackingCode") || "").trim();
  const parsed = OrderStatusUpdateSchema.safeParse({ status, trackingCode: trackingCode || undefined });

  if (!parsed.success || !orderStatuses.includes(status as never)) {
    redirect("/supplier/orders?error=Choose%20a%20valid%20order%20status.");
  }

  const order = orderId
    ? await db.wholesaleOrder.findFirst({
        where: { id: orderId, supplierId: supplier.id },
        select: { id: true },
      })
    : null;

  if (!order) redirect("/supplier/orders?error=Order%20not%20found.");

  await db.wholesaleOrder.update({
    where: { id: order.id },
    data: {
      status: parsed.data.status,
      trackingCode: parsed.data.trackingCode,
    },
  });

  revalidatePath("/supplier/orders");
  revalidatePath("/supplier/dashboard");
  redirect("/supplier/orders?saved=1");
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

  const { SUPPLIER_FREE_TEAM_MEMBER_LIMIT } = await import("@/lib/plan-limits");
  if (!isProPlan(dbUser ?? {}) && teamMemberCount >= SUPPLIER_FREE_TEAM_MEMBER_LIMIT) {
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
