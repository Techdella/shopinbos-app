import { NextRequest, NextResponse } from "next/server";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
let lastRateLimitCleanup = Date.now();

function checkMiddlewareRateLimit(
  key: string,
  config: { maxRequests: number; windowMs: number },
): { allowed: boolean; resetAt: number } {
  const now = Date.now();

  if (now - lastRateLimitCleanup > 60_000) {
    lastRateLimitCleanup = now;
    for (const [entryKey, entry] of rateLimitStore) {
      if (now > entry.resetAt) rateLimitStore.delete(entryKey);
    }
  }

  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, resetAt: entry.resetAt };
}

function normalizeMiddlewareDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "");
}

function getMiddlewareRootDomain() {
  return normalizeMiddlewareDomain(process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "shopinbos.com").replace(/^www\./, "");
}

function getMiddlewareSubdomainSlug(hostHeader: string | null | undefined) {
  const host = normalizeMiddlewareDomain(hostHeader ?? "");
  const rootDomain = getMiddlewareRootDomain();

  if (!host) return null;

  if (rootDomain === "localhost") {
    if (!host.endsWith(".localhost")) return null;
    const subdomain = host.slice(0, -".localhost".length);
    return subdomain && !subdomain.includes(".") ? subdomain : null;
  }

  if (host === rootDomain || host === `www.${rootDomain}` || !host.endsWith(`.${rootDomain}`)) {
    return null;
  }

  const subdomain = host.slice(0, -(`.${rootDomain}`.length));
  if (!subdomain || subdomain.includes(".") || subdomain === "www") return null;
  return subdomain;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = normalizeMiddlewareDomain(req.headers.get("host") ?? "");

  // ─── Rate limiting (API mutations) ──────────────────────────────────────────
  if (MUTATION_METHODS.has(req.method) && pathname.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const key = `${ip}:${req.method}:${pathname}`;
    const result = checkMiddlewareRateLimit(key, { maxRequests: 30, windowMs: 60_000 });

    if (!result.allowed) {
      return new NextResponse(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests" } }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }
  }

  // ─── Skip internal paths ─────────────────────────────────────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_domain/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Determine the canonical app host and root domain from env
  const rootDomain = getMiddlewareRootDomain();
  let appHost = "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  try {
    appHost = normalizeMiddlewareDomain(new URL(appUrl).hostname);
  } catch {
    // fallback: treat localhost as app host
  }

  const isAppHost =
    !hostname ||
    hostname === appHost ||
    hostname.startsWith("localhost") ||
    hostname.endsWith(".vercel.app");

  const isRootDomain =
    hostname === rootDomain ||
    hostname === `www.${rootDomain}`;

  // App's own host or root marketing domain — no rewriting needed
  if (isAppHost || isRootDomain) return NextResponse.next();

  // ─── Platform subdomain routing ──────────────────────────────────────────────
  // e.g. mystore.shopinbos.com → rewrite internally to /s/mystore
  const subdomain = getMiddlewareSubdomainSlug(hostname);
  if (subdomain) {
    const url = req.nextUrl.clone();
    url.pathname = `/s/${subdomain}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // ─── Custom domain routing ───────────────────────────────────────────────────
  // e.g. mybrand.com → rewrite internally to /_domain/mybrand.com/[...path]
  const url = req.nextUrl.clone();
  url.pathname = `/_domain/${hostname}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
