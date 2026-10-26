"use server";

import { requireAdminSection } from "@/lib/admin-team/service.server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { db } from "@/lib/db/client";
import { notifyProductDecision, notifyVerificationDecision } from "@/lib/notifications/events.server";

const VerificationStatusSchema = z.enum(["unverified", "pending", "verified", "rejected", "suspended"]);
const ProductStatusSchema = z.enum(["draft", "pending_review", "published", "unpublished", "rejected"]);

function getRedirectPath(formData: FormData, fallback: string) {
  const value = String(formData.get("redirectTo") || fallback);
  return value.startsWith("/") ? value : fallback;
}

function cleanValue(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function revalidateAdminPaths(...paths: string[]) {
  revalidatePath("/admin");
  revalidatePath("/admin/dashboard");
  for (const path of paths) {
    revalidatePath(path);
  }
}

/**
 * Approve / Reject with followUp: straight on to Admin › Inbox › New conversation with the approval or "not yet"
 * message ready for that business (Skip goes back where the decision was made).
 */
function followUpMessage(formData: FormData, userId: string, status: string, fallback: string) {
  if (formData.get("followUp") !== "1" || (status !== "verified" && status !== "rejected")) return;
  const params = new URLSearchParams({ to: `user:${userId}`, preset: status === "verified" ? "approved" : "rejected", back: getRedirectPath(formData, fallback) });
  redirect(`/admin/support/new?${params}`);
}

async function requireAdmin() {
  return requireAdminSection("partners");
}

export async function updateSupplierVerification(formData: FormData) {
  await requireAdmin();
  const supplierId = formData.get("supplierId");
  const status = formData.get("status");
  const trustScore = formData.get("trustScore");

  const parsed = z.object({
    supplierId: z.string().min(1),
    status: VerificationStatusSchema,
  }).safeParse({ supplierId, status });

  if (!parsed.success) redirect(getRedirectPath(formData, "/admin/suppliers"));

  // An absent or blank score keeps the current one (Number(null) would otherwise reset it to 0).
  const parsedTrustScore = z.coerce.number().int().min(0).max(100).safeParse(typeof trustScore === "string" && trustScore.trim() ? trustScore : undefined);

  const supplier = await db.supplier.update({
    where: { id: parsed.data.supplierId },
    data: {
      verificationStatus: parsed.data.status,
      status: parsed.data.status === "suspended" ? "suspended" : "active",
      ...(parsedTrustScore.success ? { trustScore: parsedTrustScore.data } : {}),
    },
    select: { slug: true, userId: true },
  }).catch(() => null);

  if (supplier) {
    await notifyVerificationDecision({ userId: supplier.userId, status: parsed.data.status, portal: "supplier" });
    invalidatePublicMarketplaceCache({ supplierSlug: supplier.slug });
    revalidateAdminPaths("/admin/suppliers", "/admin/marketplace");
    followUpMessage(formData, supplier.userId, parsed.data.status, "/admin/suppliers");
  }

  redirect(getRedirectPath(formData, "/admin/suppliers"));
}

/**
 * A logistics partner's account status after a verification decision. Suspending suspends (they leave checkout at
 * once; jobs they already have carry on). Any other decision only lifts a suspension: a partner who paused
 * "Taking new jobs" themselves stays paused.
 */
function partnerStatusAfter(current: string, verification: z.infer<typeof VerificationStatusSchema>) {
  if (verification === "suspended") return "suspended";
  return current === "suspended" ? "active" : current;
}

export async function updateLogisticsVerification(formData: FormData) {
  await requireAdmin();
  const logisticsPartnerId = formData.get("logisticsPartnerId");
  const status = formData.get("status");
  const reliabilityScore = formData.get("reliabilityScore");

  const parsed = z.object({
    logisticsPartnerId: z.string().min(1),
    status: VerificationStatusSchema,
  }).safeParse({ logisticsPartnerId, status });

  if (!parsed.success) redirect(getRedirectPath(formData, "/admin/logistics-partners"));

  const parsedScore = z.coerce.number().int().min(0).max(100).safeParse(typeof reliabilityScore === "string" && reliabilityScore.trim() ? reliabilityScore : undefined);

  const current = await db.logisticsPartner.findUnique({ where: { id: parsed.data.logisticsPartnerId }, select: { status: true } });
  const partner = current
    ? await db.logisticsPartner.update({
        where: { id: parsed.data.logisticsPartnerId },
        data: {
          verificationStatus: parsed.data.status,
          status: partnerStatusAfter(current.status, parsed.data.status),
          ...(parsedScore.success ? { reliabilityScore: parsedScore.data } : {}),
        },
        select: { slug: true, userId: true },
      }).catch(() => null)
    : null;

  if (partner) {
    await notifyVerificationDecision({ userId: partner.userId, status: parsed.data.status, portal: "logistics" });
    invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
    revalidateAdminPaths("/admin/logistics-partners", "/admin/marketplace");
    followUpMessage(formData, partner.userId, parsed.data.status, "/admin/logistics-partners");
  }

  redirect(getRedirectPath(formData, "/admin/logistics-partners"));
}

export async function updateSupplierProductStatus(formData: FormData) {
  await requireAdmin();
  const productId = formData.get("productId");
  const status = formData.get("status");

  const parsed = z.object({
    productId: z.string().min(1),
    status: ProductStatusSchema,
  }).safeParse({ productId, status });

  if (!parsed.success) redirect(getRedirectPath(formData, "/admin/supplier-products"));

  const product = await db.supplierProduct.update({
    where: { id: parsed.data.productId },
    data: { status: parsed.data.status },
    select: {
      slug: true,
      supplier: { select: { slug: true } },
      category: { select: { slug: true } },
    },
  }).catch(() => null);

  if (product) {
    invalidatePublicMarketplaceCache({
      productSlug: product.slug,
      supplierSlug: product.supplier.slug,
      categorySlug: product.category.slug,
    });
    await notifyProductDecision(parsed.data.productId, parsed.data.status);
    revalidateAdminPaths("/admin/supplier-products", "/admin/marketplace");
  }

  redirect(getRedirectPath(formData, "/admin/supplier-products"));
}

export async function updateSupplierProductTrend(formData: FormData) {
  await requireAdmin();
  const productId = formData.get("productId");
  const trendScore = formData.get("trendScore");

  const parsedId = z.string().min(1).safeParse(productId);
  const parsedScore = z.coerce.number().int().min(0).max(1000).safeParse(trendScore);

  if (!parsedId.success || !parsedScore.success) redirect(getRedirectPath(formData, "/admin/supplier-products"));

  const product = await db.supplierProduct.update({
    where: { id: parsedId.data },
    data: { trendScore: parsedScore.data },
    select: {
      slug: true,
      supplier: { select: { slug: true } },
      category: { select: { slug: true } },
    },
  }).catch(() => null);

  if (product) {
    invalidatePublicMarketplaceCache({
      productSlug: product.slug,
      supplierSlug: product.supplier.slug,
      categorySlug: product.category.slug,
    });
    revalidateAdminPaths("/admin/supplier-products", "/admin/marketplace");
  }

  redirect(getRedirectPath(formData, "/admin/supplier-products"));
}

export async function upsertCategory(formData: FormData) {
  await requireAdmin();
  const name = cleanValue(formData.get("name"));

  const parsed = z.object({
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().max(500).nullable().optional(),
    imageUrl: z.string().max(500).nullable().optional(),
    parentId: z.string().nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  }).safeParse({
    name,
    slug: cleanValue(formData.get("slug")),
    description: cleanValue(formData.get("description")),
    imageUrl: cleanValue(formData.get("imageUrl")),
    parentId: cleanValue(formData.get("parentId")),
    sortOrder: formData.get("sortOrder"),
  });

  const redirectTo = getRedirectPath(formData, "/admin/categories");
  if (!parsed.success) redirect(redirectTo);

  const redirectTarget = getRedirectPath(formData, "/admin/categories");
  const data = parsed.data;
  const slug = data.slug || toSlug(data.name);

  const categoryId = cleanValue(formData.get("categoryId"));
  const existing = categoryId
    ? await db.category.findUnique({ where: { id: categoryId }, select: { slug: true } })
    : null;

  const category = categoryId
    ? await db.category.update({
        where: { id: categoryId },
        data: {
          name: data.name,
          slug,
          description: formData.has("description") ? data.description : undefined,
          imageUrl: formData.has("imageUrl") ? data.imageUrl : undefined,
          // "No parent" submits an empty value, which must clear the parent.
          parentId: formData.has("parentId") ? data.parentId ?? null : undefined,
          sortOrder: data.sortOrder,
        },
        select: { slug: true },
      }).catch(() => null)
    : await db.category.create({
        data: {
          name: data.name,
          slug,
          description: data.description ?? undefined,
          imageUrl: data.imageUrl ?? undefined,
          parentId: data.parentId ?? undefined,
          sortOrder: data.sortOrder,
        },
        select: { slug: true },
      }).catch(() => null);

  if (category) {
    if (existing?.slug) {
      invalidatePublicMarketplaceCache({ categorySlug: existing.slug });
    }
    invalidatePublicMarketplaceCache({ categorySlug: category.slug });
    revalidateAdminPaths("/admin/categories", "/admin/marketplace");
  }

  redirect(redirectTarget);
}

export async function updateUserVerification(formData: FormData) {
  await requireAdmin();
  const userId = formData.get("userId");
  const status = formData.get("status");

  const parsed = z.object({
    userId: z.string().min(1),
    status: VerificationStatusSchema,
  }).safeParse({ userId, status });

  if (!parsed.success) redirect(getRedirectPath(formData, "/admin/dashboard"));

  const changed = await db.user.update({
    where: { id: parsed.data.userId },
    data: { verificationStatus: parsed.data.status },
    select: { id: true, role: true },
  }).catch(() => null);
  if (changed) await notifyVerificationDecision({ userId: changed.id, status: parsed.data.status, portal: changed.role === "supplier" ? "supplier" : changed.role === "logistics_partner" ? "logistics" : "seller" });

  revalidateAdminPaths("/admin/dashboard");
  redirect(getRedirectPath(formData, "/admin/dashboard"));
}

// ─── Bulk Moderation Actions ───────────────────────────────────────────────

export async function bulkUpdateSupplierProductStatus(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("productIds").map(String).filter(Boolean);
  const status = formData.get("status");

  const parsedStatus = ProductStatusSchema.safeParse(status);
  if (ids.length === 0 || !parsedStatus.success) redirect(getRedirectPath(formData, "/admin/supplier-products"));

  await db.supplierProduct.updateMany({
    where: { id: { in: ids } },
    data: { status: parsedStatus.data },
  }).catch(() => null);

  const updated = await db.supplierProduct.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, supplier: { select: { slug: true } }, category: { select: { slug: true } } },
  });

  for (const product of updated) {
    invalidatePublicMarketplaceCache({
      productSlug: product.slug,
      supplierSlug: product.supplier.slug,
      categorySlug: product.category.slug,
    });
    await notifyProductDecision(product.id, parsedStatus.data);
  }

  revalidateAdminPaths("/admin/supplier-products", "/admin/marketplace");
  redirect(getRedirectPath(formData, "/admin/supplier-products"));
}

