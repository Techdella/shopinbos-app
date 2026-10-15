import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { isOwnImageUrl } from "@/lib/ai/images";
import { db } from "@/lib/db/client";
import { setBrandAsset } from "@/lib/brand-assets.server";
import { BRAND_ASSET_KINDS, readBrandAssets, type BrandAssetKind } from "@shared/brand-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The store's logo, logo icon, favicon and logo for dark backgrounds (Brand kit, the builder's header and footer).
// GET reads them; PATCH { kind, url } sets one (a picture already in our storage, e.g. uploaded or made by Rex);
// url null clears the icon or favicon (they fall back to the logo) or the dark logo (the automatic one is used).
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { logoUrl: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(readBrandAssets(store));
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { kind?: unknown; url?: unknown } | null;
  const kind = body?.kind as BrandAssetKind;
  if (!BRAND_ASSET_KINDS.includes(kind)) return apiError("BAD_REQUEST", "Say which picture: logo, icon or favicon.");
  const url = body?.url === null ? null : typeof body?.url === "string" ? body.url.trim() : undefined;
  if (url === undefined || (url !== null && !isOwnImageUrl(url))) return apiError("BAD_REQUEST", "Upload the picture first, then use it.");
  if (kind === "logo" && url === null) return apiError("BAD_REQUEST", "A store always keeps a logo. Upload a new one instead.");
  if (kind === "logoDark") {
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { logoUrl: true } });
    if (store && !store.logoUrl) return apiError("BAD_REQUEST", "Add your logo first, then its version for dark backgrounds.");
  }
  const assets = await setBrandAsset(user.id, kind, url);
  if (!assets) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(assets);
});
