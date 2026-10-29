import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { isLocale, languageOf } from "@shared/i18n";

// Shared by the phone's banner helpers (POST /api/mobile/banner, POST /api/mobile/banner/taglines).

/** The language to write in: the one the phone is set to (English when it sends none we speak). */
export function writerLanguage(locale: unknown) {
  return languageOf(isLocale(locale) ? locale : "en").name;
}

/** The body, checked; a NextResponse (400) when it doesn't fit. */
export async function readJson<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T> | NextResponse> {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check what you typed and try again.", 400);
  return parsed.data;
}

/** A per-seller cap on top of AI metering, so a stuck button can't fire hundreds of requests. */
export async function overLimit(scope: string, userId: string, maxRequests: number) {
  const result = await checkRateLimitShared(rateLimitKey(scope, userId), { maxRequests, windowMs: 3_600_000 });
  return result.allowed ? null : apiError("RATE_LIMITED", "That's a lot of tries this hour. Give it a little while and try again.", 429);
}
