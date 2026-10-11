import { z } from "zod";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { scheduleCampaign, sendCampaign, testSendCampaign, unscheduleCampaign, updateCampaign } from "@/lib/marketing/campaigns";
import { MarketingError } from "@/lib/marketing/segments";
import { CampaignSchema } from "../../schemas";

// Sending a large audience runs inside this request.
export const maxDuration = 300;

export const PATCH = marketingRoute(async ({ req, store, params }) => {
  const input = await readBody(req, CampaignSchema.partial());
  return ok(await updateCampaign(store.id, params.id, input));
});

export const DELETE = marketingRoute(async ({ store, params }) => {
  const campaign = await db.broadcastCampaign.findFirst({ where: { id: params.id, storeId: store.id }, select: { status: true } });
  if (!campaign) throw new MarketingError("Campaign not found");
  if (campaign.status === "sending") throw new MarketingError("This campaign is sending right now");
  await db.broadcastCampaign.delete({ where: { id: params.id } });
  return ok({ deleted: true });
});

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("schedule"), scheduledAt: z.string().min(10).max(40) }),
  z.object({ action: z.literal("unschedule") }),
  z.object({ action: z.literal("test") }),
]);

/** Parses a datetime-local value (no timezone) as Lagos time (WAT, UTC+1); ISO strings with a zone pass through. */
function lagosTime(value: string) {
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value);
  return new Date(local ? `${value.length === 16 ? `${value}:00` : value}+01:00` : value);
}

export const POST = marketingRoute(async ({ req, user, store, params }) => {
  const input = await readBody(req, ActionSchema);
  switch (input.action) {
    case "send": {
      const result = await sendCampaign(store.id, params.id);
      if (!result.ok) throw new MarketingError(result.error);
      return ok(result);
    }
    case "schedule":
      return ok(await scheduleCampaign(store.id, params.id, lagosTime(input.scheduledAt)));
    case "unschedule":
      return ok(await unscheduleCampaign(store.id, params.id));
    case "test": {
      const me = await db.user.findUnique({ where: { id: user.id }, select: { email: true, phone: true } });
      return ok(await testSendCampaign(store.id, params.id, { email: me?.email ?? user.email, phone: me?.phone ?? null }));
    }
  }
});
