import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { isOwnImageUrl } from "@/lib/ai/images";
import { setBrandAsset, setLogoDisplay } from "@/lib/brand-assets.server";
import { isLogoSize, isLogoStyle } from "@shared/store-logo";
import { BRAND_ASSET_KINDS, type BrandAssetKind } from "@shared/brand-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The store's logo, logo icon and favicon (Brand kit). PATCH { kind, url } sets one (a picture already in our
// storage, e.g. uploaded or made by Rex); url null clears the icon or favicon (they fall back to the logo).
// PATCH { logoDisplay: { style, size } } sets how the store header shows the brand.
export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { kind?: unknown; url?: unknown; logoDisplay?: { style?: unknown; size?: unknown } } | null;
  if (body?.logoDisplay) {
    const { style, size } = body.logoDisplay;
    if (!isLogoStyle(style) || !isLogoSize(size)) return apiError("BAD_REQUEST", "Pick a logo style and size.");
    const saved = await setLogoDisplay(user.id, { style, size });
    if (!saved) return apiError("NOT_FOUND", "Set up your store first.", 404);
    return ok(saved);
  }
  const kind = body?.kind as BrandAssetKind;
  if (!BRAND_ASSET_KINDS.includes(kind)) return apiError("BAD_REQUEST", "Say which picture: logo, icon or favicon.");
  const url = body?.url === null ? null : typeof body?.url === "string" ? body.url.trim() : undefined;
  if (url === undefined || (url !== null && !isOwnImageUrl(url))) return apiError("BAD_REQUEST", "Upload the picture first, then use it.");
  if (kind === "logo" && url === null) return apiError("BAD_REQUEST", "A store always keeps a logo. Upload a new one instead.");
  const assets = await setBrandAsset(user.id, kind, url);
  if (!assets) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(assets);
});
