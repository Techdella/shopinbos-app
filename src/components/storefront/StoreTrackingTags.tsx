import { Suspense } from "react";
import { gtmNoscriptSrc, trackingScripts, type StoreIntegrations } from "@/lib/storefront/integrations";
import type { StoreConsentConfig } from "@/lib/storefront/consent";
import { StoreConsent } from "./StoreConsent";

// The seller's own tracking tags (Settings › Connections): Google Tag Manager, Meta Pixel and TikTok Pixel.
// Rendered by the storefront layout on every page of a live store (home, shop, product, bag, checkout, blog…,
// on the free address and the store's own domain), never in the owner's preview. Every ID was validated by
// src/lib/storefront/integrations.ts, so the inline code holds nothing a seller typed except a checked ID.
// StoreConsent loads them: after the shopper's choice on the cookie banner (`consent`), or straight away when the
// seller turned the banner off (`consent` null).
export function StoreTrackingTags({ integrations, slug, consent, currency }: { integrations: StoreIntegrations; slug: string; consent: StoreConsentConfig | null; currency: string }) {
  const scripts = trackingScripts(integrations);
  if (!scripts.length) return null;
  // Without JavaScript nobody can answer the banner, so Tag Manager's no-script frame is only for stores without one.
  const gtmFrame = consent ? "" : gtmNoscriptSrc(integrations);
  return (
    <>
      <Suspense fallback={null}>
        <StoreConsent slug={slug} scripts={scripts} config={consent} currency={currency} />
      </Suspense>
      {gtmFrame && (
        <noscript>
          <iframe src={gtmFrame} height="0" width="0" title="Google Tag Manager" style={{ display: "none", visibility: "hidden" }} />
        </noscript>
      )}
    </>
  );
}
