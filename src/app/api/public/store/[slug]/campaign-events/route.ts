import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { CampaignEventsSchema } from "@/lib/store-campaigns/schemas";

// Storefront events for seasonal campaign reports, sent in small batches: page_view, block_view, block_click,
// popup_shown, popup_closed, popup_converted. Only counted for campaigns of this store that are live right now (never
// for previews or drafts). No personal data; rate-limited per address.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`campaign-events:${ip}`, { maxRequests: 30, windowMs: 60_000 }).allowed) return withCors(req, ok({ counted: 0 }), CORS);
  const parsed = CampaignEventsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Bad events"), CORS);
  const store = await db.store.findUnique({ where: { slug: (await params).slug }, select: { id: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const now = new Date();
  const ids = [...new Set(parsed.data.events.map((event) => event.campaignId))];
  const live = await db.storeCampaign.findMany({
    where: { id: { in: ids }, storeId: store.id, archivedAt: null, pausedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
    select: { id: true },
  });
  const allowed = new Set(live.map((campaign) => campaign.id));
  const rows = parsed.data.events
    .filter((event) => allowed.has(event.campaignId))
    .map((event) => ({ storeId: store.id, campaignId: event.campaignId, blockId: event.blockId ?? null, event: event.event, sessionId: parsed.data.sessionId || null }));
  if (rows.length) await db.storeCampaignEvent.createMany({ data: rows }).catch((error) => console.error("[campaign events] save failed", error));
  return withCors(req, ok({ counted: rows.length }), CORS);
}
