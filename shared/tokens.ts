// Shopinbos app design tokens, shared by the web app (Tailwind @theme in globals.css) and the Expo app.
// Source: the 2026 app prototypes (seller onboarding, sign up, seller app).
// Keep globals.css `--color-app-*` values in sync when changing anything here.

export const colors = {
  ink: "#16141F",
  inkSoft: "#6B6779",
  inkFaint: "#9C98A8",
  line: "#ECEAF2",
  lineStrong: "#C9C6D3",
  track: "#E4E1EC",
  toggleOff: "#D6D3E0",
  canvas: "#F6F5F9",
  surface: "#FFFFFF",
  accent: "#FF6A2B",
  accentInk: "#B23E0A",
  success: "#16794A",
  successTint: "#E2F5EA",
  forest: "#0C4A44",
  peach: "#FFEDE4",
  mintTint: "#E2F6F1",
  lilac: "#ECEAF2",
  danger: "#B42318",
  dangerTint: "#FDECEA",
  whatsapp: "#25D366",
  // Pills and icon tiles from the "Simple app, end to end" prototype.
  warnTint: "#FDF0D5",
  warnInk: "#8A5A08",
  grayTint: "#F0EEF5",
  grayInk: "#4A4757",
  blueTint: "#E3EEFD",
  blueInk: "#1F5FBF",
  grab: "#E6E3EE",
  // Fills that carry white text (buttons, selected chips, dark cards). Same as the ink/forest/success/danger text
  // colours in light mode; in dark mode those text colours turn light and these stay deep enough for white text.
  inkFill: "#16141F",
  forestFill: "#0C4A44",
  successFill: "#16794A",
  dangerFill: "#B42318",
  /** Text and icons on an orange (accent) fill: white on orange fails contrast. */
  onAccent: "#16141F",
  /** The dimmed backdrop behind a sheet or dialog. */
  scrim: "rgba(22,20,31,0.38)",
} as const;

export type Palette = { [K in keyof typeof colors]: string };

/**
 * The phone app's dark palette (Settings > Appearance): the brand navy (#0E2A38) family for surfaces, cream text,
 * mint and teal accents. Same keys as `colors`; every text colour meets WCAG AA (4.5:1) on `surface` and `canvas`,
 * and white meets it on every fill (tests/mobile-appearance.test.mjs). The web app has no dark mode.
 */
export const darkColors: Palette = {
  ink: "#F4F1EA",
  inkSoft: "#AFBEC6",
  inkFaint: "#8A9CA6",
  line: "#21404F",
  lineStrong: "#3E5E6E",
  track: "#24434F",
  toggleOff: "#45636F",
  canvas: "#071A23",
  surface: "#0E2A38",
  accent: "#FF6A2B",
  accentInk: "#FFA97F",
  success: "#5DD39C",
  successTint: "#103A2D",
  forest: "#8BE0D1",
  peach: "#3C2519",
  mintTint: "#0F3B3B",
  lilac: "#1E3746",
  danger: "#FF9285",
  dangerTint: "#401D1B",
  whatsapp: "#25D366",
  warnTint: "#3A2E12",
  warnInk: "#F4C46C",
  grayTint: "#183745",
  grayInk: "#C4D0D6",
  blueTint: "#153150",
  blueInk: "#9CC2F8",
  grab: "#3E5E6E",
  inkFill: "#2B7670",
  forestFill: "#0F5C54",
  successFill: "#16794A",
  dangerFill: "#B42318",
  onAccent: "#16141F",
  scrim: "rgba(0,0,0,0.6)",
};

/** Soft pastel wash used behind the welcome and "shop is live" screens. */
export const washStops = {
  peach: "#FFE2D2",
  lilac: "#E7E1FF",
  mint: "#DDF4EE",
} as const;

/** The same wash for the phone app's dark mode: deep tints of the three, on the navy canvas. */
export const darkWashStops = {
  peach: "#3A2014",
  lilac: "#232048",
  mint: "#0B3D38",
} as const;

export const webWash = [
  `radial-gradient(120% 80% at 0% 0%, ${washStops.peach} 0%, rgba(255,226,210,0) 55%)`,
  `radial-gradient(90% 70% at 100% 0%, ${washStops.lilac} 0%, rgba(231,225,255,0) 60%)`,
  `radial-gradient(80% 60% at 60% 40%, ${washStops.mint} 0%, rgba(221,244,238,0) 70%)`,
  colors.canvas,
].join(", ");

export const radii = {
  field: 16,
  card: 20,
  sheet: 28,
  pill: 999,
} as const;

export const fontFamily = {
  sans: "Plus Jakarta Sans",
} as const;

export const type = {
  hero: { size: 38, weight: "800", lineHeight: 1.02, letterSpacing: -1 },
  title: { size: 30, weight: "800", lineHeight: 1.1, letterSpacing: -0.6 },
  body: { size: 14, weight: "400", lineHeight: 1.5, letterSpacing: 0 },
} as const;
