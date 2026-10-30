import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey, requestIp } from "@/lib/rate-limit";
import { saveRiderReview } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";

// The customer's rating of their rider, from the review link the rider sent (/rate-rider/<code>).
//   POST { code, rating: 1-5, comment? } → { saved: true }   once per delivered job

export async function POST(req: NextRequest) {
  const ip = requestIp(req.headers);
  const limit = await checkRateLimitShared(rateLimitKey("rider-review", ip), { maxRequests: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429);
  const body = (await req.json().catch(() => null)) as { code?: unknown; rating?: unknown; comment?: unknown } | null;
  const result = await saveRiderReview(typeof body?.code === "string" ? body.code.slice(0, 80) : "", { rating: body?.rating, comment: body?.comment });
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ saved: true });
}
