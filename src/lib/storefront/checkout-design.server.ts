import "server-only";
import { isBoutiqueTheme } from "@/lib/store-templates";
import { storefrontPageHref } from "@shared/storefront-pages";
import { boutiqueLook } from "@/components/storefront/boutique/look";
import { classicLook } from "@/components/storefront/boutique/pdp/classic-look";
import { checkoutNavLinks, checkoutSettingsForSnapshot } from "@/components/storefront/checkout/checkout-layout";
import { checkoutThemeFromLook, type CheckoutDesign } from "@/components/storefront/checkout/checkout-theme";
import { boutiqueSnapshotFor, classicSnapshotFor, resolveStoreTemplateId } from "./product-page.server";

// The live checkout's layout settings, look and header links, from the store's published snapshot (the same snapshot
// the product page reads): the 2026 themes' own look, or classic templates through the classic look adapter.
// Stores with no template on record keep their saved palette and the default layout.

export function checkoutDesignFor(brandSettings: unknown, basePath: string): CheckoutDesign {
  const templateId = resolveStoreTemplateId(brandSettings);
  const boutique = templateId && isBoutiqueTheme(templateId) ? templateId : null;
  const snapshot = boutique ? boutiqueSnapshotFor(boutique, brandSettings) : classicSnapshotFor(brandSettings);
  const settings = checkoutSettingsForSnapshot(snapshot, boutique ?? "", boutique ? "boutique" : "classic");
  const look = boutique ? boutiqueLook(boutique, snapshot!.themeTokens) : snapshot ? classicLook(snapshot.templateId, snapshot.themeTokens) : null;
  const nav = checkoutNavLinks(snapshot).map((link) => ({ ...link, href: storefrontPageHref(basePath, link.key) ?? basePath ?? "/" }));
  return { settings, theme: look ? checkoutThemeFromLook(look) : null, nav };
}