export async function bulkUpdateSupplierVerification(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("supplierIds").map(String).filter(Boolean);
  const status = formData.get("status");

  const parsedStatus = VerificationStatusSchema.safeParse(status);
  if (ids.length === 0 || !parsedStatus.success) redirect(getRedirectPath(formData, "/admin/suppliers"));

  await db.supplier.updateMany({
    where: { id: { in: ids } },
    data: {
      verificationStatus: parsedStatus.data,
      status: parsedStatus.data === "suspended" ? "suspended" : "active",
    },
  }).catch(() => null);

  const updated = await db.supplier.findMany({
    where: { id: { in: ids } },
    select: { slug: true, userId: true },
  });

  for (const supplier of updated) {
    invalidatePublicMarketplaceCache({ supplierSlug: supplier.slug });
    await notifyVerificationDecision({ userId: supplier.userId, status: parsedStatus.data, portal: "supplier" });
  }

  revalidateAdminPaths("/admin/suppliers", "/admin/marketplace");
  redirect(getRedirectPath(formData, "/admin/suppliers"));
}

export async function bulkUpdateLogisticsVerification(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("logisticsPartnerIds").map(String).filter(Boolean);
  const status = formData.get("status");

  const parsedStatus = VerificationStatusSchema.safeParse(status);
  if (ids.length === 0 || !parsedStatus.success) redirect(getRedirectPath(formData, "/admin/logistics-partners"));

  // Suspending takes them out of checkout at once; any other decision only lifts a suspension (a partner who
  // paused "Taking new jobs" themselves stays paused).
  await db.$transaction([
    db.logisticsPartner.updateMany({ where: { id: { in: ids } }, data: { verificationStatus: parsedStatus.data } }),
    parsedStatus.data === "suspended"
      ? db.logisticsPartner.updateMany({ where: { id: { in: ids } }, data: { status: "suspended" } })
      : // Any other status than the company's own active/paused choice (suspended, or an older value such as
        // "pending") goes back to active, so "Taking new jobs" works once they're verified.
        db.logisticsPartner.updateMany({ where: { id: { in: ids }, status: { notIn: ["active", "paused"] } }, data: { status: "active" } }),
  ]).catch(() => null);

  const updated = await db.logisticsPartner.findMany({
    where: { id: { in: ids } },
    select: { slug: true, userId: true },
  });

  for (const partner of updated) {
    invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
    await notifyVerificationDecision({ userId: partner.userId, status: parsedStatus.data, portal: "logistics" });
  }

  revalidateAdminPaths("/admin/logistics-partners", "/admin/marketplace");
  redirect(getRedirectPath(formData, "/admin/logistics-partners"));
}

/** The team marks a customer's delivery problem resolved (from /admin/delivery-issues or a partner's page). */
export async function resolveDeliveryIssueAdmin(formData: FormData) {
  await requireAdmin();
  const back = getRedirectPath(formData, "/admin/delivery-issues");
  const issueId = String(formData.get("issueId") || "").trim();
  const join = back.includes("?") ? "&" : "?";
  if (!issueId) redirect(`${back}${join}error=${encodeURIComponent("Pick a problem to resolve.")}`);
  const moved = await db.deliveryIssue.updateMany({ where: { id: issueId, status: "open" }, data: { status: "resolved", resolvedAt: new Date() } });
  revalidateAdminPaths("/admin/delivery-issues", "/admin/logistics-partners");
  redirect(`${back}${join}${moved.count === 1 ? `saved=${encodeURIComponent("Marked resolved.")}` : `error=${encodeURIComponent("That problem is already resolved.")}`}`);
}
