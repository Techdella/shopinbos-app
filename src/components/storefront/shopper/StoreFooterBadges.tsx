"use client";

import { useStoreBrand } from "@/components/errors/StoreBrandContext";
import { shopinbosBadgeHref, type ShopinbosBadgeRef } from "@/lib/store-badges";
import { COOKIE_SETTINGS_EVENT, bannerText } from "@/lib/storefront/consent";
import { PaymentBadgeRow } from "./PaymentBadges";

// The storefront footer's badges: the payment logos the seller chose and, on stores with no paid plan, a small
// "Built with Shopinbos" link. Both come from the storefront layouts (loadStoreBrand → StoreBrandProvider), so
// every page on /s/[slug] and custom domains shows the same thing. The builder's canvas has no provider, so
// nothing shows there; the owner's live preview (/s/[slug]/preview) does show them, as shoppers will see them.
// On stores with the cookie banner (src/components/storefront/StoreConsent.tsx) they start with "Cookie settings".

const MARK = "/brand/logos/shopping%20boss%20black%20icon.png";

/** The Shopinbos mark in the text colour around it (works on light and dark themes). */
function ShopinbosMark({ size = 13 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{
        width: Math.round(size * 0.875),
        height: size,
        background: "currentColor",
        WebkitMaskImage: `url("${MARK}")`,
        maskImage: `url("${MARK}")`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/** "Built with Shopinbos": a quiet pill in the footer's own muted colour and border. */
export function ShopinbosBadge({ slug, color, borderColor, hoverColor, badgeRef }: { slug: string; color: string; borderColor: string; hoverColor?: string; badgeRef?: ShopinbosBadgeRef }) {
  // A call to action for shoppers who'd like a store too: opens Shopinbos sign-up, tagged with this store.
  return (
    <a
      href={shopinbosBadgeHref(slug, process.env.NEXT_PUBLIC_APP_URL || undefined, badgeRef)}
      target="_blank"
      rel="noopener"
      aria-label="Built with Shopinbos. Start your own store"
      className="group inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-medium leading-none no-underline opacity-90 transition hover:opacity-100 hover:[color:var(--sib-badge-hover)]"
      style={{ color, borderColor, ["--sib-badge-hover" as string]: hoverColor ?? color }}
    >
      <ShopinbosMark />
      <span>
        Built with <strong className="font-bold">Shopinbos</strong>
      </span>
      <span aria-hidden className="ml-0.5 border-l pl-1.5 font-bold" style={{ borderColor }}>
        Start your store <span className="inline-block transition group-hover:translate-x-0.5">→</span>
      </span>
    </a>
  );
}

/** "Cookie settings": opens the store's cookie banner again, in the footer's muted colour. */
export function CookieSettingsButton({ color }: { color: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}
      className="inline-flex min-h-[32px] shrink-0 items-center border-0 bg-transparent p-0 text-[12.5px] underline-offset-4 hover:underline"
      style={{ color, cursor: "pointer" }}
    >
      {bannerText("settings")}
    </button>
  );
}

/** What the footers need from the layout: null outside a storefront (the builder), so they fall back. */
export function useStoreFooterBadges() {
  const brand = useStoreBrand();
  if (!brand) return null;
  return { slug: brand.slug ?? "", showBadge: Boolean(brand.showBadge && brand.slug), paymentBadges: brand.paymentBadges ?? [], cookieSettings: Boolean(brand.cookieSettings) };
}

/**
 * The payment logos and the "Built with Shopinbos" badge for a footer row, in that footer's colours. Renders
 * nothing outside a storefront, or when the store shows neither.
 */
export function StoreFooterBadges({
  muted,
  border,
  ink,
  showPayments = true,
  className = "",
  badgeRef,
}: {
  muted: string;
  border: string;
  ink?: string;
  showPayments?: boolean;
  className?: string;
  /** Where the badge sits, for the sign-up's ref (the store footer unless said). */
  badgeRef?: ShopinbosBadgeRef;
}) {
  const badges = useStoreFooterBadges();
  if (!badges) return null;
  const payments = showPayments ? badges.paymentBadges : [];
  if (!payments.length && !badges.showBadge && !badges.cookieSettings) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 ${className}`}>
      {badges.cookieSettings ? <CookieSettingsButton color={muted} /> : null}
      <PaymentBadgeRow badges={payments} />
      {badges.showBadge ? <ShopinbosBadge slug={badges.slug} color={muted} borderColor={border} hoverColor={ink} badgeRef={badgeRef} /> : null}
    </div>
  );
}

/** The same badges as a slim footer of their own, for shopper pages without a store footer (bag, checkout…). */
export function StoreFootnote({ muted, border, ink, showPayments = true, className = "", badgeRef }: { muted: string; border: string; ink?: string; showPayments?: boolean; className?: string; badgeRef?: ShopinbosBadgeRef }) {
  const badges = useStoreFooterBadges();
  if (!badges || (!(showPayments && badges.paymentBadges.length) && !badges.showBadge && !badges.cookieSettings)) return null;
  return (
    <footer className={`border-t ${className}`} style={{ borderColor: border }}>
      <StoreFooterBadges muted={muted} border={border} ink={ink} showPayments={showPayments} badgeRef={badgeRef} className="justify-between py-5" />
    </footer>
  );
}

/** "We accept" and the store's payment logos, for the checkout's order summary. */
export function WeAccept({ muted, className = "" }: { muted: string; className?: string }) {
  const badges = useStoreFooterBadges();
  if (!badges?.paymentBadges.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <span className="text-[13px] font-medium" style={{ color: muted }} aria-hidden>
        We accept
      </span>
      <PaymentBadgeRow badges={badges.paymentBadges} />
    </div>
  );
}
