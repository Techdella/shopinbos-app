import { z } from "zod";
import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { channelStatus } from "@/lib/marketing/channels";
import { getMessagingSettings, updateMessagingSettings } from "@/lib/marketing/messaging-settings";
import { setUpWhatsAppOrderMessages } from "@/lib/marketing/order-messages-setup.server";
import { MarketingError } from "@/lib/marketing/segments";
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

// "Set up WhatsApp order messages": submits the ready-made order templates to Meta and switches the events on
// (also runs by itself when WhatsApp is connected).
export const POST = marketingRoute(async ({ req, store }) => {
  await readBody(req, z.object({ action: z.literal("setup_whatsapp") }).strict());
  const result = await setUpWhatsAppOrderMessages(store.id);
  if (!result.ok) throw new MarketingError(result.error ?? result.templates.find((t) => t.error)?.error ?? "Meta didn't accept the order message templates. Try again.");
  return ok({ ...result, settings: await getMessagingSettings(store.id) });
});
