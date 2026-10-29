import type React from "react";
import type { BoutiqueButtonShape, BoutiqueFontPair, BoutiquePageWidth, BoutiqueProductRatio, BoutiqueThemeId, StoreEditorSnapshot, ThemeTokenSet } from "@/lib/store-templates";
import type { ShopperNavColors } from "../shopper/ShopperBottomNav";
import { BQ_GROTESK, BQ_MONO, BQ_SANS, BQ_SERIF } from "./fonts.ts";

const SANS = BQ_SANS;
const SERIF = BQ_SERIF;
const GROTESK = BQ_GROTESK;
const MONO = BQ_MONO;

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
  /** Small labels above headlines (Plug, Agbada and Danfo set these in mono). */
  eyebrowFont: string;
  buttonRadius: number;
  cardRadius: number;
  /** Primary button: filled accent (Afẹ́fẹ́), filled ink (Jẹ́jẹ́) or outlined (Dúdú). */
  primaryButton: React.CSSProperties;
  secondaryButton: React.CSSProperties;
  /** Add to bag, subscribe, send: the theme's solid button. */
  solidButton: React.CSSProperties;
  /** Buy now next to add to bag. */
  softButton: React.CSSProperties;
  announcement: React.CSSProperties;
  navStyle: React.CSSProperties;
  /** Placeholder surface for products and banners without a photo yet. */
  placeholder: string;
  dark: boolean;
  /** Text on accent fills (counts, arrows). */
  onAccent: string;
  /** Raised panels: reviews, delivery box, menus. */
  raised: string;
  headerBg: string;
  footerBg: string;
  newsletterBg: string;
  storyBg: string;
  countBg: string;
  heartActive: string;
  tileRatio: string;
  tileBorder: string;
  /** Where the product gallery sits on wide screens. */
  pdp: "right" | "left" | "wide" | "stacked";
  centredHeader: boolean;
  defaultHero: string;
}

type LookOverrides = Omit<BoutiqueLook, "id" | "tokens">;

function baseLook(tokens: ThemeTokenSet): LookOverrides {
  return {
    logoFont: SERIF,
    logoStyle: { fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.01em" },
    headingFont: SANS,
    headingStyle: { fontWeight: 400, letterSpacing: "-0.02em" },
    bodyFont: SANS,
    eyebrowFont: SANS,
    buttonRadius: 10,
    cardRadius: 14,
    primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
    secondaryButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
    solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
    softButton: { background: `${tokens.accent}1A`, color: tokens.ink, border: "1.5px solid transparent" },
    announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5, letterSpacing: "0.02em" },
    navStyle: { fontSize: 14 },
    placeholder: "#EDEFF0",
    dark: false,
    onAccent: "#FFFFFF",
    raised: tokens.cardBg,
    headerBg: "rgba(255,255,255,.96)",
    footerBg: tokens.paperBg,
    newsletterBg: tokens.cardBg,
    storyBg: tokens.cardBg,
    countBg: tokens.accent,
    heartActive: tokens.accent,
    tileRatio: "4 / 5",
    tileBorder: "none",
    pdp: "right",
    centredHeader: false,
    defaultHero: "breeze-banner",
  };
}

