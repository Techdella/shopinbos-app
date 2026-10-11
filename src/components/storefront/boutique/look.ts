import type React from "react";
import type { BoutiqueThemeId, ThemeTokenSet } from "@/lib/store-templates";
import type { ShopperNavColors } from "../shopper/ShopperBottomNav";

// Typography and shape for each 2026 theme. Colours come from the snapshot's theme tokens so a seller's
// palette changes in the editor carry through; layout and type come from the theme itself.

export interface BoutiqueLook {
  id: BoutiqueThemeId;
  tokens: ThemeTokenSet;
  logoFont: string;
  logoStyle: React.CSSProperties;
  headingFont: string;
  headingStyle: React.CSSProperties;
  bodyFont: string;
  buttonRadius: number;
  cardRadius: number;
  /** Primary button: filled accent (Breeze), filled ink (Plain) or outlined (Noir). */
  primaryButton: React.CSSProperties;
  secondaryButton: React.CSSProperties;
  announcement: React.CSSProperties;
  navStyle: React.CSSProperties;
  /** Placeholder surface for products and banners without a photo yet. */
  placeholder: string;
  dark: boolean;
}

const SANS = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";
const SERIF = "var(--font-accent), 'Fraunces', Georgia, 'Times New Roman', serif";

export function boutiqueLook(id: BoutiqueThemeId, tokens: ThemeTokenSet): BoutiqueLook {
  if (id === "noir") {
    return {
      id,
      tokens,
      logoFont: SERIF,
      logoStyle: { fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
      headingFont: SERIF,
      headingStyle: { fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
      bodyFont: SANS,
      buttonRadius: 0,
      cardRadius: 0,
      primaryButton: { background: "transparent", color: tokens.heroText, border: `1.5px solid ${tokens.heroText}` },
      secondaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
      announcement: { background: "#000000", color: "#FFFFFF", letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 11.5 },
      navStyle: { textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12.5 },
      placeholder: "#1B1B1B",
      dark: true,
    };
  }
  if (id === "plain") {
    return {
      id,
      tokens,
      logoFont: SANS,
      logoStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
      headingFont: SANS,
      headingStyle: { fontWeight: 400, letterSpacing: "-0.02em" },
      bodyFont: SANS,
      buttonRadius: 6,
      cardRadius: 0,
      primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
      secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
      announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5 },
      navStyle: { fontSize: 14 },
      placeholder: "#EFEFEF",
      dark: false,
    };
  }
  return {
    id,
    tokens,
    logoFont: SERIF,
    logoStyle: { fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.01em" },
    headingFont: SANS,
    headingStyle: { fontWeight: 400, letterSpacing: "-0.02em" },
    bodyFont: SANS,
    buttonRadius: 10,
    cardRadius: 14,
    primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
    secondaryButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
    announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5, letterSpacing: "0.02em" },
    navStyle: { fontSize: 14 },
    placeholder: "#EDEFF0",
    dark: false,
  };
}

export function lookVars(look: BoutiqueLook): React.CSSProperties {
  const t = look.tokens;
  return {
    "--bq-paper": t.paperBg,
    "--bq-ink": t.ink,
    "--bq-muted": t.muted,
    "--bq-border": t.border,
    "--bq-accent": t.accent,
    "--bq-cta": t.ctaBg,
    "--bq-cta-text": t.ctaText,
    "--bq-card": t.cardBg,
    "--bq-hero": t.heroBg,
    "--bq-hero-text": t.heroText,
    "--bq-placeholder": look.placeholder,
    "--bq-button-radius": `${look.buttonRadius}px`,
    "--bq-card-radius": `${look.cardRadius}px`,
    "--bq-heading": look.headingFont,
    background: t.paperBg,
    color: t.ink,
    fontFamily: look.bodyFont,
  } as React.CSSProperties;
}

export function navColors(look: BoutiqueLook): Partial<ShopperNavColors> {
  const t = look.tokens;
  if (look.dark) {
    return { bar: "#1E1E1E", barText: "#F5F2EA", active: t.accent, activeText: "#0A0A0A", badge: t.accent, badgeText: "#0A0A0A", sheet: "#161616", ink: "#F5F2EA", muted: "#A9A49A", border: "#2C2B29" };
  }
  return { bar: "#FFFFFF", barText: t.ink, active: look.id === "breeze" ? t.ink : t.ctaBg, activeText: look.id === "breeze" ? "#FFFFFF" : t.ctaText, badge: look.id === "plain" ? t.ink : t.accent, badgeText: "#FFFFFF", sheet: "#FFFFFF", ink: t.ink, muted: t.muted, border: t.border };
}

/** Scoped CSS for the 2026 themes. Container queries, so editor phone previews lay out like real phones. */
export const BOUTIQUE_CSS = `
.bq{container-type:inline-size;container-name:bq;min-height:100%;-webkit-font-smoothing:antialiased}
.bq *{box-sizing:border-box}
.bq a{color:inherit;text-decoration:none}
.bq :where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--bq-accent);outline-offset:3px}
.bq-wrap{width:100%;max-width:1320px;margin:0 auto;padding-left:16px;padding-right:16px}
.bq-h{font-family:var(--bq-heading);margin:0;line-height:1.1}
.bq-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border-radius:var(--bq-button-radius);font-weight:600;font-size:14.5px;cursor:pointer;transition:opacity .15s,transform .15s;white-space:nowrap}
.bq-btn:hover{opacity:.9}
.bq-btn:disabled{opacity:.55;cursor:not-allowed}
.bq-icon-btn{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:999px;background:transparent;border:0;color:inherit;cursor:pointer;position:relative}
.bq-count{position:absolute;top:2px;right:0;min-width:17px;height:17px;padding:0 4px;border-radius:999px;font-size:10px;font-weight:700;display:grid;place-items:center;background:var(--bq-accent);color:#fff}
.bq-ph{background:var(--bq-placeholder)}
.bq-media{position:relative;overflow:hidden;background:var(--bq-placeholder)}
.bq-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bq-nav-desktop{display:none}
.bq-only-wide{display:none}
.bq-rail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.bq-rail > *:nth-child(n+7){display:none}
.bq-hero{aspect-ratio:4/5;border-radius:24px;margin:0 14px}
.bq-cats{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px;scrollbar-width:none}
.bq-cats::-webkit-scrollbar,.bq-rail::-webkit-scrollbar,.bq-gallery::-webkit-scrollbar{display:none}
.bq-cat{flex:0 0 auto;width:76px;display:flex;flex-direction:column;align-items:center;gap:8px;background:none;border:0;padding:0;cursor:pointer;color:inherit;scroll-snap-align:start}
.bq-cat .bq-media{width:72px;height:72px;border-radius:999px}
.bq-cat-label{font-size:13px;font-weight:500;text-align:center}
.bq-pdp{display:grid;gap:22px}
.bq-gallery{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:var(--bq-card-radius)}
.bq-gallery > *{flex:0 0 100%;scroll-snap-align:center;aspect-ratio:1/1}
.bq-split{display:grid;gap:0}
.bq-cols-2{display:grid;gap:18px}
.bq-shop-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}
.bq-page{padding-bottom:96px}
@container bq (min-width: 760px){
  .bq-wrap{padding-left:36px;padding-right:36px}
  .bq-nav-desktop{display:flex}
  .bq-only-narrow{display:none !important}
  .bq-only-wide{display:revert}
  .bq-icon-btn.bq-only-wide{display:inline-grid}
  .bq-rail{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:16px;scrollbar-width:none}
  .bq-rail > *{flex:0 0 calc((100% - 48px)/4);scroll-snap-align:start}
  .bq-rail > *:nth-child(n+7){display:block}
  .bq-hero{aspect-ratio:16/7;border-radius:0;margin:0}
  .bq-hero-wrap{padding-top:0}
  .bq-cats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;overflow:visible}
  .bq-cat{width:auto;position:relative;align-items:stretch}
  .bq-cat .bq-media{width:100%;height:auto;aspect-ratio:2/1;border-radius:var(--bq-card-radius)}
  .bq-cat-label{position:absolute;left:14px;bottom:14px;background:#fff;color:#111;padding:7px 13px;border-radius:8px;font-weight:600}
  .bq-pdp{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:36px;align-items:start}
  .bq-pdp-gallery{order:2;position:sticky;top:96px}
  .bq-gallery > *{aspect-ratio:3/2}
  .bq-split{grid-template-columns:1fr 1fr}
  .bq-cols-2{grid-template-columns:1fr 1fr;gap:36px}
  .bq-shop-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:28px 16px}
  .bq-page{padding-bottom:0}
}
@container bq (min-width: 1100px){
  .bq-shop-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media (prefers-reduced-motion: reduce){.bq *{scroll-behavior:auto !important;transition:none !important}}
`;
