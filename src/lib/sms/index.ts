import "server-only";

import { africastalking } from "./africastalking";
import { brevo } from "./brevo";
import { bulksmsnigeria } from "./bulksmsnigeria";
import { isSmsProvider, platformProviderOrder, SMS_PROVIDER_LABELS, termiiBaseUrl, type SendOutcome, type SmsProviderKey } from "./pure";
import { sendchamp } from "./sendchamp";
import { termii } from "./termii";
import type { SmsCredentials, SmsProvider } from "./types";

// SMS for the whole app (Termii, Africa's Talking, Sendchamp, Brevo, BulkSMS Nigeria; never Twilio). Two ways in:
//   - the platform's own account(s) from env, for OTP, notifications, marketing and review requests, tried in
//     SMS_PROVIDER order with every other configured provider as a fallback when one errors;
//   - a store's own account connected in Inbox › Channels (credentials decrypted by the inbox), so customers'
//     replies land in that store's inbox.

export const SMS_PROVIDER_MODULES: Record<SmsProviderKey, SmsProvider> = { termii, africastalking, sendchamp, brevo, bulksmsnigeria };

export function smsProvider(key: unknown): SmsProvider | null {
  return isSmsProvider(key) ? SMS_PROVIDER_MODULES[key] : null;
}

/** Platform keys for one provider, from env. */
export function platformCredentials(key: SmsProviderKey, env: Record<string, string | undefined> = process.env): SmsCredentials {
  switch (key) {
    case "termii":
      return { provider: key, apiKey: env.TERMII_API_KEY ?? "", senderId: env.TERMII_SENDER_ID || undefined, route: env.TERMII_CHANNEL || "dnd", secretKey: env.TERMII_SECRET_KEY || undefined, baseUrl: termiiBaseUrl(env.TERMII_BASE_URL) ?? undefined };
    case "africastalking":
      return { provider: key, apiKey: env.AFRICASTALKING_API_KEY ?? "", username: env.AFRICASTALKING_USERNAME ?? "", senderId: env.AFRICASTALKING_SENDER_ID || undefined };
    case "sendchamp":
      return { provider: key, apiKey: env.SENDCHAMP_API_KEY ?? "", senderId: env.SENDCHAMP_SENDER_NAME || undefined, route: env.SENDCHAMP_ROUTE || "dnd" };
    case "brevo":
      return { provider: key, apiKey: env.BREVO_API_KEY ?? "", senderId: env.BREVO_SMS_SENDER || undefined };
    case "bulksmsnigeria":
      return { provider: key, apiKey: env.BULKSMSNIGERIA_API_TOKEN ?? "", senderId: env.BULKSMSNIGERIA_SENDER_ID || undefined, route: env.BULKSMSNIGERIA_GATEWAY || undefined };
  }
}

export function platformSmsProviders() {
  return platformProviderOrder(process.env);
}

export function platformSmsReady() {
  return platformSmsProviders().length > 0;
}

/** "Termii (then Africa's Talking)" for status lines. */
export function platformSmsLabel() {
  const order = platformSmsProviders();
  if (!order.length) return null;
  return order.length === 1 ? SMS_PROVIDER_LABELS[order[0]] : `${SMS_PROVIDER_LABELS[order[0]]} (then ${order.slice(1).map((k) => SMS_PROVIDER_LABELS[k]).join(", ")})`;
}

export type PlatformSendOutcome = (SendOutcome & { provider: SmsProviderKey | null }) & { attempts?: Array<{ provider: SmsProviderKey; error: string }> };

/**
 * Sends from the platform account, trying each configured provider in order until one accepts.
 * senderId overrides the env sender ID for this message only.
 */
export async function sendPlatformSms(input: { to: string[]; body: string; senderId?: string | null }): Promise<PlatformSendOutcome> {
  const order = platformSmsProviders();
  if (!order.length) return { ok: false, error: "SMS isn't set up (no SMS_PROVIDER keys).", provider: null };
  const attempts: Array<{ provider: SmsProviderKey; error: string }> = [];
  for (const key of order) {
    const credentials = platformCredentials(key);
    if (input.senderId) credentials.senderId = input.senderId;
    const result = await SMS_PROVIDER_MODULES[key].send(credentials, { to: input.to, body: input.body }).catch((error: Error) => ({ ok: false as const, error: error.message || "send failed" }));
    if (result.ok) return { ...result, provider: key, attempts };
    attempts.push({ provider: key, error: result.error });
    console.warn(`[sms] ${key} failed, ${attempts.length < order.length ? "trying the next provider" : "no providers left"}:`, result.error);
  }
  return { ok: false, error: attempts.map((a) => a.error).join(" / ").slice(0, 300), provider: null, attempts };
}

/** Sends from a store's own connected account (Inbox › Channels › SMS). */
export async function sendStoreSms(credentials: Record<string, string>, input: { to: string; body: string }): Promise<SendOutcome> {
  const provider = smsProvider(credentials.provider);
  if (!provider) return { ok: false, error: "SMS needs reconnecting. Open Inbox › Channels and connect Termii, Africa's Talking or Sendchamp." };
  return provider.send(credentials as unknown as SmsCredentials, { to: [input.to], body: input.body });
}

export { SMS_PROVIDER_LABELS, isSmsProvider } from "./pure";
export type { SmsProviderKey } from "./pure";
export type { SmsCredentials, SmsProvider } from "./types";
