import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { directorySupplier } from "@/lib/suppliers/directory.server";

export const dynamic = "force-dynamic";

// GET → one supplier for its page in the phone app (the web's /marketplace/suppliers/<slug>): who they are, where,
// verification, risk, live product count and whether the seller asked to hear about new products. The products
// themselves come from /api/mobile/marketplace/products?supplier=<slug>.
export const GET = withSeller(async (_req, { user, params }) => {
  const supplier = await directorySupplier(user.id, String(params.slug));
  if (!supplier) return apiError("NOT_FOUND", "We couldn't find that supplier.", 404);
  return ok(supplier);
});
