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
} as const;

/** Soft pastel wash used behind the welcome and "shop is live" screens. */
export const washStops = {
  peach: "#FFE2D2",
  lilac: "#E7E1FF",
  mint: "#DDF4EE",
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
