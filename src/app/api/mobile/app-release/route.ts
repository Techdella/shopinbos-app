import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { handleOptions, withCors } from "@/lib/api/cors";
import { getAppRelease } from "@/lib/app-release.server";
import { overPublicLimit } from "@/lib/rate-limit";
import { isAppReleasePlatform } from "@shared/app-release";

export const dynamic = "force-dynamic";

// GET /api/mobile/app-release?platform=android → { data: { latestBuild, minBuild, message? } }
// No sign-in: the phone app asks on launch and when it comes back to the front (at most hourly) whether a newer
// version is in the store, or whether its build is too old to work (shared/app-release.ts). Set in Admin › App
// updates. Cached for a minute here and in between.

const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  if (await overPublicLimit(req.headers, "appRelease")) return withCors(req, apiError("RATE_LIMITED", "Too many requests. Try again in a minute.", 429));
  const platform = req.nextUrl.searchParams.get("platform") ?? "android";
  if (!isAppReleasePlatform(platform)) return withCors(req, apiError("BAD_REQUEST", "Platform must be android or ios."));
  const release = await getAppRelease(platform);
  return withCors(req, ok(release), { cacheControl: CACHE });
}
