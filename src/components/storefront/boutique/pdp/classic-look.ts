// A BoutiqueLook for the classic (pre-2026) templates, so they can render the shared product page (BoutiquePdp).
// Colours come from the store's theme tokens (the seller's palette), fonts from the classic theme's own overrides and
// shape from its radius token: the same sources TemplateStorefrontSurface's themeFor() draws classic pages with.

import type { BoutiqueThemeId, ThemeTokenSet } from "@/lib/store-templates";
import { getThemeOverrides } from "@/lib/store-templates/themes";
import type { BoutiqueLook } from "../look";

const GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "'Georgia', 'Times New Roman', serif";

function luminance(hex: string): number | null {
  const clean = hex.trim().replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function classicLook(templateId: string, tokens: ThemeTokenSet): BoutiqueLook {
  const overrides = getThemeOverrides(templateId);
  const headingFont = overrides?.headingFont ?? (tokens.headingStyle === "serif" ? SERIF : GROTESK);
  const bodyFont = overrides?.bodyFont ?? GROTESK;
  const cardRadius = tokens.radius === "soft" ? 24 : tokens.radius === "sharp" ? 6 : 16;
  // Classic pages use pill buttons except on sharp-cornered themes.
  const buttonRadius = tokens.radius === "sharp" ? 6 : 999;
  const dark = (luminance(tokens.paperBg) ?? 1) < 0.4;
  const accentLight = (luminance(tokens.accent) ?? 0) > 0.6;
  const solid = { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` };
  return {
    // Classic template ids are not 2026 theme ids; the product page only uses the id as an opaque key.
    id: templateId as BoutiqueThemeId,
    tokens,
    logoFont: headingFont,
    logoStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
    headingFont,
    headingStyle: { fontWeight: 600, letterSpacing: "-0.025em" },
    bodyFont,
    eyebrowFont: "'JetBrains Mono', ui-monospace, monospace",
    buttonRadius,
    cardRadius,
    primaryButton: solid,
    secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
    solidButton: solid,
    softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
    announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5 },
    navStyle: { fontSize: 14 },
    placeholder: `color-mix(in srgb, ${tokens.accent} 10%, ${tokens.paperBg})`,
    dark,
    onAccent: accentLight ? "#111111" : "#FFFFFF",
    raised: tokens.cardBg,
    headerBg: `color-mix(in srgb, ${tokens.paperBg} 95%, transparent)`,
    footerBg: tokens.paperBg,
    newsletterBg: tokens.cardBg,
    storyBg: tokens.cardBg,
    countBg: tokens.accent,
    heartActive: tokens.accent,
    tileRatio: "1 / 1",
    tileBorder: `1px solid ${tokens.border}`,
    pdp: "right",
    centredHeader: false,
    defaultHero: "",
  };
}
