import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";

const SupplierModerationSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "activate"]),
  trustScore: z.number().int().min(0).max(100).optional(),
});

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = SupplierModerationSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { action, trustScore } = parsed.data;
  const data =
    action === "approve"
      ? { verificationStatus: "verified" as const, status: "active", ...(trustScore !== undefined ? { trustScore } : {}) }
      : action === "reject"
        ? { verificationStatus: "rejected" as const }
        : action === "suspend"
          ? { verificationStatus: "suspended" as const, status: "suspended" }
          : { status: "active" };

  const supplier = await db.supplier.update({
    where: { id },
    data,
    select: {
      id: true,
      displayName: true,
      slug: true,
      verificationStatus: true,
      status: true,
      trustScore: true,
      updatedAt: true,
    },
  }).catch(() => null);

  if (!supplier) return apiError("NOT_FOUND", "Supplier not found", 404);

  invalidatePublicMarketplaceCache({ supplierSlug: supplier.slug });
  return ok(supplier);
});
