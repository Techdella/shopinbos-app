export const colors = {
  ink: '#16141F',
  sub: '#6B6779',
  line: '#ECEAF2',
  canvas: '#F6F5F9',
  paper: '#FFFFFF',
  accent: '#FF6A2B',
  'accent-soft': '#FFEDE4',
  'accent-text': '#B23E0A',
  ai: '#0C4A44',
  'ai-soft': '#E2F6F1',
  'ai-mid': '#8BE3D3',
  ok: '#16794A',
  'ok-soft': '#E2F5EA',
  warn: '#8A5A08',
  'warn-soft': '#FDF0D5',
  info: '#1F5FBF',
  'info-soft': '#E3EEFD',
  select: '#3B6EF5',
} as const;

export type ColorToken = keyof typeof colors;

/** Hero wash: three radial gradients (SPEC 5.1). */
export const wash = {
  peach: '#FFE2D2',
  lilac: '#E7E1FF',
  mint: '#DDF4EE',
} as const;

export const washCss =
  `radial-gradient(60% 80% at 0% 0%, ${wash.peach} 0%, transparent 70%), ` +
  `radial-gradient(60% 80% at 100% 0%, ${wash.lilac} 0%, transparent 70%), ` +
  `radial-gradient(70% 90% at 50% 100%, ${wash.mint} 0%, transparent 70%)`;

export const fonts = {
  ui: 'Plus Jakarta Sans',
  storefrontDisplay: ['Fraunces', 'DM Serif Display', 'Bricolage Grotesque', 'Space Grotesk'],
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

/** Type scale in px. */
export const fontSizes = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  cardWeb: 22,
  cardMobile: 24,
  pill: 999,
} as const;

/** Component sizes (SPEC 5.3). */
export const sizes = {
  buttonMinHeight: { mobile: 52, web: 44 },
  chipHeight: { mobile: 38, web: 36 },
  toggle: { mobile: { width: 50, height: 30 }, web: { width: 46, height: 28 } },
  touchTarget: 44,
  sidebarWidth: 244,
} as const;

export const shadows = {
  card: '0 1px 2px rgba(22, 20, 31, 0.04)',
  floating: '0 12px 32px rgba(22, 20, 31, 0.12)',
} as const;

/** Native theme object (React Native StyleSheet values). */
export const theme = {
  colors,
  wash,
  fonts,
  fontWeights,
  fontSizes,
  spacing,
  radius,
  sizes,
} as const;

export type Theme = typeof theme;
