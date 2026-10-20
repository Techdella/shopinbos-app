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
// Set up with AUTH_OTP_WHATSAPP=1 and a WhatsApp-capable platform provider (see .env.local.example):
//   Termii     TERMII_API_KEY + a WhatsApp sender (AUTH_OTP_WHATSAPP_SENDER, else TERMII_SENDER_ID): the code goes as a
//              plain message on Termii's "whatsapp" channel.
//   Sendchamp  SENDCHAMP_API_KEY + AUTH_OTP_WHATSAPP_SENDER (the business WhatsApp number) + an approved
//              authentication template (AUTH_OTP_WHATSAPP_TEMPLATE): WhatsApp only lets a business start a chat
//              with a template.
//   Meta       Shopinbos's own WhatsApp Business number on the Cloud API: WHATSAPP_OTP_PHONE_NUMBER_ID +
//              WHATSAPP_OTP_TOKEN (a System User token with whatsapp_business_messaging) + the approved
//              authentication template's name in AUTH_OTP_WHATSAPP_TEMPLATE (copy-code button; create it with
//              scripts/create-whatsapp-otp-template.mjs). AUTH_OTP_WHATSAPP_TEMPLATE_LANG (default "en").
// AUTH_OTP_WHATSAPP_PROVIDER picks one when several are set (default: SMS_PROVIDER order, then Termii, Sendchamp, Meta).

export type CodeChannel = "whatsapp" | "sms";
export type WhatsAppCodeProvider = "termii" | "sendchamp" | "meta";

type Env = Record<string, string | undefined>;

export interface WhatsAppCodeConfig {
  provider: WhatsAppCodeProvider;
  apiKey: string;
  /** Termii: the WhatsApp sender/device name. Sendchamp: the business WhatsApp number (digits). */
  sender: string;
  /** Sendchamp only: the approved authentication template's code. */
  template?: string;
  /** Sendchamp only: the template variable that holds the code ("1" for {{1}}). */
  templateParam?: string;
  /** Termii base URL from its dashboard. */
  baseUrl?: string;
  /** Meta only: the template's language code ("en"), and the Graph API version. */
  language?: string;
  graphVersion?: string;
}

const on = (value: string | undefined) => /^(1|true|yes|on)$/i.test((value ?? "").trim());
const clean = (value: string | undefined) => (value ?? "").trim();

function termiiConfig(env: Env): WhatsAppCodeConfig | null {
  const apiKey = clean(env.TERMII_API_KEY);
  const sender = clean(env.AUTH_OTP_WHATSAPP_SENDER) || clean(env.TERMII_SENDER_ID);
  if (!apiKey || !sender) return null;
  return { provider: "termii", apiKey, sender, baseUrl: clean(env.TERMII_BASE_URL) || undefined };
}

function sendchampConfig(env: Env): WhatsAppCodeConfig | null {
  const apiKey = clean(env.SENDCHAMP_API_KEY);
  const sender = clean(env.AUTH_OTP_WHATSAPP_SENDER).replace(/[^\d]/g, "");
  const template = clean(env.AUTH_OTP_WHATSAPP_TEMPLATE);
  if (!apiKey || !sender || !template) return null;
  return { provider: "sendchamp", apiKey, sender, template, templateParam: clean(env.AUTH_OTP_WHATSAPP_TEMPLATE_PARAM) || "1" };
}

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

const PROVIDERS: WhatsAppCodeProvider[] = ["termii", "sendchamp", "meta"];
const isProvider = (value: string): value is WhatsAppCodeProvider => (PROVIDERS as string[]).includes(value);

/** Which WhatsApp providers to try, best first: AUTH_OTP_WHATSAPP_PROVIDER, then SMS_PROVIDER order, then the rest. */
function providerOrder(env: Env): WhatsAppCodeProvider[] {
  const names = `${clean(env.AUTH_OTP_WHATSAPP_PROVIDER)},${clean(env.SMS_PROVIDER)}`
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/[^a-z]/g, ""))
    .filter(isProvider);
  return Array.from(new Set<WhatsAppCodeProvider>([...names, ...PROVIDERS]));
}

/**
 * The WhatsApp code sender, or null when WhatsApp codes are off (AUTH_OTP_WHATSAPP is not 1) or no provider has
 * what it needs. Twilio is never used.
 */
export function whatsappCodeConfig(env: Env): WhatsAppCodeConfig | null {
  if (!on(env.AUTH_OTP_WHATSAPP)) return null;
  for (const provider of providerOrder(env)) {
    const config = provider === "termii" ? termiiConfig(env) : provider === "sendchamp" ? sendchampConfig(env) : metaConfig(env);
    if (config) return config;
  }
  return null;
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

/** Notes live this long: a code request and its hook call happen within seconds. */
export const CODE_CHANNEL_TTL_MS = 10 * 60 * 1000;

const digits = (value: string) => value.replace(/[^\d]/g, "");

/**
 * Termii POST {base}/api/sms/send on the WhatsApp channel. A plain message, so other codes (the checkout phone check)
 * can pass their own wording; Sendchamp and Meta send the approved template, which carries only the code.
 */
export function termiiWhatsAppRequest(config: WhatsAppCodeConfig, phone: string, otp: string, message: string = signInCodeMessage(otp)) {
  const base = (config.baseUrl || "https://v3.api.termii.com").replace(/\/+$/, "");
  return {
    url: `${base}/api/sms/send`,
    body: { api_key: config.apiKey, to: digits(phone), from: config.sender, sms: message, type: "plain", channel: "whatsapp" },
  };
}

/** Sendchamp POST /api/v1/whatsapp/message/send with the authentication template. */
export function sendchampWhatsAppRequest(config: WhatsAppCodeConfig, phone: string, otp: string) {
  return {
    url: "https://api.sendchamp.com/api/v1/whatsapp/message/send",
    body: {
      recipient: digits(phone),
      sender: config.sender,
      type: "template",
      template_code: config.template ?? "",
      custom_data: { body: { [config.templateParam || "1"]: otp } },
    },
  };
}

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

/** Did the provider take the WhatsApp message? Termii answers code "ok" / a message_id; Sendchamp status "success". */
export function readWhatsAppSend(provider: WhatsAppCodeProvider, httpOk: boolean, json: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
  if (provider === "termii") {
    if (httpOk && (text(json.code).toLowerCase() === "ok" || text(json.message_id) || text(json.message_id_str))) return { ok: true };
    return { ok: false, error: (text(json.message) || "Termii didn't send the WhatsApp message.").slice(0, 300) };
  }
  if (provider === "meta") {
    const messages = Array.isArray(json.messages) ? (json.messages as Record<string, unknown>[]) : [];
    if (httpOk && text(messages[0]?.id)) return { ok: true };
    const error = json.error && typeof json.error === "object" ? (json.error as Record<string, unknown>) : {};
    return { ok: false, error: (text(error.message) || "Meta didn't send the WhatsApp message.").slice(0, 300) };
  }
  const status = text(json.status).toLowerCase();
  if (httpOk && status !== "error" && status !== "failed") return { ok: true };
  return { ok: false, error: (text(json.message) || "Sendchamp didn't send the WhatsApp message.").slice(0, 300) };
}
