// A shop's @handle (@kemibags) and its short link (app.shopinbos.com/@kemibags), printed with a QR code on parcels
// and flyers. Pure so the web, the phone app, the API and the tests share the rules. The server side (assigning a
// handle, changing it, resolving a link) is src/lib/shop-handle.server.ts; the redirect is src/app/h/[handle].
//
// Rules: 3-24 characters, lowercase letters a-z, digits and underscores, starting with a letter; no "__" and no
// underscore at the end; not a reserved word. Handles are always stored lowercase ("Store"."handle"; unique, the
// migration is docs/migrations/2026-12-13-store-handle.sql and mirrors RESERVED_HANDLES). No dots: "kemi.bags"
// reads like a web address or a file and breaks the short link's look.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

/**
 * Plug (the Shopinbos customer app) isn't out yet. While this is false the share card says "Shop with us on
 * Shopinbos" and the link opens the shop's website; when Plug ships, the pilot switch turns the card's `plug` on
 * ("Follow us on Shopinbos Plug") and shopLinkTarget (src/lib/shop-handle.server.ts) opens Plug instead.
 */
export const PLUG_LIVE = false;

/** Words no shop can take: Shopinbos's own names, app pages, and words people could mistake for staff. */
export const RESERVED_HANDLES: readonly string[] = [
  "about", "account", "accounts", "admin", "administrator", "ads", "affiliate", "affiliates", "api", "app", "apps",
  "auth", "billing", "blog", "bos", "careers", "cart", "checkout", "chip", "contact", "customer", "customers",
  "delivery", "dev", "docs", "email", "everyone", "faq", "help", "home", "info", "invite", "jobs", "legal", "login",
  "logistics", "logout", "mail", "marketplace", "me", "moderator", "mybos", "mybosstore", "news", "null",
  "official", "order", "orders", "partner", "partners", "pay", "payment", "payments", "payout", "payouts", "peggy",
  "plug", "press", "privacy", "register", "rex", "rider", "riders", "root", "security", "seller", "sellers",
  "settings", "shop", "shopinbos", "shopinbosplug", "shopinbos_plug", "shops", "signin", "signup", "staff",
  "status", "store", "stores", "supplier", "suppliers", "support", "system", "team", "terms", "test", "undefined",
  "verified", "verify", "wallet", "www",
];

const RESERVED = new Set(RESERVED_HANDLES);

export type HandleProblem = "short" | "long" | "start" | "chars" | "underscore" | "reserved";

/** What a person typed → the handle it means: no spaces around, no leading "@", lowercase, no accents. */
export function normaliseHandle(value: string) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

/** Why this (normalised) handle can't be used, or null when it can. */
export function handleProblem(handle: string): HandleProblem | null {
  if (handle.length < HANDLE_MIN) return "short";
  if (handle.length > HANDLE_MAX) return "long";
  if (!/^[a-z0-9_]+$/.test(handle)) return "chars";
  if (!/^[a-z]/.test(handle)) return "start";
  if (handle.includes("__") || handle.endsWith("_")) return "underscore";
  if (RESERVED.has(handle)) return "reserved";
  return null;
}

export function isValidHandle(handle: string) {
  return handleProblem(handle) === null;
}

/**
 * A usable handle from any text (a shop name or its web address): letters and digits only, starting with a letter,
 * at most HANDLE_MAX. "Kemi's Bags & Co." → "kemisbagsco", "kemi-bags" → "kemibags". Too short or reserved gets
 * "shop" added ("Jo" → "joshop", "Admin" → "adminshop"); nothing usable at all → "".
 */
export function suggestFromName(text: string) {
  let base = normaliseHandle(text)
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^[0-9]+/, "");
  if (!base) return "";
  base = base.slice(0, HANDLE_MAX);
  if (base.length < HANDLE_MIN || RESERVED.has(base)) base = `${base}shop`.slice(0, HANDLE_MAX);
  return isValidHandle(base) ? base : "";
}

/** `base` with a number on the end, cut so it still fits: ("kemibags", 2) → "kemibags2". */
export function withNumber(base: string, n: number) {
  const tail = String(n);
  return `${base.slice(0, HANDLE_MAX - tail.length).replace(/_+$/, "")}${tail}`;
}

/**
 * Handles to try for a new shop, best first: each base as it is, then with 2, 3, … on the end. Bases are tried in
 * order (the web address first, then the shop name); empty and invalid ones are skipped, duplicates dropped.
 */
export function handleCandidates(bases: readonly string[], perBase = 20) {
  const clean = [...new Set(bases.map((base) => suggestFromName(base)).filter(Boolean))];
  const out = new Set<string>(clean);
  for (const base of clean) {
    for (let n = 2; n <= perBase + 1; n++) {
      const next = withNumber(base, n);
      if (isValidHandle(next)) out.add(next);
    }
  }
  return [...out];
}

/** "@kemibags". */
export function atHandle(handle: string) {
  return `@${handle}`;
}

/** The short link's path on the app: "/@kemibags" (served by the /h/<handle> route, see the proxy). */
export function shopShortPath(handle: string) {
  return `/@${handle}`;
}

/** The short link printed and shared: "https://app.shopinbos.com/@kemibags". `appOrigin` has no trailing slash. */
export function shopShortLink(handle: string, appOrigin = "https://app.shopinbos.com") {
  return `${appOrigin.replace(/\/+$/, "")}${shopShortPath(handle)}`;
}

/** The handle in a short-link path ("/@KemiBags", "/@kemibags/", or "/%40kemibags" from a client that encoded the
 * "@") or null. Only the shape is checked here. */
export function handleFromShortPath(pathname: string) {
  const match = /^\/(?:@|%40)([A-Za-z0-9_]{1,40})\/?$/i.exec(pathname);
  return match ? match[1].toLowerCase() : null;
}

/** The query the QR code adds to the short link, so a scan counts as a QR visit (src/app/h/[handle]/route.ts). */
export const SHOP_QR_PARAM = "src";
export const SHOP_QR_VALUE = "qr";

/**
 * The address the QR code holds: the short link with ?src=qr ("https://app.shopinbos.com/@kemibags?src=qr"). The
 * printed and shared link stays plain; only the code carries the marker. String-only (React Native's URL has no
 * working searchParams); a link that already has a src keeps it.
 */
export function shopQrUrl(shortUrl: string) {
  const [base, hash = ""] = shortUrl.split("#", 2);
  if (!base || new RegExp(`[?&]${SHOP_QR_PARAM}=`).test(base)) return shortUrl;
  const joined = `${base}${base.includes("?") ? "&" : "?"}${SHOP_QR_PARAM}=${SHOP_QR_VALUE}`;
  return hash ? `${joined}#${hash}` : joined;
}
