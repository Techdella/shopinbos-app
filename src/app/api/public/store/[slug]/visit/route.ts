import { NextRequest, after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";
import { recordStoreMetric } from "@/lib/analytics/record";
import { isBotUserAgent, normalizeCampaign, normalizeSource } from "@/lib/analytics/sources";
import { overPublicLimit } from "@/lib/rate-limit";
import { alertStoreVisit } from "@/lib/storefront/seller-alerts.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Storefront visit beacon (once per browser session): refreshes StoreVisitor.lastSeenAt so the seller dashboard can
// count visitors today, adds to the daily visit counter by source/utm_campaign for /home/analytics, and tells the
// seller someone is on their store (src/lib/storefront/seller-alerts.server.ts; not for the seller's own visits).
const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({ visitorKey: z.string().min(8).max(80), ref: z.string().max(64).optional(), campaign: z.string().max(120).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (await overPublicLimit(req.headers, "visit")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Missing visitor key"), CORS);
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true, user: { select: { supabaseId: true } } } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  await upsertStoreVisitor({ storeId: store.id, visitorKey: parsed.data.visitorKey });
  if (!isBotUserAgent(req.headers.get("user-agent"))) {
    const source = normalizeSource(parsed.data.ref);
    await recordStoreMetric(store.id, "visit", { channel: source, campaign: normalizeCampaign(parsed.data.campaign) });
    if (!(await isStoreOwner(req, store.user?.supabaseId))) {
      after(() => alertStoreVisit({ storeId: store.id, source }).catch((error) => console.error("[visit] seller alert failed", error)));
    }
  }
  return withCors(req, ok({ counted: true }), CORS);
}

/** The seller looking at their own store (signed in on this domain): no "someone is on your store" for that. */
async function isStoreOwner(req: NextRequest, ownerSupabaseId: string | null | undefined) {
  if (!ownerSupabaseId || !req.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))) return false;
  const supabase = await getSupabaseServerClient().catch(() => null);
  const { data } = (await supabase?.auth.getUser().catch(() => null)) ?? { data: null };
  return data?.user?.id === ownerSupabaseId;
}
