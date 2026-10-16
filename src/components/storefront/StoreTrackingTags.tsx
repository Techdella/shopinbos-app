import Script from "next/script";
import { gtmNoscriptSrc, trackingScripts, type StoreIntegrations } from "@/lib/storefront/integrations";

// The seller's own tracking tags (Settings › Connections): GA4, Google Tag Manager, Meta Pixel and TikTok Pixel.
// Rendered by the storefront layout on every page of a live store (home, shop, product, bag, checkout, blog…,
// on the free address and the store's own domain), never in the owner's preview. Every ID was validated by
// src/lib/storefront/integrations.ts, so the inline code holds nothing a seller typed except a checked ID.
export function StoreTrackingTags({ integrations }: { integrations: StoreIntegrations }) {
  const scripts = trackingScripts(integrations);
  if (!scripts.length) return null;
  const gtmFrame = gtmNoscriptSrc(integrations);
  return (
    <>
      {scripts.map((script) =>
        script.src ? (
          <Script key={script.id} id={script.id} src={script.src} strategy="afterInteractive" />
        ) : (
          <Script key={script.id} id={script.id} strategy="afterInteractive">
            {script.inline}
          </Script>
        ),
      )}
      {gtmFrame && (
        <noscript>
          <iframe src={gtmFrame} height="0" width="0" title="Google Tag Manager" style={{ display: "none", visibility: "hidden" }} />
        </noscript>
      )}
    </>
  );
}
