"use client";

import Link from "next/link";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { StoreFootnote } from "./StoreFooterBadges";
import { StoreBrandMark } from "../StoreBrandMark";
import { StoreLogo } from "@/components/storefront/StoreLogo";
import type { ShopperTheme } from "./theme";

// Frame for the bag, wishlist, checkout and order pages: the store's name and colours, a way back to
// shopping, and links to the bag and wishlist. Full width; content columns size themselves.

export function ShopperShell({
  theme,
  storeName,
  logoUrl,
  brandSettings,
  basePath,
  title,
  bagCount,
  wishlistCount,
  showWishlist = true,
  footPayments = true,
  nav,
  centered = false,
  children,
}: {
  theme: ShopperTheme;
  storeName: string;
  logoUrl?: string | null;
  /** For the logo icon, how the header shows the brand and the logo for dark backgrounds (Brand kit). */
  brandSettings?: unknown;
  basePath: string;
  title?: string;
  bagCount?: number;
  wishlistCount?: number;
  showWishlist?: boolean;
  /** The payment logos in the footnote (checkout shows them by the total instead). */
  footPayments?: boolean;
  /** The store's page links beside the logo (checkout's "Logo and links" header). */
  nav?: Array<{ key: string; label: string; href: string }>;
  /** Logo centred on its own, nothing else in the header (distraction-free checkout). */
  centered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${BOUTIQUE_FONT_CLASS} min-h-screen`}
      style={{ background: theme.paper, color: theme.ink, fontFamily: theme.body, ["--sh-cta" as string]: theme.cta, ["--sh-ink" as string]: theme.ink }}
    >
      <a href="#shopper-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="@container sticky top-[var(--sb-preview-h,0px)] z-30 border-b backdrop-blur" style={{ background: `${theme.headerBg}F2`, borderColor: theme.border }}>
        <div className={`flex min-h-16 py-1.5 items-center gap-3 px-4 sm:px-6 lg:px-10 ${centered ? "justify-center" : ""}`}>
          <Link href={getPublicStorefrontPath(basePath, "/")} className="flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
            <StoreBrandMark store={{ logoUrl, brandSettings }} name={storeName} background={theme.headerBg} nameClassName="text-[17px] font-semibold" nameStyle={{ fontFamily: theme.heading, color: theme.headerText }} />
          </Link>
          {title && !centered ? <span className="hidden truncate text-[14px] sm:inline" style={{ color: theme.muted }}>/ {title}</span> : null}
          {nav?.length && !centered ? (
            <nav aria-label="Store" className="ml-4 hidden min-w-0 items-center gap-1 @2xl:flex">
              {nav.map((link) => (
                <Link key={link.key} href={link.href} className="inline-flex min-h-11 items-center rounded-full px-3 text-[14px] font-medium focus-visible:outline focus-visible:outline-2" style={{ color: theme.headerText }}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <nav aria-label="Shopping" className={centered ? "hidden" : "ml-auto flex items-center gap-1.5"}>
            {showWishlist && wishlistCount !== undefined ? (
              <Link
                href={getPublicStorefrontPath(basePath, "/wishlist")}
                className="relative grid h-11 w-11 place-items-center rounded-full focus-visible:outline focus-visible:outline-2"
                aria-label={`Wishlist, ${wishlistCount} saved`}
              >
                <Icon name="heart" size={19} />
                {wishlistCount ? <CountBadge theme={theme} count={wishlistCount} /> : null}
              </Link>
            ) : null}
            {bagCount !== undefined ? (
              <Link
                href={getPublicStorefrontPath(basePath, "/cart")}
                className="relative grid h-11 w-11 place-items-center rounded-full focus-visible:outline focus-visible:outline-2"
                aria-label={`Bag, ${bagCount} ${bagCount === 1 ? "item" : "items"}`}
              >
                <Icon name="bag" size={19} />
                {bagCount ? <CountBadge theme={theme} count={bagCount} /> : null}
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main id="shopper-main" className="px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16">
        {children}
        {/* Payment logos and, "Built with Shopinbos" (from the storefront layout). */}
        <StoreFootnote muted={theme.muted} border={theme.border} ink={theme.ink} showPayments={footPayments} className="mt-12" />
      </main>
    </div>
  );
}

function CountBadge({ theme, count }: { theme: ShopperTheme; count: number }) {
  return (
    <span aria-hidden className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold" style={{ background: theme.accent, color: "#fff" }}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Money({ amount, currency }: { amount: number; currency: string }) {
  return <>{formatStoreMoney(amount, currency)}</>;
}

export function PageTitle({ theme, children, sub }: { theme: ShopperTheme; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]" style={{ fontFamily: theme.heading }}>{children}</h1>
      {sub ? <p className="mt-1.5 text-[15px]" style={{ color: theme.muted }}>{sub}</p> : null}
    </div>
  );
}

export function Panel({ theme, children, className = "", as: Tag = "section", ...rest }: { theme: ShopperTheme; children: React.ReactNode; className?: string; as?: "section" | "div" | "aside" } & React.AriaAttributes) {
  return (
    <Tag className={`border ${className}`} style={{ background: theme.surface, borderColor: theme.border, borderRadius: theme.radius }} {...rest}>
      {children}
    </Tag>
  );
}

export function PrimaryButton({
  theme,
  children,
  className = "",
  ...props
}: { theme: ShopperTheme; children: React.ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{ background: theme.cta, color: theme.ctaText, outlineColor: theme.ink, borderRadius: theme.buttonRadius }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  theme,
  children,
  className = "",
  ...props
}: { theme: ShopperTheme; children: React.ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{ borderColor: theme.border, color: theme.ink, background: theme.surface, borderRadius: theme.buttonRadius }}
    >
      {children}
    </button>
  );
}

export function QuantityStepper({
  theme,
  value,
  max,
  label,
  onChange,
}: {
  theme: ShopperTheme;
  value: number;
  max?: number;
  label: string;
  onChange: (quantity: number) => void;
}) {
  const atMax = typeof max === "number" && value >= max;
  return (
    <div className="inline-flex items-center rounded-full border" style={{ borderColor: theme.border }} role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" onClick={() => onChange(value - 1)} className="grid h-10 w-10 place-items-center rounded-full focus-visible:outline focus-visible:outline-2" aria-label={value <= 1 ? `Remove ${label}` : `One less ${label}`}>
        <Icon name={value <= 1 ? "trash" : "minus"} size={15} />
      </button>
      <span className="min-w-[28px] text-center text-[15px] font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={atMax} className="grid h-10 w-10 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 disabled:opacity-30" aria-label={`One more ${label}`}>
        <Icon name="plus" size={15} />
      </button>
    </div>
  );
}

export function ProgressBar({ theme, percent, label }: { theme: ShopperTheme; percent: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 w-full overflow-hidden rounded-full" style={{ background: theme.border }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${percent}%`, background: theme.cta }} />
    </div>
  );
}

export function ItemThumb({ theme, src, alt, size = 72 }: { theme: ShopperTheme; src?: string | null; alt: string; size?: number }) {
  return (
    <span className="block shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: Math.min(theme.radius, 14), background: theme.border }}>
      {src ? <img src={src} alt={alt} width={size} height={size} loading="lazy" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

export const fieldClass =
  "mt-1.5 block h-12 w-full rounded-[14px] border bg-white px-4 text-[16px] outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1";
