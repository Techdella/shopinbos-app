import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { overPublicLimit, requestIp } from "@/lib/rate-limit";
import { clientErrorSchema, recordClientError, reportingUser } from "@/lib/errors/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/client-errors: a browser reporting an error someone hit (src/lib/errors/report-client.ts), for
// Admin › App errors. No sign-in needed (errors happen before sign-in too); when there's a session, the account is
// recorded with it. Limited per IP; the IP itself is never stored.
export async function POST(req: NextRequest) {
  if (await overPublicLimit(req.headers, "errorReport")) return apiError("RATE_LIMITED", "Too many reports.", 429);
  const text = await req.text().catch(() => "");
  if (!text || text.length > 12_000) return apiError("BAD_REQUEST", "Nothing to report.");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    return apiError("BAD_REQUEST", "Nothing to report.");
  }
  const parsed = clientErrorSchema.safeParse(json);
  if (!parsed.success) return apiError("BAD_REQUEST", "Nothing to report.");
  // A cross-origin script's error (an extension, an ad blocker, the browser's own scripts): no message, no stack,
  // nothing to act on. The browser skips these too (report-client.ts), but not every browser says it the same way.
  if (/^(Uncaught )?Script error\.?$/i.test(parsed.data.message.trim()) && !parsed.data.stack) return ok({ recorded: false });
  try {
    const user = await reportingUser();
    const userAgent = req.headers.get("user-agent");
    const visitorKey = createHash("sha256").update(`${requestIp(req.headers)}|${userAgent ?? ""}`).digest("hex").slice(0, 24);
    await recordClientError(parsed.data, { userId: user?.id ?? null, role: user?.role ?? null, userAgent, visitorKey });
    return ok({ recorded: true });
  } catch (error) {
    console.error("[client-errors] couldn't record", error);
    return ok({ recorded: false });
  }
}
