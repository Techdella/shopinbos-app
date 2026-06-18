const INTENT_PARAM_KEYS = [
  "intent",
  "productSlug",
  "supplierSlug",
  "logisticsSlug",
  "categorySlug",
  "source",
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

  if (
    intent === "add" ||
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

function sanitizeNextPath(next, appUrl) {
  const candidate = cleanValue(next);
  if (!candidate) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }

  try {
    const target = new URL(candidate);
    const base = new URL(appUrl);
    if (target.origin === base.origin) {
      return `${target.pathname}${target.search}${target.hash}`;
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
