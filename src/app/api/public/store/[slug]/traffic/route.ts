import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBotUserAgent } from "@/lib/analytics/sources";
import { normalizeSearchTerm, normalizeStorePath, trafficIncrements } from "@/lib/analytics/traffic";
import { recordTraffic } from "@/lib/analytics/traffic-record";

// Store traffic beacon (src/components/storefront/StoreTrafficBeacon.tsx): page views, the session's landing details
// and engaged time, added to StoreTrafficDaily. Counts only: the IP is used for rate limiting in memory and never
// stored, the user agent is reduced to a device class, the referrer to its host.
const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({
  type: z.enum(["page_view", "engagement"]),
  path: z.string().min(1).max(300),
  q: z.string().max(80).optional(),
  entry: z
    .object({
      referrerHost: z.string().max(253).optional(),
      ref: z.string().max(64).optional(),
      medium: z.string().max(64).optional(),
      campaign: z.string().max(120).optional(),
    })
    .optional(),
  limited: z.boolean().optional(),
  firstToday: z.boolean().optional(),
  newVisitor: z.boolean().optional(),
  seconds: z.number().min(0).max(86_400).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // sendBeacon posts text/plain on some browsers; read the body as text either way.
  const parsed = Body.safeParse(await req.text().then((text) => JSON.parse(text)).catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Unknown event"), CORS);
  const userAgent = req.headers.get("user-agent");
  if (isBotUserAgent(userAgent)) return withCors(req, ok({ counted: false }), CORS);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(`store-traffic:${slug}:${ip}`, { maxRequests: 240, windowMs: 60_000 }).allowed) {
    return withCors(req, ok({ counted: false }), CORS);
  }

  const path = normalizeStorePath(parsed.data.path, slug);
  if (!path) return withCors(req, ok({ counted: false }), CORS);

  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true, customDomain: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  // Only real products of this store get a row of their own (no made-up paths filling the table).
  if (path.productId) {
    const product = await db.storeProduct.findFirst({ where: { id: path.productId, storeId: store.id }, select: { id: true } });
    if (!product) return withCors(req, ok({ counted: false }), CORS);
  }

  const limited = parsed.data.limited === true;
  const increments = trafficIncrements(
    {
      type: parsed.data.type,
      path,
      search: normalizeSearchTerm(parsed.data.q),
      entry: parsed.data.entry ? (limited ? {} : parsed.data.entry) : undefined,
      firstToday: parsed.data.firstToday,
      newVisitor: parsed.data.newVisitor,
      seconds: parsed.data.seconds,
    },
    {
      userAgent,
      // Country and city as the host already worked them out (Vercel); left out when the shopper asked not to be tracked.
      country: limited ? null : req.headers.get("x-vercel-ip-country"),
      city: limited ? null : req.headers.get("x-vercel-ip-city"),
      ownHosts: [req.headers.get("host") ?? "", store.customDomain ?? ""].filter(Boolean),
    },
  );
  await recordTraffic(store.id, increments);
  return withCors(req, ok({ counted: increments.length > 0 }), CORS);
}
