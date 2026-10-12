// NOT RUN. Next.js only loads middleware/proxy from the folder that holds `app/` (src/), and this project uses
// src/proxy.ts. Nothing here is active: neither the in-memory rate limiter below nor the subdomain/custom-domain
// rewrites. Kept only as a reference until those rewrites are ported into src/proxy.ts; delete it then. Do not
// rely on it for any security control.
import { NextRequest, NextResponse } from "next/server";

// ── Inline rate limiter (no external imports — Edge Runtime safe) ─────────────
const rlStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests = 30, windowMs = 60_000) {
  const now = Date.now();
  const entry = rlStore.get(key);
  if (!entry || now > entry.resetAt) {
    rlStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, resetAt: now + windowMs };
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, resetAt: entry.resetAt };
  }
  entry.count++;
  return { allowed: true, resetAt: entry.resetAt };
}

// ── Inline domain helpers (no external imports — Edge Runtime safe) ───────────
function normalizeDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]!
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "");
}

function getSubdomainSlug(hostname: string, rootDomain: string): string | null {
  const host = normalizeDomain(hostname);
  if (!host) return null;

  if (rootDomain === "localhost") {
    if (!host.endsWith(".localhost")) return null;
    const sub = host.slice(0, -".localhost".length);
    if (!sub || sub.includes(".")) return null;
    return sub;
  }

  if (
    host === rootDomain ||
    host === `www.${rootDomain}` ||
    !host.endsWith(`.${rootDomain}`)
  ) {
    return null;
  }

  const sub = host.slice(0, -(`.${rootDomain}`.length));
  if (!sub || sub.includes(".") || sub === "www") return null;
  return sub;
}

// ─────────────────────────────────────────────────────────────────────────────

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";

  // ── Rate limiting (API mutations only) ──────────────────────────────────────
  if (MUTATION_METHODS.has(req.method) && pathname.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const result = checkRateLimit(`${ip}:${req.method}:${pathname}`);
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

  // ── Skip internal / static paths ────────────────────────────────────────────
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

  // ── Resolve platform root domain and app host ────────────────────────────────
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "shopinbos.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  let appHost = "";
  try {
    appHost = new URL(appUrl).hostname;
  } catch {
    // fall through — appHost stays ""
  }

  const isAppHost =
    !hostname || hostname === appHost || hostname.startsWith("localhost");
  const isRootDomain =
    hostname === rootDomain || hostname === `www.${rootDomain}`;

  // App's own host or root marketing domain — no rewriting
  if (isAppHost || isRootDomain) return NextResponse.next();

  // ── Platform subdomain: mystore.shopinbos.com → /s/mystore ─────────────────
  const subdomain = getSubdomainSlug(hostname, rootDomain);
  if (subdomain) {
    const url = req.nextUrl.clone();
    url.pathname = `/s/${subdomain}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // ── Custom domain: mybrand.com → /_domain/mybrand.com/[...path] ────────────
  const url = req.nextUrl.clone();
  url.pathname = `/_domain/${hostname}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
