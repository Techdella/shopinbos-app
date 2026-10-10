/**
 * Shopinbos design tokens (SPEC section 5). Single source for web (CSS variables via tokens.css)
 * and native (the `theme` object). Edit here, then run `pnpm --filter @shopinbos/tokens generate`.
 */

export * from './values';
export { buildTokensCss } from './css';
