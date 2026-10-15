import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { recordMedia } from "@/lib/media/library.server";
import { readBrandAssets, type BrandAssetKind } from "@shared/brand-assets";
import { refreshLogoVariants, setDarkLogo } from "@/lib/logo-variants.server";
import type { LogoDisplay } from "@shared/store-logo";

// Saves the store's logo, logo icon, favicon or logo for dark backgrounds (Brand kit, Rex's cards, the builder).
// The url must already be in our storage (checked by the callers); null clears the icon or favicon so it falls
// back to the logo, and the dark logo so the automatic one is used. A new logo is measured for dark backgrounds.
export async function setBrandAsset(userId: string, kind: BrandAssetKind, url: string | null) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true, logoUrl: true } });
  if (!store) return null;
  if (kind === "logoDark") {
    if (!store.logoUrl) return null;
    await setDarkLogo(store.id, userId, store.logoUrl, url);
    if (url) await recordMedia({ userId, storeId: store.id, url, kind: "image", name: "Logo for dark backgrounds", source: "logo" });
    const updated = await db.store.findUnique({ where: { id: store.id }, select: { logoUrl: true, brandSettings: true } });
    return readBrandAssets(updated ?? {});
  }
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  if (kind === "logo") {
    if (!url) return null;
    await db.store.update({ where: { id: store.id }, data: { logoUrl: url } });
    await refreshLogoVariants(store.id, userId, url);
  } else {
    const next = { ...settings };
    if (kind === "icon") {
      if (url) next.logoIcon = url;
      else delete next.logoIcon;
    } else {
      const seo = settings.seo && typeof settings.seo === "object" && !Array.isArray(settings.seo) ? { ...(settings.seo as Record<string, unknown>) } : {};
      if (url) seo.favicon = url;
      else delete seo.favicon;
      next.seo = seo;
    }
    await db.store.update({ where: { id: store.id }, data: { brandSettings: next as Prisma.InputJsonValue } });
  }
  if (url) await recordMedia({ userId, storeId: store.id, url, kind: "image", name: kind === "logo" ? "Logo" : kind === "icon" ? "Logo icon" : "Favicon", source: "logo" });
  const updated = await db.store.findUnique({ where: { id: store.id }, select: { logoUrl: true, brandSettings: true } });
  return readBrandAssets(updated ?? {});
}

/** How the store header shows the brand (brandSettings.logoDisplay); live at once, no publish needed. */
export async function setLogoDisplay(userId: string, display: LogoDisplay) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } });
  if (!store) return null;
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  await db.store.update({ where: { id: store.id }, data: { brandSettings: { ...settings, logoDisplay: { style: display.style, size: display.size } } as Prisma.InputJsonValue } });
  return display;
}
