// Small output-encoding helpers for values that end up inside a <script> on our pages. Pure so tests can use them.

/** JSON for a <script> body (JSON-LD): "<", ">" and "&" escaped, so "</script>" in a product name can't end it. */
export function scriptSafeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// ─── Store connections ────────────────────────────────────────────────────────
// The Search Console code ends up in a <meta> on the live storefront, so it is checked against the exact shape
// Google issues and anything else becomes "". Never loosen this to "any text".

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
