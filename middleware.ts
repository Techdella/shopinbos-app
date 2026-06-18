import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSubdomainSlug } from "@/lib/domains/storefront";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";

  // ─── Rate limiting (API mutations) ──────────────────────────────────────────
  if (MUTATION_METHODS.has(req.method) && pathname.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const key = `${ip}:${req.method}:${pathname}`;
    const result = checkRateLimit(key, { maxRequests: 30, windowMs: 60_000 });

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
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "shopinbos.com";
  let appHost = "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  try {
    appHost = new URL(appUrl).hostname;
  } catch {
    // fallback: treat localhost as app host
  }

  const isAppHost =
    !hostname ||
    hostname === appHost ||
    hostname.startsWith("localhost");

  const isRootDomain =
    hostname === rootDomain ||
    hostname === `www.${rootDomain}`;

  // App's own host or root marketing domain — no rewriting needed
  if (isAppHost || isRootDomain) return NextResponse.next();

  // ─── Platform subdomain routing ──────────────────────────────────────────────
  // e.g. mystore.shopinbos.com → rewrite internally to /s/mystore
  const subdomain = getSubdomainSlug(hostname);
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
