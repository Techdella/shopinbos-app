import "server-only";

import { getChannel } from "@/lib/inbox/service";
import { sendSmsReply } from "@/lib/inbox/channels/sms";
import { sendWhatsApp, sendWhatsAppTemplateMessage } from "@/lib/inbox/channels/whatsapp";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { sendWhatsAppMessage } from "@/lib/notifications/service";
import { platformSmsLabel, platformSmsReady, sendPlatformSms, SMS_PROVIDER_LABELS, isSmsProvider } from "@/lib/sms";

// Where marketing SMS and WhatsApp messages go out. The store's own connected number (Inbox > Channels:
// Termii / Africa's Talking / Sendchamp for SMS, WhatsApp Cloud API) is preferred so replies land in the inbox;
// otherwise the platform's SMS account from the environment (SMS_PROVIDER order, with failover). Nothing is reported sent unless the provider
// accepted it. WhatsApp templates (campaigns, template steps, order messages) need the store's own WhatsApp
// Business Account, since templates belong to it.

export type MarketingChannel = "email" | "sms" | "whatsapp";

export interface ChannelStatus {
  ready: boolean;
  via: string | null;
  /** What to do when it isn't ready. */
  howTo: string;
  /** Where in the app to fix it. */
  connectHref: string | null;
  connectLabel: string | null;
  /** WhatsApp only: approved templates can be managed and sent (the store's own WABA is connected). */
  templates?: boolean;
}

export const WHATSAPP_CONNECT_HREF = "/home/inbox/chatbot?tab=whatsapp";

const platformSms = () => platformSmsReady();
const ownSmsLabel = (provider: unknown) => (isSmsProvider(provider) ? SMS_PROVIDER_LABELS[provider] : "SMS");
const platformWhatsApp = () => Boolean(process.env.SENDCHAMP_API_KEY);

export async function channelStatus(storeId: string): Promise<Record<MarketingChannel, ChannelStatus>> {
  const [sms, whatsapp] = await Promise.all([getChannel(storeId, "sms").catch(() => null), getChannel(storeId, "whatsapp").catch(() => null)]);
  const settings = (whatsapp?.row.settings ?? {}) as Record<string, unknown>;
  const waba = Boolean(whatsapp && (whatsapp.credentials.wabaId || (typeof settings.wabaId === "string" && settings.wabaId)));
  return {
    email: {
      ready: isEmailConfigured(),
      via: isEmailConfigured() ? "Resend" : null,
      howTo: "Email isn't switched on yet. It will work here by itself once it is.",
      connectHref: null,
      connectLabel: null,
    },
    sms: {
      ready: Boolean(sms) || platformSms(),
      via: sms ? `Your ${ownSmsLabel(sms.credentials.provider)} account${sms.row.displayName ? ` (${sms.row.displayName})` : ""}` : platformSmsLabel(),
      // Texts go through Shopinbos's own SMS account (SMS_PROVIDER), so there is nothing for the seller to connect.
      howTo: "Text messages aren't switched on yet. They'll work here by themselves once they are; nothing to connect.",
      connectHref: null,
      connectLabel: null,
    },
    whatsapp: {
      ready: Boolean(whatsapp) || platformWhatsApp(),
      via: whatsapp ? `Your WhatsApp Business number${whatsapp.row.displayName ? ` (${whatsapp.row.displayName})` : ""}` : platformWhatsApp() ? "SendChamp (replies only within 24 hours, no templates)" : null,
      howTo: whatsapp
        ? waba
          ? "Ready."
          : "Connect WhatsApp again (one tap) so you can send message templates."
        : "Connect your WhatsApp Business number (one tap) to send WhatsApp messages.",
      connectHref: WHATSAPP_CONNECT_HREF,
      connectLabel: whatsapp ? "WhatsApp settings" : "Connect WhatsApp",
      templates: waba,
    },
  };
}

export type SendOutcome = { ok: true; externalId: string | null } | { ok: false; error: string };

type StoreRef = { id: string; name: string; slug: string };

/**
 * One sender for a whole campaign or flow run: the store's channels are looked up (and decrypted) once.
 * `senderId` overrides the SMS sender ID for these messages.
 */
export async function textSender(store: StoreRef, options: { senderId?: string | null } = {}) {
  const [sms, whatsapp] = await Promise.all([getChannel(store.id, "sms").catch(() => null), getChannel(store.id, "whatsapp").catch(() => null)]);
  const senderId = options.senderId?.trim() || null;
  return {
    hasOwnWhatsApp: Boolean(whatsapp),
    async sms(to: string, body: string): Promise<SendOutcome> {
      if (sms) {
        const credentials = senderId ? { ...sms.credentials, senderId } : sms.credentials;
        const result = await sendSmsReply({ to, body, store, credentials });
        return result.ok ? { ok: true, externalId: result.externalId } : { ok: false, error: result.error };
      }
      if (!platformSms()) return { ok: false, error: "SMS isn't set up" };
      const result = await sendPlatformSms({ to: [to], body, senderId });
      return result.ok ? { ok: true, externalId: result.externalId } : { ok: false, error: result.error || "The SMS provider rejected it" };
    },
    /** Free-form WhatsApp: only delivered within 24 hours of the customer's last message. */
    async whatsappText(to: string, body: string): Promise<SendOutcome> {
      if (whatsapp) {
        const result = await sendWhatsApp({ to, body, store, credentials: whatsapp.credentials });
        return result.ok ? { ok: true, externalId: result.externalId } : { ok: false, error: result.error };
      }
      if (!platformWhatsApp()) return { ok: false, error: "WhatsApp isn't set up" };
      const result = await sendWhatsAppMessage({ to: [to], message: body });
      return result.success ? { ok: true, externalId: null } : { ok: false, error: result.message || "The WhatsApp provider rejected it" };
    },
    /** An approved template from the store's own WhatsApp Business Account. */
    async whatsappTemplate(to: string, message: Record<string, unknown>): Promise<SendOutcome> {
      if (!whatsapp) return { ok: false, error: "WhatsApp isn't set up: connect your WhatsApp Business number in Inbox › Chatbot › WhatsApp" };
      const result = await sendWhatsAppTemplateMessage(whatsapp.credentials, to, message);
      return result.ok ? { ok: true, externalId: result.externalId } : { ok: false, error: result.error };
    },
  };
}

export type TextSender = Awaited<ReturnType<typeof textSender>>;

/** One free-form SMS or WhatsApp message (test sends, legacy flow steps). */
export async function sendMarketingText(store: StoreRef, channel: "sms" | "whatsapp", to: string, body: string, options: { senderId?: string | null } = {}): Promise<SendOutcome> {
  const sender = await textSender(store, options);
  return channel === "sms" ? sender.sms(to, body) : sender.whatsappText(to, body);
}

/** Meta's "this person stopped marketing messages" (131050) is our cue to record the opt-out. */
export function isMarketingOptOutError(error: string) {
  return /stopped marketing messages/i.test(error);
}
