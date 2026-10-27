// Google Fonts through the app (src/app/api/fonts): the brand book shows a seller's chosen fonts without their browser
// ever calling fonts.googleapis.com or fonts.gstatic.com, so Google doesn't get their IP address (NDPA: no transfer
// we don't need). Only Google's own font CSS and font files can be fetched. Pure, tested in tests/privacy-gaps.test.mjs.

export const GOOGLE_CSS = "https://fonts.googleapis.com/css2";
export const GOOGLE_FILES = "https://fonts.gstatic.com";

/** "Playfair Display:wght@500;700" and the like: letters, digits, spaces and the axis syntax only. */
export function safeFamily(value: string | null | undefined) {
  const family = String(value ?? "").trim();
  return /^[A-Za-z0-9 ]{1,60}(:[a-z,@;.0-9]{1,60})?$/.test(family) ? family : null;
}

/** Google's CSS with every fonts.gstatic.com URL sent through /api/fonts/file instead. */
export function rewriteFontCss(css: string, base = "/api/fonts/file") {
  return css.replace(/url\(\s*['"]?https:\/\/fonts\.gstatic\.com\/([^)'"\s]+)['"]?\s*\)/g, (_, path: string) => `url(${base}/${path})`);
}

/** A path under fonts.gstatic.com/s/… that ends in a font file; anything else is refused. */
export function safeFontPath(segments: string[]) {
  const path = segments.join("/");
  return /^s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_\-./]+\.(woff2|woff|ttf)$/.test(path) && !path.includes("..") ? path : null;
}
