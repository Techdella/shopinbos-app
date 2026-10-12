import "server-only";

import { getChannel } from "@/lib/inbox/service";
import { sendSmsReply } from "@/lib/inbox/channels/sms";
import { sendWhatsApp } from "@/lib/inbox/channels/whatsapp";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { sendSms, sendWhatsAppMessage } from "@/lib/notifications/service";
import { platformSmsLabel, platformSmsReady, SMS_PROVIDER_LABELS, isSmsProvider } from "@/lib/sms";

// Where marketing SMS and WhatsApp messages go out. The store's own connected number (Inbox > Channels:
// Termii / Africa's Talking / Sendchamp for SMS, WhatsApp Cloud API) is preferred so replies land in the inbox;
// otherwise the platform's SMS account from the environment (SMS_PROVIDER order, with failover). Nothing is reported sent unless the provider
// accepted it.

export type MarketingChannel = "email" | "sms" | "whatsapp";

export interface ChannelStatus {
  ready: boolean;
  via: string | null;
  /** What to do when it isn't ready. */
  howTo: string;
}

const platformSms = () => platformSmsReady();
const ownSmsLabel = (provider: unknown) => (isSmsProvider(provider) ? SMS_PROVIDER_LABELS[provider] : "SMS");
const platformWhatsApp = () => Boolean(process.env.SENDCHAMP_API_KEY);

export async function channelStatus(storeId: string): Promise<Record<MarketingChannel, ChannelStatus>> {
  const [sms, whatsapp] = await Promise.all([getChannel(storeId, "sms").catch(() => null), getChannel(storeId, "whatsapp").catch(() => null)]);
  return {
    email: {
      ready: isEmailConfigured(),
      via: isEmailConfigured() ? "Resend" : null,
      howTo: "Email needs RESEND_API_KEY (and RESEND_FROM_EMAIL on a domain verified in Resend) in the app environment.",
    },
    sms: {
      ready: Boolean(sms) || platformSms(),
      via: sms ? `Your ${ownSmsLabel(sms.credentials.provider)} account${sms.row.displayName ? ` (${sms.row.displayName})` : ""}` : platformSmsLabel(),
      howTo: "Connect your Termii, Africa's Talking or Sendchamp account in Inbox › Channels, or set SMS_PROVIDER with its keys (TERMII_API_KEY, AFRICASTALKING_API_KEY + AFRICASTALKING_USERNAME or SENDCHAMP_API_KEY).",
    },
    whatsapp: {
      ready: Boolean(whatsapp) || platformWhatsApp(),
      via: whatsapp ? `Your WhatsApp Business number${whatsapp.row.displayName ? ` (${whatsapp.row.displayName})` : ""}` : platformWhatsApp() ? "SendChamp" : null,
      howTo: "Connect WhatsApp Business (Cloud API) in Inbox, or set SENDCHAMP_API_KEY with a WhatsApp sender.",
    },
  };
}

export type SendOutcome = { ok: true } | { ok: false; error: string };

export async function sendMarketingText(
  store: { id: string; name: string; slug: string },
  channel: "sms" | "whatsapp",
  to: string,
  body: string,
): Promise<SendOutcome> {
  const own = await getChannel(store.id, channel).catch(() => null);
  if (own) {
    const result = channel === "sms"
      ? await sendSmsReply({ to, body, store, credentials: own.credentials })
      : await sendWhatsApp({ to, body, store, credentials: own.credentials });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }
  if (channel === "sms") {
    if (!platformSms()) return { ok: false, error: "SMS isn't set up" };
    const result = await sendSms({ to: [to], message: body });
    return result.success ? { ok: true } : { ok: false, error: result.message || "The SMS provider rejected it" };
  }
  if (!platformWhatsApp()) return { ok: false, error: "WhatsApp isn't set up" };
  const result = await sendWhatsAppMessage({ to: [to], message: body });
  return result.success ? { ok: true } : { ok: false, error: result.message || "The WhatsApp provider rejected it" };
}
