// Google Fonts through the app (src/app/api/fonts): the brand book and the imported HTML store templates
// (public/store-templates, rewritten by scripts/self-host-template-fonts.mjs) show their fonts without the visitor's
// browser ever calling fonts.googleapis.com or fonts.gstatic.com, so Google doesn't get their IP address (NDPA: no
// transfer we don't need). Only Google's own font CSS and font files can be fetched. Pure, tested in
// tests/privacy-gaps.test.mjs.

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

/** Google's three stylesheet APIs, as /api/fonts/google/<api>?… */
export const GOOGLE_CSS_APIS = { css: "https://fonts.googleapis.com/css", css2: "https://fonts.googleapis.com/css2", icon: "https://fonts.googleapis.com/icon" } as const;
export type GoogleCssApi = keyof typeof GOOGLE_CSS_APIS;

const ALLOWED_PARAMS = new Set(["family", "display", "subset", "text", "effect"]);

/**
 * The Google URL for /api/fonts/google/<api>?<query>, or null when the API or any parameter isn't a font request
 * (old css "Open Sans:300,400|Lato", css2 "Inter:wght@400;700", icon "Material Icons").
 */
export function googleFontsUpstream(api: string, query: URLSearchParams) {
  if (!(api in GOOGLE_CSS_APIS)) return null;
  const url = new URL(GOOGLE_CSS_APIS[api as GoogleCssApi]);
  let families = 0;
  for (const [key, value] of query) {
    if (!ALLOWED_PARAMS.has(key) || value.length > 400) return null;
    if (key !== "text" && !/^[A-Za-z0-9 +:,;@.|_~-]*$/.test(value)) return null;
    if (key === "family") families += 1;
    url.searchParams.append(key, value);
  }
  return families >= 1 && families <= 6 ? url : null;
}

/** Points every Google Fonts stylesheet URL in an HTML or CSS file at the app's proxy; drops preconnects to Google. */
export function selfHostGoogleFonts(source: string) {
  return source
    .replace(/[ \t]*<link[^>]*rel=["']?(?:preconnect|dns-prefetch)["']?[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>[ \t]*\r?\n?/gi, "")
    .replace(/[ \t]*<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*rel=["']?(?:preconnect|dns-prefetch)["']?[^>]*>[ \t]*\r?\n?/gi, "")
    .replace(/(?:https?:)?\/\/fonts\.googleapis\.com\/(css2|css|icon)\?/g, "/api/fonts/google/$1?");
}
