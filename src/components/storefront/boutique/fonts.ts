// The storefront themes' own font variables. The app shell (.app-scope) maps --font-accent and --font-display
// to the app's sans, so themes rendered inside the app (builder previews, theme cards) need variables of their
// own to keep their serif and grotesk faces. The faces are self-hosted (src/app/fonts.css, class .bq-fonts).

/** Put on the root of anything that draws a theme (storefront, product page, theme cards). */
export const BOUTIQUE_FONT_CLASS = "bq-fonts";

export const BQ_SERIF = "var(--bq-serif), 'Fraunces', Georgia, 'Times New Roman', serif";
export const BQ_GROTESK = "var(--bq-grotesk), 'Space Grotesk', system-ui, sans-serif";
export const BQ_SANS = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";
export const BQ_MONO = "var(--bq-mono), 'JetBrains Mono', ui-monospace, monospace";
