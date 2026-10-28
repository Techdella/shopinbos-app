import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { supplierLevelView } from "@/lib/supplier-levels.server";

export const dynamic = "force-dynamic";

// "Your level" (web portal and the phone app): New → Trusted → Established, worked out fresh from the record.
//   GET → { data: { level, next, goals: [{ key, label, have, need, done, kind }], perks, nextPerks, lockedMessage } }

export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const view = await supplierLevelView(supplier.id);
  if (!view) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  return ok(view);
});
