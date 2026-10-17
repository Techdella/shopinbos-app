const INTENT_PARAM_KEYS = [
  "intent",
  "productSlug",
  "supplierSlug",
  "logisticsSlug",
  "categorySlug",
  "source",
  // From shopinbos.com: which store theme, plan or free tool the visitor came from.
  "template",
  "plan",
  "billing",
  "tool",
];

function cleanValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();

  for (const key of INTENT_PARAM_KEYS) {
    const value = cleanValue(params[key]);
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function getContinuationPath(params) {
  const role = params.role || "seller";
  const intent = cleanValue(params.intent);
  const query = buildQuery(params);

  if (!intent) {
    if (role === "supplier") return "/supplier/dashboard";
    if (role === "logistics_partner") return "/logistics/dashboard";
    if (role === "admin") return "/admin/dashboard";
    return "/home";
  }

  if (role === "supplier") {
    if (intent === "view_products") return `/supplier/products${query}`;
    return `/supplier/dashboard${query}`;
  }

  if (role === "logistics_partner") {
    if (intent === "connect_logistics") return `/logistics/profile${query}`;
    if (intent === "book_delivery") return `/logistics/bookings${query}`;
    return `/logistics/dashboard${query}`;
  }

  if (role === "admin") {
    return `/admin/dashboard${query}`;
  }

  if (intent === "book_delivery" || intent === "connect_logistics") {
    return `/home/logistics${query}`;
  }

  // "Use this template" on shopinbos.com/templates: open the theme library on that theme.
  if (intent === "template") {
    return `/builder/templates${query}`;
  }

  // "Start with Growth" on shopinbos.com/pricing.
  if (intent === "plan") {
    const billing = new URLSearchParams(query);
    billing.set("tab", "Billing");
    return `/home/settings?${billing.toString()}`;
  }

  // "Try it in the app" from the China import card.
  if (intent === "import") {
    return `/home/imports${query}`;
  }

  if (
    intent === "add" ||
    intent === "add_product" ||
    intent === "sell" ||
    intent === "dropship" ||
    intent === "bulk_order" ||
    intent === "request_quote" ||
    intent === "view_products" ||
    intent === "request_supplier_quote"
  ) {
    return `/marketplace${query}`;
  }

  return `/home${query}`;
}

// Same rules as safeNextPath in src/lib/auth/route-access.ts: one leading slash, never "//" or "/\" (browsers
// read "/\evil.com" as "//evil.com"), no control characters, and it must stay on our own origin once resolved.
function samePathOnly(value) {
  if (value.length > 2048) return null;
  // eslint-disable-next-line no-control-regex
  if (!/^\/(?![/\\])/.test(value) || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const resolved = new URL(value, "https://app.invalid");
    if (resolved.origin !== "https://app.invalid") return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

function sanitizeNextPath(next, appUrl) {
  const candidate = cleanValue(next);
  if (!candidate) return null;
  if (candidate.startsWith("/")) return samePathOnly(candidate);

  try {
    const target = new URL(candidate);
    const base = new URL(appUrl);
    if (target.origin === base.origin) {
      return samePathOnly(`${target.pathname}${target.search}${target.hash}`);
    }
  } catch {
    return null;
  }

  return null;
}

function extractIntentParams(searchParams) {
  const extracted = {};

  for (const key of INTENT_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      extracted[key] = value;
    }
  }

  return extracted;
}

module.exports = {
  INTENT_PARAM_KEYS,
  extractIntentParams,
  getContinuationPath,
  sanitizeNextPath,
};
