// The checkout's colours, type and shape from a theme look: boutiqueLook() for the 2026 themes, classicLook() (the
// look adapter for classic templates) for the rest. Same tokens the storefront draws with, so the checkout looks native.

import type { BoutiqueLook } from "../boutique/look";
import type { ShopperTheme } from "../shopper/theme";
import type { CheckoutPageSettings } from "./checkout-layout";

function hex(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

export function checkoutThemeFromLook(look: BoutiqueLook): ShopperTheme {
  const t = look.tokens;
  const paper = hex(t.paperBg, "#FAF7F1");
  return {
    paper,
    surface: t.cardBg || "#FFFFFF",
    ink: t.ink,
    muted: t.muted,
    border: t.border,
    cta: t.ctaBg,
    ctaText: t.ctaText,
    accent: t.accent,
    // The header appends an alpha to this, so it must be a 6-digit hex.
    headerBg: paper,
    headerText: t.ink,
    heading: look.headingFont,
    body: look.bodyFont,
    radius: Math.min(look.cardRadius, 24),
    buttonRadius: look.buttonRadius,
  };
}

/** How the live checkout looks: the checkout page settings and theme from the store's published snapshot. */
export interface CheckoutDesign {
  settings: CheckoutPageSettings;
  /** Null: the store's saved palette (resolveShopperTheme). */
  theme: ShopperTheme | null;
  /** The store's page links for the "Logo and links" header. */
  nav: Array<{ key: string; label: string; href: string }>;
}
