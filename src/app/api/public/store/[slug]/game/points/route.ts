import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { readGameConfig, redeemablePoints, TIER_NAMES } from "@/lib/gamification/logic";
import { verifiedLoyalty } from "@/lib/gamification/loyalty.server";

// A shopper's points balance, for checkout and the store's "check your points" box. Needs the email and the
// phone number from an earlier order with this store (POST, so neither ends up in URLs or logs). With a
// subtotal it also says how many points can be used on that bag.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({ email: z.string().max(200), phone: z.string().max(40), subtotal: z.number().nonnegative().max(1e9).optional() });

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`points:${ip}`, { maxRequests: 15, windowMs: 60_000 }).allowed) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a minute.", 429), CORS);
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true, brandSettings: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Enter your email and phone number."), CORS);

  const settings = readGameConfig(record(store.brandSettings).gamification ?? {}).loyalty;
  if (!settings.enabled) return withCors(req, ok({ enabled: false, found: false }), CORS);
  const summary = await verifiedLoyalty(store.id, parsed.data.email, parsed.data.phone, settings).catch((error) => {
    console.error("[gamification] points lookup failed", error);
    return null;
  });
  const res = withCors(req, ok(summary
    ? {
        enabled: true,
        found: true,
        balance: summary.balance,
        tier: summary.tier,
        tierName: TIER_NAMES[summary.tier],
        next: summary.next ? { tier: summary.next.tier, tierName: TIER_NAMES[summary.next.tier], remaining: summary.next.remaining } : null,
        valueOfBalance: Math.round(summary.balance * settings.pointValue * 100) / 100,
        usable: parsed.data.subtotal != null ? redeemablePoints({ balance: summary.balance, base: parsed.data.subtotal }, settings) : null,
      }
    : { enabled: true, found: false }), CORS);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
