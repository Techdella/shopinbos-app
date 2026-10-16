"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { STORE_ERROR_LINES, STORE_NOT_FOUND_LINES } from "./copy";
import { ErrorScene, type SceneAction } from "./ErrorScene";
import { StoreMark, shopperPalette } from "./store-brand";
import { RepairBotScene, TumblingParcelScene } from "./Illustrations";
import { useStoreBrand } from "./StoreBrandContext";
import { reloadPage, useDeployRecovery } from "./useDeployRecovery";

// Storefront 404 and error pages, in the shop's own colours and fonts. They speak for the shop, so no
// Shopinbos characters; "Back to the shop" is always the way out.

function useStoreFrame() {
  const brand = useStoreBrand();
  const theme = brand?.theme ?? resolveShopperTheme(null);
  const shopHref = brand ? getPublicStorefrontPath(brand.basePath, "/") || "/" : "/";
  return { brand, theme, shopHref };
}

export function StorefrontNotFound() {
  const { brand, theme, shopHref } = useStoreFrame();
  const router = useRouter();
  const actions: SceneAction[] = brand
    ? [
        { label: "Back to the shop", href: shopHref, icon: "store", primary: true, external: true },
        { label: "Go back", onClick: () => (window.history.length > 1 ? router.back() : window.location.assign(shopHref)), icon: "arrowLeft" },
      ]
    : [{ label: "Go back", onClick: () => router.back(), icon: "arrowLeft", primary: true }];
  return (
    <div className={BOUTIQUE_FONT_CLASS}>
      <ErrorScene
        palette={shopperPalette(theme)}
        sceneAccent={theme.accent}
        eyebrow={brand ? "404 · Not found" : "404 · No shop here"}
        title={brand ? "We couldn't find that" : "This shop doesn't exist"}
        lines={STORE_NOT_FOUND_LINES}
        body={brand ? `It may have sold out, moved, or the link has a typo. Everything else at ${brand.name} is still here.` : "Check the link. A letter may be missing, or the shop may have changed its address."}
        actions={actions}
        illustration={<TumblingParcelScene />}
        backdrop="404"
        brand={brand ? <StoreMark name={brand.name} logoUrl={brand.logoUrl} brandSettings={{ logoVariants: brand.logoVariants }} href={shopHref} theme={theme} /> : null}
      />
    </div>
  );
}

export function StorefrontError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { brand, theme, shopHref } = useStoreFrame();
  // After a new deploy the shop quietly reloads once (no platform name on a shopper's page).
  const { reloading, stale } = useDeployRecovery(error);
  useEffect(() => {
    if (!reloading) console.error(error);
  }, [error, reloading]);
  if (reloading) {
    const palette = shopperPalette(theme);
    return (
      <div className={`${BOUTIQUE_FONT_CLASS} grid min-h-dvh place-items-center px-6 text-center`} style={{ background: palette.page, color: palette.ink }} role="status" aria-live="polite">
        <div className="grid justify-items-center gap-3">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-current border-t-transparent opacity-60 motion-reduce:animate-none" aria-hidden />
          <p className="m-0 text-[15px] font-semibold">Refreshing the shop…</p>
        </div>
      </div>
    );
  }
  return (
    <div className={BOUTIQUE_FONT_CLASS}>
      <ErrorScene
        palette={shopperPalette(theme)}
        sceneAccent={theme.accent}
        eyebrow="Error · Something went wrong"
        title="This page didn't load"
        lines={STORE_ERROR_LINES}
        body="Something on our side failed. Your bag and details are saved on this device. Try again, and if it keeps happening, share the reference below with the shop."
        actions={[
          { label: "Try again", onClick: stale ? reloadPage : retry, icon: "refresh", primary: true },
          { label: "Back to the shop", href: shopHref, icon: "store", external: true },
        ]}
        digest={error.digest}
        illustration={<RepairBotScene />}
        brand={brand ? <StoreMark name={brand.name} logoUrl={brand.logoUrl} brandSettings={{ logoVariants: brand.logoVariants }} href={shopHref} theme={theme} /> : null}
      />
    </div>
  );
}
