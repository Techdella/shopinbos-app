import "server-only";
import { WINDOW_CLOSED_ERROR } from "../whatsapp-bot";
import { GRAPH_URL, providerError, readJson, type SendInput, type SendResult } from "./types";

// WhatsApp Cloud API (Meta). Credentials: accessToken (a System User token with whatsapp_business_messaging, or
// the business token from Embedded Signup), phoneNumberId, optional wabaId, optional appSecret (else
// META_APP_SECRET) for webhook signatures. Free-form replies (text, lists, buttons) only reach the customer within
// 24 hours of their last message; after that Meta accepts approved templates only, which we don't send.

export const TOKEN_ERROR = "Your WhatsApp token stopped working (expired or revoked). Reconnect WhatsApp in Inbox → Channels.";

/** Meta's error codes → what the seller should do. https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes */
export function whatsappError(json: Record<string, unknown>, fallback: string) {
  const error = (json.error ?? {}) as { code?: number; error_subcode?: number };
  switch (Number(error.code)) {
    case 190:
      return TOKEN_ERROR;
    case 131047:
      return WINDOW_CLOSED_ERROR;
    case 131030:
      return "This number isn't on your Meta app's allowed list. While the app is in development, add it under WhatsApp → API Setup → To.";
    case 131026:
      return "WhatsApp couldn't deliver to this number (not on WhatsApp, or an old app version).";
    case 131056:
      return "Too many messages to this customer in a short time. Wait a minute and try again.";
    case 130429:
    case 80007:
      return "WhatsApp's sending limit was reached. Try again in a few minutes.";
    case 131042:
      return "Meta couldn't charge your WhatsApp account. Add a payment method in WhatsApp Manager.";
    case 131031:
    case 368:
      return "Meta has restricted this WhatsApp account. Check WhatsApp Manager → Account quality.";
    case 133010:
      return "This phone number isn't registered with the WhatsApp Cloud API yet. Finish setup in WhatsApp Manager, then try again.";
    default:
      return providerError(json, fallback);
  }
}

async function post(phoneNumberId: string, accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => error);
  if (res instanceof Error) return { res: null, json: {} as Record<string, unknown> };
  return { res, json: await readJson(res) };
}

export async function sendWhatsApp(input: SendInput): Promise<SendResult> {
  const { accessToken, phoneNumberId } = input.credentials;
  if (!accessToken || !phoneNumberId) return { ok: false, error: "WhatsApp isn't connected." };
  const to = input.to.replace(/^\+/, "");
  const payload = input.interactive
    ? { recipient_type: "individual", to, type: "interactive", interactive: input.interactive }
    : { recipient_type: "individual", to, type: "text", text: { preview_url: true, body: input.body.slice(0, 4096) } };
  const { res, json } = await post(phoneNumberId, accessToken, payload);
  if (!res) return { ok: false, error: "Couldn't reach WhatsApp. Try again." };
  if (!res.ok) return { ok: false, error: whatsappError(json, "WhatsApp didn't accept the message.") };
  const id = (json.messages as Array<{ id?: string }> | undefined)?.[0]?.id ?? null;
  return { ok: true, externalId: id };
}

/** Blue ticks on the customer's message (Peggy read it). Best effort. */
export async function markWhatsAppRead(credentials: Record<string, string>, messageId: string | null | undefined) {
  if (!credentials.accessToken || !credentials.phoneNumberId || !messageId) return;
  await post(credentials.phoneNumberId, credentials.accessToken, { status: "read", message_id: messageId }).catch(() => null);
}

/** Checks a token and phone number id before saving them; returns the number's display name. */
export async function verifyWhatsApp(credentials: Record<string, string>): Promise<{ ok: true; displayName: string; phone: string | null; qualityRating: string | null } | { ok: false; error: string }> {
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Meta to check the token." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: whatsappError(json, "Meta rejected the token or phone number id.") };
  const phone = typeof json.display_phone_number === "string" ? json.display_phone_number : null;
  return {
    ok: true,
    displayName: [json.verified_name, json.display_phone_number].filter(Boolean).join(" · ") || "WhatsApp number",
    phone,
    qualityRating: typeof json.quality_rating === "string" ? json.quality_rating : null,
  };
}

/** Subscribes our app to the business account so Meta sends this number's messages to the webhook. */
export async function subscribeWaba(wabaId: string, accessToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Meta to subscribe your WhatsApp account to messages." };
  if (res.ok) return { ok: true };
  return { ok: false, error: `Messages may not arrive: ${whatsappError(await readJson(res), "Meta didn't subscribe the app to your WhatsApp account.")}` };
}

/** Whether any app is subscribed to the WABA's webhooks (null when we can't tell). */
export async function wabaSubscribed(wabaId: string, accessToken: string): Promise<boolean | null> {
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(wabaId)}/subscribed_apps`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return null;
  const json = await readJson(res);
  return Array.isArray(json.data) ? json.data.length > 0 : null;
}

/** When the token expires: a Date, "never" (System User / business tokens), or null when Meta won't say. */
export async function whatsappTokenExpiry(accessToken: string): Promise<Date | "never" | null> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  // An app token inspects any token; without one, a token can usually inspect itself.
  const inspector = appId && appSecret ? `${appId}|${appSecret}` : accessToken;
  const url = `${GRAPH_URL}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(inspector)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return null;
  const data = ((await readJson(res)).data ?? {}) as { expires_at?: number; is_valid?: boolean };
  if (data.is_valid === false) return new Date(0);
  if (data.expires_at === 0) return "never";
  return typeof data.expires_at === "number" ? new Date(data.expires_at * 1000) : null;
}

// ─── Embedded Signup (Shopinbos as a Tech Provider) ──────────────────────────

/** The browser needs the app id and the Embedded Signup configuration id; the secret stays here. */
export function embeddedSignupConfig(): { appId: string; configId: string } | null {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID;
  return appId && configId && process.env.META_APP_SECRET ? { appId, configId } : null;
}

/** Exchanges the 30-second code from FB.login for the customer's business token. */
export async function exchangeSignupCode(code: string): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, error: "WhatsApp sign-up isn't set up on this server (META_APP_ID / META_APP_SECRET)." };
  const url = `${GRAPH_URL}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Meta to finish sign-up. Try again." };
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Meta's docs say the token may come back as plain text.
    if (res.ok && /^[A-Za-z0-9|_-]{20,}$/.test(text.trim())) return { ok: true, accessToken: text.trim() };
  }
  if (!res.ok || typeof json.access_token !== "string") return { ok: false, error: whatsappError(json, "Meta didn't accept the sign-up. Start again.") };
  return { ok: true, accessToken: json.access_token };
}

/** Registers a new number with the Cloud API, setting its two-step verification PIN. "Already registered" is fine. */
export async function registerWhatsAppNumber(phoneNumberId: string, accessToken: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(phoneNumberId)}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    signal: AbortSignal.timeout(20_000),
  }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Meta to register the number." };
  if (res.ok) return { ok: true };
  const json = await readJson(res);
  const message = providerError(json, "");
  if (/already registered/i.test(message)) return { ok: true };
  return { ok: false, error: whatsappError(json, "Meta couldn't register the number.") };
}
