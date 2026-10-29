// Phone sign-in codes on WhatsApp, with SMS as the fallback: the pure parts (no imports, unit-tested in
// tests/auth-otp-channel.test.mjs). The server side is src/lib/auth/otp-delivery.server.ts.
//
// How a code travels:
//   1. POST /api/auth/otp { action: "send", phone, via } picks the channel to try (chooseCodeChannel) and notes it
//      for that phone, then asks Supabase for a code (always channel "sms": Supabase only does WhatsApp itself
//      through Twilio, which we never use).
//   2. Supabase calls our Send SMS hook (/api/webhooks/supabase-sms) with the phone and the code. The hook reads the
//      note and tries each step of deliveryPlan(): WhatsApp first when asked for and set up, then SMS. It notes the
//      channel that actually carried the code.
//   3. The send route answers { sent: true, channel } with that channel, so the screen says "Check your WhatsApp"
//      only when the code really went there, and "Check your messages" otherwise.
//
// Set up with AUTH_OTP_WHATSAPP=1 and Shopinbos's own WhatsApp Business number on WhatsApp Cloud (Meta's Cloud API):
// WHATSAPP_OTP_PHONE_NUMBER_ID + WHATSAPP_OTP_TOKEN (a System User token with whatsapp_business_messaging) + the
// approved authentication template's name in AUTH_OTP_WHATSAPP_TEMPLATE (copy-code button; create it with
// scripts/create-whatsapp-otp-template.mjs). AUTH_OTP_WHATSAPP_TEMPLATE_LANG (default "en"). WhatsApp never goes
// through an SMS provider (Termii, Sendchamp, Brevo): those carry the SMS fallback only.

export type CodeChannel = "whatsapp" | "sms";
export type WhatsAppCodeProvider = "meta";

type Env = Record<string, string | undefined>;

export interface WhatsAppCodeConfig {
  provider: WhatsAppCodeProvider;
  /** The System User token. */
  apiKey: string;
  /** The sending number's phone-number id (digits). */
  sender: string;
  /** The approved authentication template's name. */
  template?: string;
  /** The template's language code ("en"), and the Graph API version. */
  language?: string;
  graphVersion?: string;
}

const on = (value: string | undefined) => /^(1|true|yes|on)$/i.test((value ?? "").trim());
const clean = (value: string | undefined) => (value ?? "").trim();

function metaConfig(env: Env): WhatsAppCodeConfig | null {
  const apiKey = clean(env.WHATSAPP_OTP_TOKEN);
  const sender = clean(env.WHATSAPP_OTP_PHONE_NUMBER_ID).replace(/[^\d]/g, "");
  const template = clean(env.AUTH_OTP_WHATSAPP_TEMPLATE);
  if (!apiKey || !sender || !template) return null;
  return {
    provider: "meta",
    apiKey,
    sender,
    template,
    language: clean(env.AUTH_OTP_WHATSAPP_TEMPLATE_LANG) || "en",
    graphVersion: clean(env.META_GRAPH_VERSION) || "v21.0",
  };
}

/**
 * The WhatsApp code sender, or null when WhatsApp codes are off (AUTH_OTP_WHATSAPP is not 1) or WhatsApp Cloud
 * isn't set up. Twilio is never used.
 */
export function whatsappCodeConfig(env: Env): WhatsAppCodeConfig | null {
  if (!on(env.AUTH_OTP_WHATSAPP)) return null;
  // WhatsApp only goes through WhatsApp Cloud; Termii, Sendchamp and Brevo keys are for SMS.
  return metaConfig(env);
}

export function whatsappCodesAvailable(env: Env) {
  return whatsappCodeConfig(env) !== null;
}

/**
 * The channel to try first. "sms" (the "Send it by SMS" link) always means SMS. WhatsApp, or no preference from
 * an older client, means WhatsApp when it is set up, and SMS otherwise.
 */
export function chooseCodeChannel(requested: unknown, whatsappAvailable: boolean): CodeChannel {
  if (requested === "sms") return "sms";
  return whatsappAvailable ? "whatsapp" : "sms";
}

/** The order the hook tries: WhatsApp then SMS, or SMS only. */
export function deliveryPlan(wanted: CodeChannel | null | undefined, whatsappAvailable: boolean): CodeChannel[] {
  return wanted === "whatsapp" && whatsappAvailable ? ["whatsapp", "sms"] : ["sms"];
}

/**
 * What the send route reports. The hook's note of the channel used is the truth; with no note (the hook didn't run,
 * or couldn't save it) the code went by Supabase's SMS path, so "sms".
 */
export function reportedChannel(used: CodeChannel | null | undefined): CodeChannel {
  return used === "whatsapp" ? "whatsapp" : "sms";
}

export function signInCodeMessage(otp: string) {
  return `Your Shopinbos code is ${otp}. Don't share it with anyone.`;
}

/** The app's host for SMS auto-read (WebOTP's last line, "@app.shopinbos.com #123456"). */
export const WEB_OTP_HOST = "app.shopinbos.com";

/** The SMS version: the same words, plus the line that lets Android Chrome read the code into the sign-in page. */
export function signInCodeSms(otp: string) {
  return `${signInCodeMessage(otp)}\n\n@${WEB_OTP_HOST} #${otp}`;
}

/** Notes live this long: a code request and its hook call happen within seconds. */
export const CODE_CHANNEL_TTL_MS = 10 * 60 * 1000;

const digits = (value: string) => value.replace(/[^\d]/g, "");

/**
 * Meta Cloud API POST /{phone-number-id}/messages with the authentication template. Copy-code templates take the code
 * twice: in the body ({{1}}) and as the button's parameter.
 */
export function metaWhatsAppRequest(config: WhatsAppCodeConfig, phone: string, otp: string) {
  return {
    url: `https://graph.facebook.com/${config.graphVersion || "v21.0"}/${config.sender}/messages`,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: digits(phone),
      type: "template",
      template: {
        name: config.template ?? "",
        language: { code: config.language || "en" },
        components: [
          { type: "body", parameters: [{ type: "text", text: otp }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] },
        ],
      },
    },
  };
}

/** Did WhatsApp Cloud take the message? It answers with the message id, or an error object. */
export function readWhatsAppSend(_provider: WhatsAppCodeProvider, httpOk: boolean, json: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
  const messages = Array.isArray(json.messages) ? (json.messages as Record<string, unknown>[]) : [];
  if (httpOk && text(messages[0]?.id)) return { ok: true };
  const error = json.error && typeof json.error === "object" ? (json.error as Record<string, unknown>) : {};
  return { ok: false, error: (text(error.message) || "Meta didn't send the WhatsApp message.").slice(0, 300) };
}
