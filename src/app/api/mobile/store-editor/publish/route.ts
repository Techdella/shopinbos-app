import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { publishStoreDraft, StorePublishError } from "@/lib/store-publishing";
import { storedDraftVersion } from "@/lib/store-editor/mobile.server";
import { draftVersion, versionConflict } from "@shared/store-editor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/mobile/store-editor/publish { version } → { published, draft, version, url }
// The phone's one-tap Publish (design SE-13 → SE-14). The phone saves its last change first and sends the version it
// saved, so what goes live is exactly what the seller sees; a newer draft from another device answers 409. The
// publishing itself is the web builder's (src/lib/store-publishing.ts publishStoreDraft): same draft, same live
// shop, free on every plan.
const Body = z.object({ version: z.string().max(80).nullable().optional() });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("BAD_REQUEST", "Try publishing again.", 400);

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { slug: true, customDomain: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);
  if (versionConflict(storedDraftVersion(store.brandSettings), parsed.data.version)) {
    return apiError("CONFLICT", "Your shop was changed on another device. Check the newest version, then publish.", 409);
  }

  try {
    const result = await publishStoreDraft({ userId: user.id });
    return ok({
      published: result.envelope.published,
      draft: result.envelope.draft,
      version: draftVersion(result.envelope.draft),
      url: buildStorefrontUrl(store),
    });
  } catch (error) {
    if (error instanceof StorePublishError) return apiError(error.code, error.blockers?.[0] ?? error.message, error.status);
    throw error;
  }
});
