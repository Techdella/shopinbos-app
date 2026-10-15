import { NextRequest } from "next/server";
import { z } from "zod";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { isBotUserAgent } from "@/lib/analytics/sources";
import { recordBioClick } from "@/lib/bio/service.server";

// A tap on a link in bio block (sent with sendBeacon as the shopper leaves). Counts only, no personal data.
const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({ blockId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Unknown block"), CORS);
  if (isBotUserAgent(req.headers.get("user-agent"))) return withCors(req, ok({ counted: false }), CORS);
  if (!checkRateLimit(`bio-click:${slug}:${requestIp(req.headers)}`, { maxRequests: 60, windowMs: 60_000 }).allowed) return withCors(req, ok({ counted: false }), CORS);
  return withCors(req, ok({ counted: await recordBioClick(slug, parsed.data.blockId) }), CORS);
}
