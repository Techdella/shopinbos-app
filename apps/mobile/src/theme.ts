import { Platform, type ViewStyle } from "react-native";
import { colors as lightColors, darkColors, radii, type Palette } from "@shared/tokens";
import { applyPalette, createThemed, type Scheme } from "@/lib/appearance-pure";

export { radii, lightColors, darkColors };
export type { Palette };

/**
 * The app's colours: ONE live object holding the light or the dark palette (Settings > Appearance, lib/appearance.tsx).
 * Screens read `colors.x` while they draw, so switching the scheme swaps the values in place and redraws the app.
 * A value read once at the top of a file (a table of tones) keeps the old scheme: wrap it in `themed(() => …)`.
 * Don't keep these in StyleSheet.create (also built once).
 */
export const colors: Palette = { ...lightColors };

let scheme: Scheme = "light";
let version = 0;

/** The scheme drawn now. Components follow it through `useScheme()` (lib/appearance.tsx). */
export function currentScheme(): Scheme {
  return scheme;
}

/** Swaps the live `colors` to a scheme. Called by the AppearanceProvider before it redraws the app. */
export function setColorScheme(next: Scheme) {
  if (next === scheme) return;
  scheme = next;
  applyPalette(colors, next === "dark" ? darkColors : lightColors);
  version += 1;
}

/** A table built from `colors` at the top of a file that follows the scheme (built again after a switch). */
export const themed = createThemed(() => version);

/** How round the soft cards are (lists, cards, stat cards): one size so every surface in the app matches. */
export const CARD_RADIUS = 24;

/**
 * The soft lift under a card: a faint navy shadow on the light canvas (no hard border); in dark mode a shadow can't
 * be seen on navy, so a hairline in `line` draws the edge instead. The 1px border is there in both, so a card is the
 * same size in either scheme. Read while drawing (it follows the live scheme), not kept in StyleSheet.create.
 */
export function softShadow(): ViewStyle {
  return scheme === "dark"
    ? { borderWidth: 1, borderColor: colors.line }
    : { borderWidth: 1, borderColor: "rgba(14,42,56,0.05)", boxShadow: "0px 1px 2px rgba(14,42,56,0.04), 0px 8px 22px rgba(14,42,56,0.06)" };
}

/** A white (surface) card on the canvas: radius 24, the soft lift. Spread it into a style: `{ ...surfaceCard(), padding: 18 }`. */
export function surfaceCard(radius: number = CARD_RADIUS): ViewStyle {
  return { backgroundColor: colors.surface, borderRadius: radius, ...softShadow() };
}

// Plus Jakarta Sans ships one file per weight; Android ignores fontWeight for custom fonts, so pick the family.
export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
  /** Bricolage Grotesque: big titles, headings and numbers (the 2026 "Simple app, end to end" prototype). */
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  /** The system monospace face: codes people copy letter by letter (DNS records), where "x" must not read as "×". */
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }),
} as const;
