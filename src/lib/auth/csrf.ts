// Cross-site request check for cookie-authenticated JSON route handlers. Server actions already get
// Next's own Origin check; route handlers don't, so the proxy runs this on every mutating call to the
// portal APIs. Pure so tests can exercise it.
import { matchesAny, PORTAL_API_PREFIXES } from "./route-access.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfRequest {
  method: string;
  pathname: string;
  headers: { get(name: string): string | null };
  /** Extra origins allowed to send cookie requests (the app's own URL, CSRF_TRUSTED_ORIGINS). */
  trustedOrigins?: string[];
}

function hostOf(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Returns why the request is refused, or null when it may go through. */
export function csrfRejection(request: CsrfRequest): string | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;
  if (!matchesAny(request.pathname, PORTAL_API_PREFIXES)) return null;
  // Bearer-token callers (the mobile app, scripts) don't ride on cookies, so a forged request can't use them.
  if (/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) return null;
  // Provider webhooks post from their own servers with their own signatures.
  if (/\/webhooks?(\/|$)/.test(request.pathname)) return null;

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin === "null") {
    // Browsers always send Origin on cross-site POSTs; "null" comes from sandboxed frames and file: pages.
    if (origin === "null" || fetchSite === "cross-site") return "Cross-site request blocked.";
    return null; // server-to-server or curl: no ambient browser cookies involved
  }

  const originHost = hostOf(origin);
  const allowed = new Set<string>();
  for (const value of [request.headers.get("x-forwarded-host"), request.headers.get("host"), ...(request.trustedOrigins ?? [])]) {
    for (const part of (value ?? "").split(",")) {
      const host = hostOf(part.trim());
      if (host) allowed.add(host);
    }
  }
  return originHost && allowed.has(originHost) ? null : "Cross-site request blocked.";
}