function themeLook(id: BoutiqueThemeId, tokens: ThemeTokenSet): LookOverrides {
  const base = baseLook(tokens);
  const hairline = `1px solid ${tokens.border}`;
  switch (id) {
    case "noir":
      return {
        ...base,
        headingFont: SERIF,
        headingStyle: { fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
        logoStyle: { fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: "transparent", color: tokens.heroText, border: `1.5px solid ${tokens.heroText}` },
        secondaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
        softButton: { background: "transparent", color: tokens.heroText, border: `1.5px solid ${tokens.heroText}` },
        announcement: { background: "#000000", color: "#FFFFFF", letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 11.5 },
        navStyle: { textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12.5 },
        placeholder: "#1B1B1B",
        dark: true,
        onAccent: "#0A0A0A",
        raised: "#1B1B1B",
        headerBg: "rgba(10,10,10,.94)",
        footerBg: "#0A0A0A",
        newsletterBg: "#1C1B1A",
        storyBg: "#1C1B1A",
        tileBorder: hairline,
        defaultHero: "noir-center",
      };
    case "plain":
      return {
        ...base,
        logoFont: SANS,
        logoStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 6,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5 },
        placeholder: "#EFEFEF",
        footerBg: "#FFFFFF",
        newsletterBg: "#F2F2F2",
        countBg: tokens.ink,
        heartActive: "#111111",
        tileBorder: hairline,
        centredHeader: true,
        defaultHero: "plain-slides",
      };
    case "adire":
      return {
        ...base,
        logoStyle: { fontStyle: "italic", fontWeight: 500, letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.015em" },
        buttonRadius: 999,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        announcement: { background: tokens.heroBg, color: "#F3ECE5", fontSize: 12.5, letterSpacing: "0.06em" },
        placeholder: "#E4D8CB",
        headerBg: "rgba(243,236,229,.96)",
        newsletterBg: tokens.cardBg,
        storyBg: "#EADFD3",
        tileBorder: hairline,
        tileRatio: "3 / 4",
        pdp: "left",
        defaultHero: "adire-banner",
      };
    case "pantry":
      return {
        ...base,
        logoFont: SANS,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        buttonRadius: 999,
        cardRadius: 20,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: "1.5px solid #FFFFFF" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFF8EA", fontSize: 12.5, fontWeight: 600 },
        placeholder: "#F6E2B8",
        headerBg: "rgba(255,248,234,.96)",
        newsletterBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "1 / 1",
        pdp: "stacked",
        defaultHero: "pantry-split",
      };
    case "ile":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.01em" },
        buttonRadius: 4,
        cardRadius: 6,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.cardBg, color: tokens.ink, fontSize: 12.5, letterSpacing: "0.04em" },
        navStyle: { fontSize: 14, letterSpacing: "0.02em" },
        placeholder: "#DDE4DE",
        headerBg: "rgba(244,246,242,.96)",
        newsletterBg: tokens.cardBg,
        countBg: tokens.ink,
        heartActive: tokens.ink,
        tileRatio: "1 / 1",
        pdp: "left",
        centredHeader: true,
        defaultHero: "ile-calm",
      };
    case "plug":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.02em" },
        eyebrowFont: MONO,
        buttonRadius: 6,
        cardRadius: 8,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: "#000000", color: tokens.ink, fontSize: 12, letterSpacing: "0.04em", fontFamily: MONO },
        placeholder: "#1E222A",
        dark: true,
        raised: tokens.cardBg,
        headerBg: "rgba(11,12,16,.94)",
        footerBg: "#0B0C10",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        tileBorder: hairline,
        tileRatio: "1 / 1",
        defaultHero: "plug-spotlight",
      };
    case "stride":
      return {
        ...base,
        logoFont: SANS,
        logoStyle: { fontWeight: 800, fontStyle: "italic", letterSpacing: "-0.04em", textTransform: "uppercase" },
        headingStyle: { fontWeight: 800, fontStyle: "italic", letterSpacing: "-0.03em", textTransform: "uppercase" },
        buttonRadius: 999,
        cardRadius: 16,
        secondaryButton: { background: tokens.accent, color: "#FFFFFF", border: `1.5px solid ${tokens.accent}` },
        softButton: { background: tokens.accent, color: "#FFFFFF", border: `1.5px solid ${tokens.accent}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" },
        navStyle: { fontSize: 13.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" },
        placeholder: "#F7EDE7",
        newsletterBg: tokens.cardBg,
        tileRatio: "1 / 1",
        pdp: "wide",
        defaultHero: "stride-loud",
      };
    case "ewa":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontStyle: "italic", fontWeight: 500, letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, fontStyle: "italic", letterSpacing: "-0.015em" },
        buttonRadius: 999,
        cardRadius: 18,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5, letterSpacing: "0.04em" },
        placeholder: "#F3DED6",
        headerBg: "rgba(255,248,245,.96)",
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        heartActive: tokens.accent,
        tileRatio: "4 / 5",
        centredHeader: true,
        defaultHero: "ewa-arch",
      };
    case "suku":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.03em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        buttonRadius: 999,
        cardRadius: 20,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: "1.5px solid #FFFFFF" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" },
        navStyle: { fontSize: 13.5, fontWeight: 600, letterSpacing: "0.02em" },
        placeholder: "#EFDCE7",
        tileRatio: "3 / 4",
        pdp: "wide",
        defaultHero: "suku-crown",
      };
    case "asoebi":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        announcement: { background: tokens.heroBg, color: tokens.accent, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" },
        placeholder: "#EADCC8",
        headerBg: "rgba(255,251,243,.96)",
        storyBg: tokens.cardBg,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "3 / 4",
        pdp: "left",
        centredHeader: true,
        defaultHero: "asoebi-collage",
      };
    case "agbada":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 500, letterSpacing: "0.01em" },
        eyebrowFont: MONO,
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase" },
        navStyle: { fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase" },
        placeholder: "#E2DDD2",
        headerBg: "rgba(247,245,240,.96)",
        storyBg: tokens.cardBg,
        countBg: tokens.ink,
        heartActive: tokens.ink,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "3 / 4",
        pdp: "left",
        centredHeader: true,
        defaultHero: "agbada-tailored",
      };
    case "ileke":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 10,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.cardBg, color: tokens.ink, fontSize: 12.5, letterSpacing: "0.06em" },
        placeholder: "#F1E4D3",
        headerBg: "rgba(255,252,247,.96)",
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "4 / 5",
        pdp: "left",
        centredHeader: true,
        defaultHero: "ileke-frame",
      };
    case "ounje":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        buttonRadius: 999,
        cardRadius: 18,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: "1.5px solid #FFFFFF" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFBEB", fontSize: 12.5, fontWeight: 600 },
        placeholder: "#F7E7B4",
        headerBg: "rgba(255,251,235,.96)",
        countBg: tokens.heroBg,
        tileRatio: "4 / 3",
        pdp: "stacked",
        defaultHero: "ounje-menu",
      };
    case "chinchin":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.02em" },
        buttonRadius: 999,
        cardRadius: 24,
        secondaryButton: { background: tokens.accent, color: "#FFFFFF", border: `1.5px solid ${tokens.accent}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.accent, color: "#FFFFFF", fontSize: 12.5, fontWeight: 600 },
        placeholder: "#F7DCCB",
        headerBg: "rgba(255,247,238,.96)",
        countBg: tokens.accent,
        tileRatio: "1 / 1",
        pdp: "stacked",
        centredHeader: true,
        defaultHero: "chinchin-sweet",
      };
    case "oja":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        buttonRadius: 10,
        cardRadius: 12,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: "1.5px solid #FFFFFF" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: "#FFFFFF", fontSize: 12.5, fontWeight: 600 },
        placeholder: "#EEF3EF",
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "oja-market",
      };
    case "omo":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        buttonRadius: 999,
        cardRadius: 24,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: "1.5px solid #FFFFFF" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.accent, color: "#FFFFFF", fontSize: 12.5, fontWeight: 600 },
        placeholder: "#EEF2FA",
        newsletterBg: "#FFF3C4",
        storyBg: "#FFF3C4",
        tileRatio: "1 / 1",
        defaultHero: "omo-play",
      };
    case "iwe":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.015em" },
        buttonRadius: 2,
        cardRadius: 2,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.ink, color: "#F8F4EC", fontSize: 12.5, letterSpacing: "0.04em" },
        placeholder: "#E9E0CE",
        headerBg: "rgba(251,248,242,.96)",
        countBg: tokens.accent,
        heartActive: tokens.accent,
        tileRatio: "2 / 3",
        pdp: "left",
        centredHeader: true,
        defaultHero: "iwe-shelf",
      };
    case "owambe":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontStyle: "italic", fontWeight: 600, letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 600, fontStyle: "italic", letterSpacing: "-0.015em" },
        buttonRadius: 999,
        cardRadius: 18,
        secondaryButton: { background: tokens.heroBg, color: tokens.accent, border: `1.5px solid ${tokens.heroBg}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: tokens.accent, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em" },
        placeholder: "#F1E0EA",
        headerBg: "rgba(255,250,240,.96)",
        countBg: tokens.heroBg,
        heartActive: tokens.heroBg,
        onAccent: tokens.heroBg,
        tileRatio: "1 / 1",
        pdp: "wide",
        centredHeader: true,
        defaultHero: "owambe-party",
      };
    case "danfo":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase" },
        eyebrowFont: MONO,
        buttonRadius: 4,
        cardRadius: 4,
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        announcement: { background: tokens.accent, color: tokens.ink, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" },
        placeholder: "#ECECE7",
        headerBg: "rgba(255,255,255,.97)",
        footerBg: "#FFFFFF",
        countBg: tokens.ink,
        heartActive: tokens.ink,
        onAccent: tokens.ink,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "danfo-garage",
      };
    case "turare":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 12,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        solidButton: { background: tokens.heroBg, color: tokens.heroText, border: `1.5px solid ${tokens.heroBg}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: tokens.accent, fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase" },
        navStyle: { fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase" },
        placeholder: "#EADFD1",
        headerBg: "rgba(251,247,241,.96)",
        storyBg: tokens.cardBg,
        countBg: tokens.heroBg,
        onAccent: tokens.heroBg,
        tileRatio: "3 / 4",
        pdp: "left",
        centredHeader: true,
        defaultHero: "turare-glow",
      };
    case "oko":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.025em" },
        buttonRadius: 999,
        cardRadius: 16,
        secondaryButton: { background: tokens.accent, color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5, fontWeight: 600 },
        placeholder: "#E6E9D2",
        headerBg: "rgba(251,248,239,.96)",
        storyBg: tokens.cardBg,
        countBg: tokens.heroBg,
        tileRatio: "1 / 1",
        pdp: "stacked",
        defaultHero: "oko-field",
      };
    case "aaro":
      return {
        ...base,
        logoFont: SANS,
        logoStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        headingFont: SANS,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.015em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12.5, letterSpacing: "0.04em" },
        navStyle: { fontSize: 14.5, color: tokens.muted },
        placeholder: "#F1F1F1",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.ink,
        heartActive: tokens.ink,
        tileRatio: "3 / 4",
        defaultHero: "aaro-banner",
      };
    case "highlife":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.04em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 800, letterSpacing: "-0.035em" },
        buttonRadius: 999,
        cardRadius: 20,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `2px solid ${tokens.ink}`, boxShadow: `3px 3px 0 ${tokens.ink}` },
        secondaryButton: { background: tokens.paperBg, color: tokens.ink, border: `2px solid ${tokens.ink}` },
        solidButton: { background: tokens.ink, color: tokens.paperBg, border: `2px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `2px solid ${tokens.ink}` },
        announcement: { background: tokens.accent, color: "#FFFFFF", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" },
        navStyle: { fontSize: 14, fontWeight: 700 },
        placeholder: "#E8DCC6",
        headerBg: "rgba(246,239,227,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        // Colour-block story: sunny mustard, still dark enough text on it to read.
        storyBg: "#F6D27A",
        countBg: tokens.accent,
        tileBorder: `2px solid ${tokens.ink}`,
        tileRatio: "4 / 5",
        pdp: "wide",
        defaultHero: "highlife-ticker",
      };
    case "oba":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 300, letterSpacing: "-0.01em" },
        eyebrowFont: SANS,
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1px solid ${tokens.ctaBg}`, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}`, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1px solid ${tokens.ctaBg}`, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.border}`, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 },
        announcement: { background: tokens.cardBg, color: tokens.ink, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase" },
        navStyle: { fontSize: 11.5, letterSpacing: "0.2em", textTransform: "uppercase" },
        placeholder: "#ECE6DC",
        headerBg: "rgba(251,249,246,.97)",
        footerBg: tokens.paperBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.paperBg,
        countBg: tokens.ink,
        heartActive: tokens.accent,
        tileRatio: "2 / 3",
        pdp: "left",
        centredHeader: true,
        defaultHero: "oba-cinema",
      };
    case "gbedu":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 800, letterSpacing: "-0.04em", textTransform: "uppercase" },
        buttonRadius: 999,
        cardRadius: 18,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        solidButton: { background: `linear-gradient(90deg, ${tokens.accent}, #EC4899)`, color: "#FFFFFF", border: "1.5px solid transparent" },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: `linear-gradient(90deg, ${tokens.accent}, #EC4899)`, color: "#FFFFFF", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" },
        placeholder: "#1C1C24",
        dark: true,
        raised: tokens.cardBg,
        headerBg: "rgba(11,11,15,.9)",
        footerBg: "#07070A",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        pdp: "wide",
        defaultHero: "gbedu-impact",
      };
    case "omalicha":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 600, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.03em" },
        buttonRadius: 999,
        cardRadius: 22,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: tokens.ink, fontSize: 12.5, fontWeight: 600 },
        placeholder: "#F3E6EF",
        headerBg: "rgba(255,251,253,.96)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.heroBg,
        storyBg: tokens.paperBg,
        countBg: tokens.accent,
        tileRatio: "4 / 5",
        centredHeader: true,
        defaultHero: "omalicha-card",
      };
    case "zuma":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 600, fontStyle: "italic", letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.015em" },
        buttonRadius: 8,
        cardRadius: 10,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.accent, color: "#FFFFFF", fontSize: 12.5, fontWeight: 600 },
        placeholder: "#EADFCC",
        headerBg: "rgba(251,246,238,.97)",
        footerBg: tokens.heroBg,
        newsletterBg: tokens.heroBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "4 / 5",
        pdp: "left",
        centredHeader: true,
        defaultHero: "zuma-collage",
      };
    case "oku":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, fontStyle: "italic", letterSpacing: "-0.04em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 800, fontStyle: "italic", letterSpacing: "-0.035em", textTransform: "uppercase" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.accent, color: tokens.ink, border: `1.5px solid ${tokens.accent}`, textTransform: "uppercase", fontWeight: 800 },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontWeight: 800 },
        solidButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontWeight: 800 },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontWeight: 800 },
        announcement: { background: tokens.accent, color: tokens.ink, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" },
        placeholder: "#EDEDEA",
        headerBg: "rgba(255,255,255,.97)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.accent,
        storyBg: tokens.cardBg,
        countBg: tokens.ink,
        heartActive: tokens.ink,
        onAccent: tokens.ink,
        tileRatio: "1 / 1",
        pdp: "wide",
        defaultHero: "oku-diagonal",
      };
    case "ihe":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 400, letterSpacing: "0.02em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 300, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.border}` },
        announcement: { background: tokens.paperBg, color: tokens.muted, fontSize: 12, letterSpacing: "0.06em", borderBottom: `1px solid ${tokens.border}` },
        navStyle: { fontSize: 13.5, color: tokens.muted },
        placeholder: "#EFEDE8",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.paperBg,
        countBg: tokens.ink,
        heartActive: tokens.accent,
        tileRatio: "4 / 5",
        pdp: "left",
        defaultHero: "ihe-gallery",
      };
    case "kasuwa":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.025em" },
        buttonRadius: 8,
        cardRadius: 10,
        secondaryButton: { background: tokens.accent, color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        softButton: { background: "#E8EEF8", color: tokens.ctaBg, border: "1.5px solid #E8EEF8" },
        announcement: { background: tokens.accent, color: tokens.ink, fontSize: 12.5, fontWeight: 700 },
        navStyle: { fontSize: 14, fontWeight: 600 },
        placeholder: "#E9EDF4",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: "#E8EEF8",
        storyBg: "#FFFFFF",
        countBg: tokens.accent,
        onAccent: tokens.ink,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "kasuwa-mosaic",
      };
    case "nkata":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 600, letterSpacing: "0.04em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase" },
        placeholder: "#EEEAE3",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "3 / 4",
        centredHeader: true,
        defaultHero: "nkata-frame",
      };
    case "uwa":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 800, fontStyle: "italic", letterSpacing: "-0.03em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.025em" },
        eyebrowFont: MONO,
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        announcement: { background: tokens.accent, color: "#FFFFFF", fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: MONO },
        navStyle: { fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO },
        placeholder: "#E9E3D7",
        headerBg: "rgba(250,247,242,.97)",
        footerBg: tokens.paperBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.paperBg,
        countBg: tokens.accent,
        heartActive: tokens.accent,
        tileBorder: `1px solid ${tokens.ink}`,
        tileRatio: "3 / 4",
        pdp: "left",
        centredHeader: true,
        defaultHero: "uwa-cover",
      };
    case "sarauniya":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1px solid ${tokens.ctaBg}`, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12.5 },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}`, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12.5 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1px solid ${tokens.ctaBg}`, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12.5 },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.border}`, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12.5 },
        announcement: { background: tokens.heroBg, color: tokens.heroText, fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase" },
        navStyle: { fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase" },
        placeholder: "#E7E0D6",
        headerBg: "rgba(247,244,240,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.paperBg,
        countBg: tokens.ink,
        heartActive: tokens.ink,
        tileRatio: "2 / 3",
        pdp: "wide",
        defaultHero: "sarauniya-duo",
      };
    case "zinariya":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "0" },
        buttonRadius: 999,
        cardRadius: 14,
        primaryButton: { background: tokens.accent, color: tokens.heroBg, border: `1px solid ${tokens.accent}`, letterSpacing: "0.08em" },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.accent}` },
        solidButton: { background: tokens.heroBg, color: tokens.heroText, border: `1px solid ${tokens.heroBg}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.accent}` },
        announcement: { background: tokens.heroBg, color: tokens.accent, fontSize: 11.5, letterSpacing: "0.2em", textTransform: "uppercase" },
        navStyle: { fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" },
        placeholder: "#EDE4D1",
        headerBg: "rgba(251,248,241,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.heroBg,
        heartActive: tokens.accent,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "4 / 5",
        pdp: "left",
        centredHeader: true,
        defaultHero: "zinariya-arch",
      };
    case "irawo":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.04em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 800, letterSpacing: "-0.04em" },
        buttonRadius: 999,
        cardRadius: 24,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: tokens.paperBg, fontSize: 12.5, fontWeight: 600 },
        placeholder: "#FBE3D2",
        headerBg: "rgba(255,250,245,.96)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.heroBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "1 / 1",
        pdp: "wide",
        defaultHero: "irawo-product",
      };
    case "asa":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 700, letterSpacing: "0.02em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 6,
        cardRadius: 10,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.accent, color: "#FFF6EA", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#EADCC4",
        headerBg: "rgba(250,244,234,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.heroBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "4 / 5",
        pdp: "stacked",
        centredHeader: true,
        defaultHero: "asa-stamp",
      };
    case "mmiri":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 800, letterSpacing: "-0.035em" },
        buttonRadius: 999,
        cardRadius: 24,
        primaryButton: { background: tokens.accent, color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        solidButton: { background: tokens.heroBg, color: "#FFFFFF", border: `1.5px solid ${tokens.heroBg}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.accent, color: tokens.ink, fontSize: 12.5, fontWeight: 700 },
        navStyle: { fontSize: 14, fontWeight: 600 },
        placeholder: "#D6E7FB",
        headerBg: "rgba(242,248,255,.96)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.accent,
        storyBg: tokens.paperBg,
        countBg: tokens.heroBg,
        tileRatio: "4 / 5",
        pdp: "stacked",
        defaultHero: "mmiri-wave",
      };
    case "uzo":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.03em" },
        eyebrowFont: MONO,
        buttonRadius: 4,
        cardRadius: 6,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.border}` },
        announcement: { background: tokens.accent, color: "#F6F5F1", fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: MONO },
        navStyle: { fontSize: 13, letterSpacing: "0.04em" },
        placeholder: "#E3E0D7",
        headerBg: "rgba(246,245,241,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "3 / 4",
        pdp: "left",
        defaultHero: "uzo-sticky",
      };
    case "rawa":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.04em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 800, letterSpacing: "-0.045em" },
        buttonRadius: 999,
        cardRadius: 26,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
        secondaryButton: { background: tokens.accent, color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.accent, color: tokens.ink, fontSize: 12.5, fontWeight: 800 },
        navStyle: { fontSize: 14, fontWeight: 700 },
        placeholder: "#FFE3EE",
        headerBg: "rgba(255,255,255,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.accent,
        storyBg: tokens.cardBg,
        countBg: tokens.heroBg,
        tileRatio: "4 / 5",
        pdp: "wide",
        defaultHero: "rawa-fan",
      };
    case "fitila":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 12,
        primaryButton: { background: tokens.accent, color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: tokens.accent, fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase" },
        navStyle: { fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase" },
        placeholder: "#ECE3D5",
        headerBg: "rgba(250,247,242,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ink,
        tileRatio: "4 / 5",
        pdp: "left",
        centredHeader: true,
        defaultHero: "fitila-room",
      };
    case "oso":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 600, letterSpacing: "0.02em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.02em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.border}` },
        announcement: { background: tokens.accent, color: "#FFFFFF", fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase" },
        navStyle: { fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase" },
        placeholder: "#EEE8E0",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        heartActive: tokens.accent,
        tileRatio: "2 / 3",
        pdp: "left",
        centredHeader: true,
        defaultHero: "oso-bento",
      };
    case "shakara":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.05em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 800, letterSpacing: "-0.05em", textTransform: "uppercase" },
        eyebrowFont: MONO,
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.accent, color: tokens.ink, border: `2px solid ${tokens.ink}`, textTransform: "uppercase", fontWeight: 800 },
        secondaryButton: { background: tokens.ink, color: tokens.paperBg, border: `2px solid ${tokens.ink}`, textTransform: "uppercase", fontWeight: 800 },
        solidButton: { background: tokens.ink, color: tokens.paperBg, border: `2px solid ${tokens.ink}`, textTransform: "uppercase", fontWeight: 800 },
        softButton: { background: "transparent", color: tokens.ink, border: `2px solid ${tokens.ink}`, textTransform: "uppercase", fontWeight: 800 },
        announcement: { background: tokens.accent, color: tokens.ink, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO },
        navStyle: { fontSize: 13, fontWeight: 800, textTransform: "uppercase" },
        placeholder: "#DCDCD4",
        headerBg: "rgba(241,241,236,.97)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.accent,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ink,
        heartActive: tokens.accent,
        tileBorder: `2px solid ${tokens.ink}`,
        tileRatio: "4 / 5",
        pdp: "wide",
        defaultHero: "shakara-poster",
      };
    case "aga":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.02em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13 },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12, letterSpacing: "0.06em" },
        navStyle: { fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase" },
        placeholder: "#F0F2F5",
        headerBg: "#F5F7FA",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "1 / 1",
        defaultHero: "aga-masonry",
      };
    case "itura":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.025em" },
        buttonRadius: 999,
        cardRadius: 16,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        softButton: { background: tokens.heroBg, color: tokens.ink, border: `1.5px solid ${tokens.heroBg}` },
        announcement: { background: tokens.heroBg, color: tokens.ink, fontSize: 12.5, fontWeight: 600 },
        placeholder: "#F3F8F9",
        headerBg: "rgba(255,255,255,.97)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.heroBg,
        storyBg: tokens.heroBg,
        raised: tokens.heroBg,
        countBg: tokens.accent,
        tileRatio: "1 / 1",
        defaultHero: "itura-cutout",
      };
    case "gele":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 600, fontStyle: "italic", letterSpacing: "-0.02em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.heroBg,
        countBg: tokens.accent,
        heartActive: tokens.accent,
        tileRatio: "3 / 4",
        pdp: "left",
        defaultHero: "gele-mosaic",
      };
    case "imani":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em", textTransform: "uppercase" },
        buttonRadius: 2,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `2px solid ${tokens.ink}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: "#FFFFFF", fontSize: 12, letterSpacing: "0.02em" },
        navStyle: { fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" },
        placeholder: "#F0F0F0",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        raised: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "4 / 5",
        defaultHero: "imani-split",
      };
    case "itanna":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.035em" },
        buttonRadius: 14,
        cardRadius: 20,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: `1px solid ${tokens.border}` },
        softButton: { background: tokens.heroBg, color: tokens.ink, border: `1px solid ${tokens.heroBg}` },
        announcement: { background: tokens.heroBg, color: tokens.ink, fontSize: 12.5, fontWeight: 600 },
        placeholder: "#F4F4F5",
        headerBg: "rgba(255,255,255,.96)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.heroBg,
        storyBg: tokens.heroBg,
        countBg: tokens.accent,
        onAccent: tokens.ink,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "itanna-centered",
      };
    case "littafi":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        buttonRadius: 999,
        cardRadius: 14,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: `1px solid ${tokens.border}` },
        softButton: { background: tokens.heroBg, color: tokens.ink, border: `1px solid ${tokens.heroBg}` },
        announcement: { background: "#FFFFFF", color: tokens.ink, fontSize: 12.5, borderBottom: `1px solid ${tokens.border}` },
        placeholder: "#F5F1F4",
        headerBg: "rgba(255,255,255,.97)",
        footerBg: "#FFFFFF",
        newsletterBg: "linear-gradient(120deg, #FCE7EF, #DDF3F1)",
        storyBg: "linear-gradient(120deg, #DDF3F1, #FCE7EF)",
        raised: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "3 / 4",
        defaultHero: "littafi-gradient",
      };
    case "itan":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 400, letterSpacing: "0.04em", textTransform: "uppercase" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.005em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: "transparent", color: tokens.accent, border: `1px solid ${tokens.accent}`, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12.5 },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.ink}`, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12.5 },
        solidButton: { background: tokens.ink, color: tokens.paperBg, border: `1px solid ${tokens.ink}`, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12.5 },
        softButton: { background: "transparent", color: tokens.ink, border: `1px solid ${tokens.border}` },
        announcement: { background: tokens.paperBg, color: tokens.muted, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${tokens.border}` },
        navStyle: { fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase" },
        placeholder: "#E6E3D9",
        headerBg: "rgba(243,242,236,.97)",
        footerBg: tokens.paperBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.paperBg,
        raised: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "2 / 3",
        pdp: "left",
        centredHeader: true,
        defaultHero: "itan-cover",
      };
    case "awo":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.02em" },
        buttonRadius: 2,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#B5AEC4", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, fontWeight: 600, textTransform: "uppercase" },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "awo-banner",
      };
    case "kyau":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 0,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: `1px solid ${tokens.border}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#B2B2B2", fontSize: 12 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.paperBg,
        countBg: tokens.accent,
        tileRatio: "3 / 4",
        defaultHero: "kyau-season",
      };
    case "ahia":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 4,
        cardRadius: 6,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 13, fontWeight: 700 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 13, fontWeight: 700 },
        secondaryButton: { background: tokens.heroBg, color: tokens.ink, border: `1.5px solid ${tokens.heroBg}`, fontWeight: 700 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F3F3F3",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.heroBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileRatio: "1 / 1",
        defaultHero: "ahia-yellow",
      };
    case "ado":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase" },
        navStyle: { fontSize: 13, fontWeight: 600, textTransform: "uppercase" },
        placeholder: "#F1F1F1",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "ado-model",
      };
    case "wuta":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em", color: tokens.accent },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 12,
        softButton: { background: `${tokens.accent}1F`, color: tokens.ink, border: "1.5px solid transparent" },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        announcement: { background: tokens.cardBg, color: tokens.ink, fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 600 },
        placeholder: "#F3F3F3",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: `${tokens.accent}1F`,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "wuta-deal",
      };
    case "ike":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em", textTransform: "uppercase" },
        buttonRadius: 999,
        cardRadius: 4,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 13, fontWeight: 700 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 13, fontWeight: 700 },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontSize: 13, fontWeight: 700 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: "#1E1F29", color: "#FFFFFF", fontSize: 12 },
        navStyle: { fontSize: 14, fontWeight: 600 },
        placeholder: "#F3F4F6",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.heroBg,
        countBg: tokens.accent,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "ike-deal",
      };
    case "ewu":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, fontWeight: 600 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, fontWeight: 600 },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.cardBg, color: tokens.ink, fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F4F6FD",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "3 / 4",
        defaultHero: "ewu-menu",
      };
    case "erin":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 13.5, fontWeight: 600, textTransform: "uppercase" },
        placeholder: "#F5F5F5",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: "#DCD8D8",
        storyBg: "#DCD8D8",
        countBg: tokens.accent,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "erin-split",
      };
    case "apere":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 8,
        cardRadius: 14,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: tokens.ink, fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F7F7F7",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.heroBg,
        storyBg: tokens.heroBg,
        countBg: tokens.accent,
        onAccent: "#222222",
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "apere-trio",
      };
    case "bata":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 600, letterSpacing: "0.01em" },
        buttonRadius: 999,
        cardRadius: 0,
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        announcement: { background: "#88C8BC", color: "#123B34", fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase" },
        navStyle: { fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: "#FFFFFF",
        countBg: tokens.accent,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "bata-full",
      };
    case "ogba":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: "#000000", color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 13.5, fontWeight: 700, textTransform: "uppercase" },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "ogba-slides",
      };
    case "eso":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em", color: "#3F7A05" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 14,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        softButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        announcement: { background: "#3F7A05", color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 600 },
        placeholder: "#F4F6F8",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.heroBg,
        newsletterBg: tokens.heroBg,
        storyBg: "#FFB524",
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: "1px solid #FFB524",
        tileRatio: "4 / 3",
        defaultHero: "eso-search",
      };
    case "osan":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em", color: tokens.accent },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 8,
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.heroBg, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 600 },
        placeholder: "#F5F5F5",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "osan-center",
      };
    case "ijokoo":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F6F7FB",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "ijokoo-cutout",
      };
    case "ite":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.02em" },
        buttonRadius: 999,
        cardRadius: 12,
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#E4EBEA",
        headerBg: "rgba(239,242,241,.97)",
        footerBg: "#FFFFFF",
        newsletterBg: "#FFFFFF",
        storyBg: tokens.cardBg,
        raised: "#FFFFFF",
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: "none",
        tileRatio: "1 / 1",
        dark: false,
        defaultHero: "ite-green",
      };
    case "kujera":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: tokens.cardBg,
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.heroBg,
        newsletterBg: tokens.heroBg,
        storyBg: "#FFFFFF",
        countBg: tokens.accent,
        tileBorder: "none",
        tileRatio: "4 / 5",
        defaultHero: "kujera-slides",
      };
    case "tufafi":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 13.5, fontWeight: 600 },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.ink,
        heartActive: "#B91C1C",
        tileBorder: "none",
        tileRatio: "4 / 5",
        defaultHero: "tufafi-mosaic",
      };
    case "rewa":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12 },
        navStyle: { fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: "none",
        tileRatio: "3 / 4",
        centredHeader: true,
        defaultHero: "rewa-trends",
      };
    case "igbese":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 10,
        primaryButton: { background: `linear-gradient(90deg, #FFB300, ${tokens.accent})`, color: tokens.ctaText, border: "1.5px solid transparent", fontWeight: 700 },
        solidButton: { background: `linear-gradient(90deg, #FFB300, ${tokens.accent})`, color: tokens.ctaText, border: "1.5px solid transparent", fontWeight: 700 },
        secondaryButton: { background: tokens.ink, color: "#FFFFFF", border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 13, fontWeight: 600, textTransform: "uppercase" },
        placeholder: "#E7E9F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "igbese-stripes",
      };
    case "ola":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 600, letterSpacing: "0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "#FFFFFF", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#E9E9E9",
        headerBg: "rgba(244,244,244,.97)",
        footerBg: "#FFFFFF",
        newsletterBg: "#FFFFFF",
        storyBg: "#FFFFFF",
        raised: "#FFFFFF",
        countBg: tokens.ink,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "ola-duo",
      };
    case "okunrin":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12 },
        navStyle: { fontSize: 14.5, fontWeight: 600 },
        placeholder: "#F3F2EE",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "okunrin-circle",
      };
    case "salubata":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "0.02em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: "#111111", color: "#FFFFFF", fontSize: 12 },
        navStyle: { fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },
        placeholder: "#F3F3F3",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.heroBg,
        countBg: tokens.ink,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "salubata-cutout",
      };
    case "efo":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 600, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 6,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.accent}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.accent, color: tokens.ctaText, fontSize: 12.5 },
        navStyle: { fontSize: 13, fontWeight: 600, textTransform: "uppercase" },
        placeholder: "#F5F5F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "1 / 1",
        defaultHero: "efo-full",
      };
    case "aluko":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 0,
        secondaryButton: { background: "#B9C6D2", color: "#FFFFFF", border: "1.5px solid #B9C6D2", textTransform: "uppercase", fontSize: 12, letterSpacing: "0.1em" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: "#C9D4DE", color: "#FFFFFF", fontSize: 12 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F1F4F7",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: "#FFFFFF",
        countBg: tokens.ink,
        tileBorder: "none",
        tileRatio: "3 / 4",
        defaultHero: "aluko-lookbook",
      };
    case "aja":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 400, letterSpacing: "-0.01em" },
        buttonRadius: 4,
        cardRadius: 12,
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}` },
        softButton: { background: "#FFFFFF", color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.cardBg, color: tokens.ink, fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F3EEE8",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: "none",
        tileRatio: "1 / 1",
        defaultHero: "aja-circle",
      };
    case "dara":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 500, letterSpacing: "-0.01em" },
        buttonRadius: 999,
        cardRadius: 4,
        secondaryButton: { background: "#FFFFFF", color: tokens.ink, border: "1.5px solid #FFFFFF" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12 },
        navStyle: { fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },
        placeholder: "#F3F4F6",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ctaText,
        tileBorder: "none",
        tileRatio: "3 / 4",
        defaultHero: "dara-split",
      };
    case "ife":
      return {
        ...base,
        logoFont: SERIF,
        logoStyle: { fontWeight: 400, letterSpacing: "0.01em" },
        headingFont: SERIF,
        headingStyle: { fontWeight: 400, letterSpacing: "0.02em", textTransform: "uppercase" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.accent, color: "#FFFFFF", border: `1.5px solid ${tokens.accent}`, textTransform: "uppercase", fontSize: 12, letterSpacing: "0.12em" },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12, letterSpacing: "0.12em" },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontSize: 12, letterSpacing: "0.12em" },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: tokens.ink, color: "#FFFFFF", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" },
        navStyle: { fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.14em" },
        placeholder: "#F2EEEB",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.accent,
        tileBorder: "none",
        tileRatio: "4 / 5",
        centredHeader: true,
        defaultHero: "ife-split",
      };
    case "irorun":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        buttonRadius: 0,
        cardRadius: 0,
        primaryButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em" },
        solidButton: { background: tokens.ctaBg, color: tokens.ctaText, border: `1.5px solid ${tokens.ctaBg}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em" },
        secondaryButton: { background: "transparent", color: tokens.ink, border: `1.5px solid ${tokens.ink}`, textTransform: "uppercase", fontSize: 12.5, fontWeight: 700 },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.border}` },
        announcement: { background: "#F5F5F5", color: tokens.muted, fontSize: 12 },
        navStyle: { fontSize: 14, fontWeight: 500 },
        placeholder: "#F2F2F2",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: "#FFFFFF",
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        countBg: tokens.ink,
        tileBorder: `1px solid ${tokens.border}`,
        tileRatio: "4 / 5",
        defaultHero: "irorun-bold",
      };
    case "keke":
      return {
        ...base,
        logoFont: GROTESK,
        logoStyle: { fontWeight: 800, letterSpacing: "-0.03em" },
        headingFont: GROTESK,
        headingStyle: { fontWeight: 700, letterSpacing: "-0.02em" },
        buttonRadius: 0,
        cardRadius: 0,
        secondaryButton: { background: tokens.heroBg, color: "#FFFFFF", border: `1.5px solid ${tokens.heroBg}` },
        solidButton: { background: tokens.heroBg, color: "#FFFFFF", border: `1.5px solid ${tokens.heroBg}` },
        softButton: { background: tokens.cardBg, color: tokens.ink, border: `1.5px solid ${tokens.cardBg}` },
        announcement: { background: tokens.heroBg, color: "#FFFFFF", fontSize: 12.5 },
        navStyle: { fontSize: 14, fontWeight: 600 },
        placeholder: "#EEF2F3",
        headerBg: "rgba(255,255,255,.98)",
        footerBg: tokens.cardBg,
        newsletterBg: tokens.cardBg,
        storyBg: tokens.cardBg,
        raised: tokens.cardBg,
        countBg: tokens.accent,
        onAccent: tokens.ink,
        tileRatio: "4 / 3",
        pdp: "wide",
        defaultHero: "keke-slant",
      };
    default:
      return base;
  }
}

export function boutiqueLook(id: BoutiqueThemeId, tokens: ThemeTokenSet): BoutiqueLook {
  return applyLookChoices({ id, tokens, ...themeLook(id, tokens) });
}

/** Font pairings a seller can pick in Theme settings › Typography: [headings, body]. All four faces ship with every theme. */
export const FONT_PAIRS: Record<Exclude<BoutiqueFontPair, "theme">, [string, string]> = {
  classic: [SERIF, SANS],
  modern: [GROTESK, SANS],
  clean: [SANS, SANS],
  bold: [GROTESK, GROTESK],
};

/** Button corner radius for each shape in Theme settings › Buttons. */
export const BUTTON_RADII: Record<Exclude<BoutiqueButtonShape, "theme">, number> = { square: 0, rounded: 10, pill: 999 };

/** Product photo shapes in Theme settings › Layout. */
export const PRODUCT_RATIOS: Record<Exclude<BoutiqueProductRatio, "theme">, string> = { portrait: "4 / 5", square: "1 / 1", landscape: "4 / 3" };

/** Page widths in Theme settings › Layout (the theme's own is "standard"). */
export const PAGE_WIDTHS: Record<BoutiquePageWidth, number> = { narrow: 1120, standard: 1320, wide: 1560 };

/** The seller's own picks on top of the theme's look; anything left on "theme" (or not set) keeps the theme's own. */
export function applyLookChoices(look: BoutiqueLook): BoutiqueLook {
  const { fontPair, buttonShape, productRatio } = look.tokens;
  const next = { ...look };
  if (fontPair && fontPair !== "theme" && FONT_PAIRS[fontPair]) {
    [next.headingFont, next.bodyFont] = FONT_PAIRS[fontPair];
    // Headings keep the theme's weight and spacing, so the pairing changes the face, not the layout.
    if (look.logoFont === look.headingFont) next.logoFont = next.headingFont;
  }
  if (buttonShape && buttonShape !== "theme" && buttonShape in BUTTON_RADII) next.buttonRadius = BUTTON_RADII[buttonShape];
  if (productRatio && productRatio !== "theme" && PRODUCT_RATIOS[productRatio]) next.tileRatio = PRODUCT_RATIOS[productRatio];
  return next;
}

const PDP_BY_LAYOUT: Record<string, BoutiqueLook["pdp"]> = {
  "boutique-gallery": "right",
  "spec-sheet": "right",
  "editorial-gallery": "left",
  "wide-gallery": "wide",
  stacked: "stacked",
};

/** Product page layout: the snapshot's product-detail section setting, else the theme's own. */
export function pdpLayout(look: BoutiqueLook, snapshot: StoreEditorSnapshot): BoutiqueLook["pdp"] {
  const page = snapshot.pages.find((entry) => entry.pageType === "product");
  const layout = page?.sections.find((entry) => entry.kind === "product-detail")?.settings?.layout;
  return (typeof layout === "string" && PDP_BY_LAYOUT[layout]) || look.pdp;
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
    "--bq-wrap": `${PAGE_WIDTHS[t.pageWidth ?? "standard"] ?? PAGE_WIDTHS.standard}px`,
    background: t.paperBg,
    color: t.ink,
    fontFamily: look.bodyFont,
  } as React.CSSProperties;
}

export function navColors(look: BoutiqueLook): Partial<ShopperNavColors> {
  const t = look.tokens;
  if (look.dark) {
    return { bar: look.raised === "#1B1B1B" ? "#1E1E1E" : look.raised, barText: t.ink, active: t.accent, activeText: look.onAccent, badge: t.accent, badgeText: look.onAccent, sheet: look.id === "noir" ? "#161616" : t.paperBg, ink: t.ink, muted: t.muted, border: t.border };
  }
  const inkActive = look.id === "breeze" || look.id === "stride";
  return { bar: "#FFFFFF", barText: t.ink, active: inkActive ? t.ink : t.ctaBg, activeText: inkActive ? "#FFFFFF" : t.ctaText, badge: look.countBg, badgeText: "#FFFFFF", sheet: "#FFFFFF", ink: t.ink, muted: t.muted, border: t.border };
}

/** Scoped CSS for the 2026 themes. Container queries, so editor phone previews lay out like real phones. */
export const BOUTIQUE_CSS = `
/* width:100% — a size container has no intrinsic width, so inside a flex row or any shrink-to-fit parent it would collapse. */
.bq{container-type:inline-size;container-name:bq;width:100%;min-width:0;flex:1 1 auto;min-height:100%;-webkit-font-smoothing:antialiased;overflow-x:clip}
.bq-burger{display:inline-grid;margin-left:-8px}
/* The floating phone bar (ShopperBottomNav, phones only) never covers the footer's last row ("Built with Shopinbos"). */
@media (max-width: 767px){
  .bq[data-floating-nav] .bq-footer{padding-bottom:calc(88px + env(safe-area-inset-bottom))}
  .bq[data-floating-nav]:has(.bq-footer) .bq-page{padding-bottom:24px}
}
.bq *{box-sizing:border-box}
.bq a{color:inherit;text-decoration:none}
.bq :where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--bq-accent);outline-offset:3px}
.bq-wrap{width:100%;max-width:var(--bq-wrap,1320px);margin:0 auto;padding-left:16px;padding-right:16px}
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
.bq-rail:not([data-limit]) > *:nth-child(n+7){display:none}
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
/* Section rhythm. Many contained sections pad only their top and lean on the next section's top padding for the gap.
   A section with its own background (a split story, a countdown, a tinted product rail) has none, so it gets one, and the
   last section on a page closes its own bottom. */
