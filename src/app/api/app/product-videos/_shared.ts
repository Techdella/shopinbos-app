import type { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { postToPlugOnFor, videoOwnerFor, type VideoOwner } from "@/lib/product-videos/service.server";

// Product videos (Post to Plug) are for sellers and suppliers, and only while the post_to_plug pilot switch is on for
// them on the app asking (shared/feature-switches.ts): off, every route answers 403 FEATURE_OFF.

type Ctx = { user: AuthUser; params: Record<string, string>; owner: VideoOwner };

export function withVideoOwner(handler: (req: NextRequest, ctx: Ctx) => Promise<NextResponse>) {
  return withAuth(async (req, { user, params }) => {
    if (!(await postToPlugOnFor(req, user))) return apiError("FEATURE_OFF", "Product videos aren't on for your account yet.", 403);
    const owner = await videoOwnerFor(user);
    if (!owner) return apiError("NOT_FOUND", user.role === "supplier" ? "Finish setting up your supplier account first." : "Create your store first.", 404);
    return handler(req, { user, params: params ?? {}, owner });
  }, ["seller", "supplier"]);
}
