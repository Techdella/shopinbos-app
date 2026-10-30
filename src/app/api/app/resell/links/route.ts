import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { linkForReseller } from "@/lib/resell/service.server";
import { resellFailure, resellOff, resellOnForRequest } from "@/lib/resell/route-helpers.server";

export const dynamic = "force-dynamic";

// "Get my link": the reseller's own short link for a product (app.shopinbos.com/rs/<code>), made once and then the
// same every time. New links are rate limited (a burst limit and RESELL_LINKS_PER_DAY a day).
//   POST { productId } → { data: { link, code, created } }
const Schema = z.object({ productId: z.string().min(1).max(64) });

export const POST = withAuth(async (req, { user }) => {
  if (!(await resellOnForRequest(req, user.id))) return resellOff();
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Choose a product");
  try {
    const result = await linkForReseller(user.id, parsed.data.productId);
    if (!result.ok) return apiError(result.code, result.message, result.code === "RATE_LIMITED" ? 429 : result.code === "OWN_SHOP" ? 400 : 404);
    return ok({ link: result.link, code: result.code, created: result.created });
  } catch (error) {
    return resellFailure(error);
  }
});
