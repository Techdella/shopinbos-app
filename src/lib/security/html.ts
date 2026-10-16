// Small output-encoding helpers for values that end up inside a <script> on our pages. Pure so tests can use them.

/** JSON for a <script> body (JSON-LD): "<", ">" and "&" escaped, so "</script>" in a product name can't end it. */
export function scriptSafeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** A Google Analytics 4 measurement ID ("G-XXXXXXXXXX"), or "" for anything else (it is written into a script). */
export function gaMeasurementId(value: unknown) {
  const id = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^G-[A-Z0-9]{4,20}$/.test(id) ? id : "";
}

// ─── Store connections (Settings › Connections) ───────────────────────────────
// Every ID below ends up in a <script> or a <meta> on the live storefront, so each is checked against the exact
// shape its service issues and anything else becomes "". Never loosen these to "any text".

const upper = (value: unknown) => (typeof value === "string" ? value.trim().toUpperCase() : "");

/** A Google Tag Manager container ID ("GTM-XXXXXXX"), or "". */
export function gtmContainerId(value: unknown) {
  const id = upper(value);
  return /^GTM-[A-Z0-9]{4,12}$/.test(id) ? id : "";
}

/** A Meta (Facebook) Pixel / dataset ID: digits only, or "". */
export function metaPixelId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^\d{8,20}$/.test(id) ? id : "";
}

/** A TikTok Pixel ID (letters and digits, e.g. "C4ABCDEF1234567890AB"), or "". */
export function tiktokPixelId(value: unknown) {
  const id = upper(value);
  return /^[A-Z0-9]{12,32}$/.test(id) ? id : "";
}

/**
 * The code from a verification <meta> tag. Accepts the code alone or the whole tag pasted
 * (`<meta name="google-site-verification" content="CODE" />`), and returns "" unless the code matches `shape`.
 */
function verificationCode(value: unknown, metaName: string, shape: RegExp) {
  let text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 400) return "";
  if (text.startsWith("<")) {
    const nameOk = new RegExp(`name\\s*=\\s*["']${metaName.replace(/[.:]/g, "\\$&")}["']`, "i").test(text);
    const content = /content\s*=\s*["']([^"'<>]*)["']/i.exec(text);
    if (!nameOk || !content) return "";
    text = content[1].trim();
  }
  return shape.test(text) ? text : "";
}

/** Google Search Console HTML-tag verification code (google-site-verification), or "". */
export function googleSiteVerification(value: unknown) {
  return verificationCode(value, "google-site-verification", /^[A-Za-z0-9_-]{20,100}$/);
}

/** Bing Webmaster Tools verification code (msvalidate.01, 32 hex characters), or "". */
export function bingSiteVerification(value: unknown) {
  return verificationCode(value, "msvalidate.01", /^[A-Fa-f0-9]{32}$/).toUpperCase();
}

/** Meta (Facebook) Business domain verification code (facebook-domain-verification), or "". */
export function facebookDomainVerification(value: unknown) {
  return verificationCode(value, "facebook-domain-verification", /^[a-z0-9]{20,40}$/);
}

/** Pinterest domain verification code (p:domain_verify, 32 hex characters), or "". */
export function pinterestSiteVerification(value: unknown) {
  return verificationCode(value, "p:domain_verify", /^[a-f0-9]{32}$/i).toLowerCase();
}
