import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { channelStatus } from "@/lib/marketing/channels";
import { getMessagingSettings, updateMessagingSettings } from "@/lib/marketing/messaging-settings";
import { MessagingSettingsSchema } from "../schemas";

// SMS sender ID, SMS price per segment, and which order/cart messages go to customers by WhatsApp or SMS.
export const GET = marketingRoute(async ({ store }) => {
  const [settings, channels] = await Promise.all([getMessagingSettings(store.id), channelStatus(store.id)]);
  return ok({ settings, channels: { sms: channels.sms, whatsapp: channels.whatsapp } });
});

export const PUT = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, MessagingSettingsSchema);
  return ok(await updateMessagingSettings(store.id, input));
});
