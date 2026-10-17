import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute } from "@/lib/marketing/api";
import { listAutomations } from "@/lib/marketing/automations";
import { channelStatus } from "@/lib/marketing/channels";
import { FLOW_PRESETS } from "@/lib/marketing/flows";

export const dynamic = "force-dynamic";

// Automations for the mobile app (the web's /home/automations reads these on the server): every flow with its
// steps and its numbers, the ready-made ones to add, the last-30-days totals and which channels can send.
// Switching on/off and saving use PATCH /api/app/marketing/automations/:id; adding uses POST /api/app/marketing/automations.
export const GET = marketingRoute(async ({ store }) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [flows, channels, started30] = await Promise.all([
    listAutomations(store.id, since),
    channelStatus(store.id),
    db.automationEnrollment.count({ where: { storeId: store.id, createdAt: { gte: since } } }).catch(() => 0),
  ]);
  return ok({
    flows: flows.map((flow) => ({ ...flow, lastTriggeredAt: flow.lastTriggeredAt?.toISOString() ?? null })),
    presets: FLOW_PRESETS.map((preset) => ({ key: preset.key, name: preset.name, description: preset.description, trigger: preset.trigger })),
    totals: { started30, sent30: flows.reduce((sum, flow) => sum + flow.sent30d, 0), inFlow: flows.reduce((sum, flow) => sum + flow.inFlow, 0) },
    channels: { email: channels.email.ready, sms: channels.sms.ready, whatsapp: channels.whatsapp.ready, whatsappTemplates: Boolean(channels.whatsapp.templates) },
  });
});
