import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { parseEditorState, resolveDraftSnapshot } from "@/lib/store-templates";
import { mobileLooks } from "@/lib/store-templates/mobile-looks";
import { loadSellerThemeAccess } from "@/lib/theme-access.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mobile/looks: the phone app's Shop looks screen. The web gallery's theme library (/builder/templates)
// with each theme's sample photos, whether the seller's plan includes it (and which plan does, never a price),
// the theme the shop is on and the address of each theme's live demo. Switching is POST /api/store/templates/apply,
// the same as the web.
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const [store, access] = await Promise.all([
    db.store.findUnique({ where: { userId: user.id }, select: { slug: true, brandSettings: true } }),
    loadSellerThemeAccess(user.id),
  ]);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as { editor?: unknown };
  const current = resolveDraftSnapshot(store.brandSettings, null)?.templateId ?? parseEditorState(settings.editor).template?.templateId ?? null;
  return ok(mobileLooks(access, current, store.slug));
});
