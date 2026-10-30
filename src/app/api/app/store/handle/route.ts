import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { changeShopHandle, shopLinkFor } from "@/lib/shop-handle.server";
import { handleProblem, normaliseHandle } from "@shared/shop-handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The shop's @handle and short link (shared/shop-handle.ts), for the web's Shop link & QR page
// (src/app/home/store/share) and the phone's "Your shop link & QR" screen (apps/mobile/src/app/shop-link.tsx).
//   GET   → the share card: handle (given one now if the shop has none), short link, shop address, name, logo.
//   PATCH { handle } → changes it. The store owner only (not staff), a few changes an hour. Errors carry a code the
//         apps translate: short | long | start | chars | underscore | reserved | taken | rate_limited.

const STORE_SELECT = { id: true, name: true, slug: true, customDomain: true, logoUrl: true } as const;

const PROBLEM_MESSAGE: Record<string, string> = {
  short: "Use at least 3 letters or numbers.",
  long: "Use 24 characters or fewer.",
  start: "Start with a letter.",
  chars: "Use only letters, numbers and _ (no spaces).",
  underscore: "No double __ and no _ at the end.",
  reserved: "That one is kept for Shopinbos. Try another.",
  taken: "Another shop has that one. Try another.",
};

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: STORE_SELECT });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);
  return ok({ ...(await shopLinkFor(store)), canEdit: !user.staff });
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  if (user.staff) return apiError("FORBIDDEN", "Only the shop owner can change the @handle.", 403);
  const body = await req.json().catch(() => null);
  const requested = typeof body?.handle === "string" ? body.handle : null;
  if (requested === null || requested.length > 64) return apiError("BAD_REQUEST", "Type the @handle you want.");

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { ...STORE_SELECT, handle: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);
  // Typos and the same handle again don't count towards the limit.
  const wanted = normaliseHandle(requested);
  const shape = wanted === store.handle ? null : handleProblem(wanted);
  if (shape) return apiError(shape, PROBLEM_MESSAGE[shape], 400);

  // A little limit: changing it all the time would break printed QR codes and confuse customers.
  const limit = wanted === store.handle ? { allowed: true } : await checkRateLimitShared(rateLimitKey("shop-handle", user.id), { maxRequests: 6, windowMs: 60 * 60_000 });
  if (!limit.allowed) return apiError("rate_limited", "You've changed it a few times. Try again in an hour.", 429);

  const result = await changeShopHandle(store.id, requested);
  if (!result.ok) {
    if (result.problem === "notFound") return apiError("NOT_FOUND", "Set up your shop first.", 404);
    return apiError(result.problem, PROBLEM_MESSAGE[result.problem] ?? "Try another @handle.", result.problem === "taken" ? 409 : 400);
  }
  return ok({ ...(await shopLinkFor(store)), canEdit: true, changed: result.changed });
});
