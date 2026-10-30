import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { goLive, goLiveBlockersFor, RexBuildError } from "@/lib/onboarding/rex-build.server";
import { StorePublishError } from "@/lib/store-publishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The guided build's last step (design RB-15 → RB-16).
//   GET  → { blockers }          what still stops the shop going live (a priced product, a name and link, WhatsApp)
//   POST → { live: true, url, pages } | { live: false, blockers }
//          "I love it, go live": the draft Rex built (and the seller changed on the review) is published through the
//          same publishStoreDraft as the store editor's Publish; the shop's status becomes live.
export const GET = withSeller(async (_req, { user }) => {
  try {
    return ok({ blockers: await goLiveBlockersFor(user.id) });
  } catch (error) {
    if (error instanceof RexBuildError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});

export const POST = withSeller(async (_req, { user }) => {
  try {
    return ok(await goLive(user.id));
  } catch (error) {
    if (error instanceof RexBuildError) return apiError(error.code, error.message, error.status);
    if (error instanceof StorePublishError) return apiError(error.code, error.blockers?.[0] ?? error.message, error.status);
    throw error;
  }
});
