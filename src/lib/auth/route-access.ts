// Which app pages need a signed-in account, and which role. Pure (no imports) so the proxy, server
// helpers and tests (tests/auth-security.test.mjs) all read the same table.

export type PortalRole = "seller" | "supplier" | "logistics_partner" | "admin";

const ALL_ROLES: PortalRole[] = ["seller", "supplier", "logistics_partner", "admin"];

/** Pages for signed-out visitors (signed-in visitors of the same portal are sent to their dashboard). */
export const GUEST_PAGES = [
  "/login",
  "/signup",
  "/supplier/login",
  "/supplier/signup",
  "/logistics/login",
  "/logistics/signup",
  "/admin/login",
  "/forgot-password",
  "/reset-password",
];

/** Public pages that live under a portal prefix and must stay open to guests and other roles. */
export const PUBLIC_PORTAL_PAGES = ["/logistics/partners", "/email", "/rider"];

/**
 * Signed-in areas. The most specific prefix wins, so "/home/notifications" (every role has a bell) is checked
 * before "/home" (sellers only). Anything not listed here or above is public (storefronts, /suppliers/[slug]...).
 */
export const PROTECTED_AREAS: { prefix: string; roles: PortalRole[] }[] = [
  { prefix: "/home/notifications", roles: ALL_ROLES },
  // Resell (pilot): any signed-in account the feature is on for (the page checks the switch).
  { prefix: "/resell", roles: ALL_ROLES },
  { prefix: "/home", roles: ["seller"] },
  { prefix: "/seller", roles: ["seller"] },
  { prefix: "/onboarding", roles: ["seller"] },
  { prefix: "/products", roles: ["seller"] },
  { prefix: "/builder", roles: ["seller"] },
  { prefix: "/studio", roles: ["seller"] },
  { prefix: "/peggy", roles: ["seller"] },
  { prefix: "/chip", roles: ["seller"] },
  { prefix: "/channels", roles: ["seller"] },
  { prefix: "/marketplace", roles: ["seller"] },
  { prefix: "/preview", roles: ["seller"] },
  { prefix: "/supplier", roles: ["supplier"] },
  { prefix: "/logistics", roles: ["logistics_partner"] },
  { prefix: "/admin", roles: ["admin"] },
  // The CAC email link: sends each business to its own portal's register-business page.
  { prefix: "/register-business", roles: ["seller", "supplier", "logistics_partner"] },
];

export const PROTECTED_PREFIXES = PROTECTED_AREAS.map((area) => area.prefix);

/** Cookie-authenticated JSON APIs: mutating calls get an Origin check, and responses are never cached. */
export const PORTAL_API_PREFIXES = ["/api/app", "/api/supplier", "/api/logistics", "/api/admin", "/api/auth"];

export function isUnderPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function matchesAny(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => isUnderPath(pathname, prefix));
}

/** The roles that may open this page, or null when it's public or a guest page. */
export function rolesForPath(pathname: string): PortalRole[] | null {
  if (matchesAny(pathname, GUEST_PAGES) || matchesAny(pathname, PUBLIC_PORTAL_PAGES)) return null;
  let best: { prefix: string; roles: PortalRole[] } | null = null;
  for (const area of PROTECTED_AREAS) {
    if (isUnderPath(pathname, area.prefix) && (!best || area.prefix.length > best.prefix.length)) best = area;
  }
  return best?.roles ?? null;
}

/**
 * A redirect target we may follow after sign-in: same-site paths only. Rejects "//evil.com", "/\evil.com",
 * absolute URLs, "javascript:", control characters and anything that resolves off-site.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string" || value.length > 2048) return null;
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

/** "/login?next=%2Fhome%2Forders" — the page they asked for, so sign-in can take them back. */
export function loginRedirectPath(loginPath: string, pathname: string, search = "") {
  const next = safeNextPath(`${pathname}${search}`);
  if (!next || next === "/" || matchesAny(pathname, GUEST_PAGES)) return loginPath;
  return `${loginPath}?next=${encodeURIComponent(next)}`;
}
