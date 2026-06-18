import { NextRequest, NextResponse } from "next/server";

interface CorsOptions {
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  cacheControl?: string;
}

const PUBLIC_API_ALLOWED_ORIGINS = [
  "https://shopinbos.com",
  "https://www.shopinbos.com",
  "http://localhost:3000",
  "http://localhost:8080",
];

const PUBLIC_API_ALLOWED_METHODS = ["GET", "OPTIONS"];
const PUBLIC_API_ALLOWED_HEADERS = ["Content-Type"];
export const PUBLIC_LIST_CACHE = "public, max-age=300, stale-while-revalidate=600";
export const PUBLIC_DETAIL_CACHE = "public, max-age=600, stale-while-revalidate=1200";

export function getCorsHeaders(req: NextRequest, options: CorsOptions = {}): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": (options.methods ?? PUBLIC_API_ALLOWED_METHODS).join(", "),
    "Access-Control-Allow-Headers": (options.headers ?? PUBLIC_API_ALLOWED_HEADERS).join(", "),
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (PUBLIC_API_ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  if (options.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function withCors(req: NextRequest, res: NextResponse, options: CorsOptions = {}): NextResponse {
  const headers = getCorsHeaders(req, options);
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  if (options.cacheControl) {
    res.headers.set("Cache-Control", options.cacheControl);
  }
  return res;
}

// Handle preflight
export function handleOptions(req: NextRequest, options: CorsOptions = {}): NextResponse {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req, options) });
}
