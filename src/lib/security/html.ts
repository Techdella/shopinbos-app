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