.bq-sec:has(> section.bq-wrap:not([class*="py-"]):not([class*="pb-"])) + .bq-sec > :first-child:is(:not(.bq-wrap),[style*="background"]){margin-top:40px}
.bq-sec:last-child > section.bq-wrap:not([class*="py-"]):not([class*="pb-"]){padding-bottom:40px}
@container bq (min-width: 760px){
  .bq-wrap{padding-left:36px;padding-right:36px}
  .bq-sec:has(> section.bq-wrap:not([class*="py-"]):not([class*="pb-"])) + .bq-sec > :first-child:is(:not(.bq-wrap),[style*="background"]){margin-top:56px}
  .bq-sec:last-child > section.bq-wrap:not([class*="py-"]):not([class*="pb-"]){padding-bottom:56px}
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
.bq-split-hero{display:grid}
.bq-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}
.bq-chips::-webkit-scrollbar{display:none}
.bq-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}
.bq-tiles:not([data-limit]) > *:nth-child(n+7){display:none}
@container bq (min-width: 760px){
  .bq-split-hero{grid-template-columns:1.05fr 1fr;min-height:520px}
  .bq-tiles{grid-template-columns:repeat(4,minmax(0,1fr));gap:28px 18px}
  .bq-tiles > *:nth-child(n+7){display:block}
  .bq-tiles:not([data-limit]) > *:nth-child(n+9){display:none}
  .bq[data-pdp="left"] .bq-pdp{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}
  .bq[data-pdp="left"] .bq-pdp-gallery{order:0}
  .bq[data-pdp="wide"] .bq-pdp{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)}
  .bq[data-pdp="wide"] .bq-pdp-gallery{order:0}
  .bq[data-pdp="stacked"] .bq-pdp{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .bq[data-pdp="stacked"] .bq-pdp-gallery{order:0;position:static}
  .bq[data-pdp="stacked"] .bq-gallery > *{aspect-ratio:1/1}
  .bq[data-pdp="left"] .bq-gallery > *{aspect-ratio:4/5}
}
/* Dense catalogue (Ọjà, Danfo): 2 across on phones, 6 on desktop, up to 12 tiles. */
.bq-dense{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 10px}
.bq-dense:not([data-limit]) > *:nth-child(n+9){display:none}
/* Menu list (Oúnjẹ): photo, dish, what's in it, price. */
.bq-menu{display:grid;gap:12px}
.bq-menu-item{display:grid;grid-template-columns:88px minmax(0,1fr);gap:14px;align-items:center;padding:12px;border-radius:var(--bq-card-radius);background:var(--bq-card);text-align:left;width:100%;border:0;color:inherit;cursor:pointer}
.bq-menu-item .bq-media{width:88px;height:88px;border-radius:calc(var(--bq-card-radius) - 4px)}
.bq-collage{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bq-collage > :first-child{grid-row:span 2}
.bq-shelf{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:end}
.bq-shelf > *:nth-child(n+4){display:none}
@container bq (min-width: 760px){
  .bq-dense{grid-template-columns:repeat(6,minmax(0,1fr));gap:22px 14px}
  .bq-dense > *:nth-child(n+9){display:block}
  .bq-dense:not([data-limit]) > *:nth-child(n+13){display:none}
  .bq-menu{grid-template-columns:1fr 1fr;gap:14px}
  .bq-menu-item{grid-template-columns:112px minmax(0,1fr)}
  .bq-menu-item .bq-media{width:112px;height:112px}
  .bq-shelf{grid-template-columns:repeat(4,minmax(0,1fr))}
  .bq-shelf > *:nth-child(n+4){display:block}
}
/* Shop page layouts: columns, list rows, large cards, side filters; product card extras. */
.bq-shop-grid[data-view="large"]{grid-template-columns:minmax(0,1fr);gap:28px}
.bq-shop-list{display:grid;gap:12px}
.bq-shop-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:center;padding:12px;border-radius:var(--bq-card-radius);border:1px solid var(--bq-border);background:transparent;color:inherit;text-align:left;width:100%;cursor:pointer}
.bq-shop-row .bq-media{width:96px;height:96px;border-radius:calc(var(--bq-card-radius) - 4px)}
.bq-shop-row-side{display:none}
.bq-shop-layout{display:grid;gap:20px}
.bq-tile-alt{opacity:0;transition:opacity .25s}
.bq-tile:hover .bq-tile-alt,.bq-tile:focus-within .bq-tile-alt{opacity:1}
@container bq (min-width: 760px){
  .bq-shop-grid[data-cols="2"],.bq-shop-grid[data-view="large"]{grid-template-columns:repeat(2,minmax(0,1fr));gap:40px 24px}
  .bq-shop-grid[data-cols="3"]{grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 20px}
  .bq-shop-grid[data-cols="5"]{grid-template-columns:repeat(4,minmax(0,1fr))}
  .bq-shop-row{grid-template-columns:140px minmax(0,1fr) auto;gap:20px;padding:14px}
  .bq-shop-row .bq-media{width:140px;height:140px}
  .bq-shop-row-side{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
  .bq-shop-layout{grid-template-columns:220px minmax(0,1fr);gap:36px;align-items:start}
  .bq-shop-aside{position:sticky;top:88px}
  .bq-cats[data-shape="circles"]{display:flex;flex-wrap:wrap;gap:24px}
  .bq-cats[data-shape="circles"] .bq-cat{width:124px;position:static;align-items:center}
  .bq-cats[data-shape="circles"] .bq-cat .bq-media{width:112px;height:112px;aspect-ratio:auto;border-radius:999px}
  .bq-cats[data-shape="circles"] .bq-cat-label{position:static;background:none;color:inherit;padding:0;font-weight:500}
}
@container bq (min-width: 1100px){
  .bq-shop-grid[data-cols="5"]{grid-template-columns:repeat(5,minmax(0,1fr))}
}
/* Sidebar header (Àga): a sticky column on the left on wide screens; phones keep the top bar. */
.bq-sidebar{display:none}
.bq-shell,.bq-shell-side,.bq-shell-main{display:contents}
@container bq (min-width: 1000px){
  .bq-shell{display:grid !important;grid-template-columns:260px minmax(0,1fr);align-items:stretch}
  .bq-shell-side{display:block !important;border-right:1px solid var(--bq-border)}
  .bq-shell-main{display:block !important;min-width:0}
  .bq-sidebar{display:block;position:sticky;top:0;height:100vh}
  .bq-sidebar-top{display:none !important}
}
/* Ticker ribbons (Highlife, Gbẹ̀du): two copies of the words slide left forever; still when motion is reduced. */
.bq-ticker{overflow:hidden;white-space:nowrap}
.bq-ticker-track{display:inline-flex;animation:bq-ticker 28s linear infinite}
.bq-ticker-track > *{flex:0 0 auto}
@keyframes bq-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion: reduce){.bq *{scroll-behavior:auto !important;transition:none !important}.bq-ticker-track{animation:none}}
`;
