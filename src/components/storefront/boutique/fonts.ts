import { Fraunces, JetBrains_Mono, Space_Grotesk } from "next/font/google";

// The storefront themes' own font variables. The app shell (.app-scope) maps --font-accent and --font-display
// to the app's sans, so themes rendered inside the app (builder previews, theme cards) need variables of their
// own to keep their serif and grotesk faces. Same families the app already loads.

const serif = Fraunces({
  variable: "--bq-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const grotesk = Space_Grotesk({
  variable: "--bq-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--bq-mono",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
  preload: false,
});

/** Put on the root of anything that draws a theme (storefront, product page, theme cards). */
export const BOUTIQUE_FONT_CLASS = `${serif.variable} ${grotesk.variable} ${mono.variable}`;

export const BQ_SERIF = "var(--bq-serif), 'Fraunces', Georgia, 'Times New Roman', serif";
export const BQ_GROTESK = "var(--bq-grotesk), 'Space Grotesk', system-ui, sans-serif";
export const BQ_SANS = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";
export const BQ_MONO = "var(--bq-mono), 'JetBrains Mono', ui-monospace, monospace";
