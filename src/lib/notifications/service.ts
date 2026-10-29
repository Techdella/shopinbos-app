import "server-only";

import { platformSmsProviders, sendPlatformSms } from "@/lib/sms";
import { metaWhatsAppConfig, sendMetaTemplate, sendMetaText } from "@/lib/lead-growth/whatsapp-meta.server";
import { createProvider } from "./factory";
import type { NotificationProvider } from "./provider";
import type {
  ProviderName,
  SmsOptions,
  VoiceOptions,
  WhatsAppTextOptions,
  WhatsAppTemplateOptions,
  OtpOptions,
  OtpVerifyOptions,
  SendResult,
  OtpResult,
} from "./types";

function getEnvConfig(): {
  provider: ProviderName;
  config: { username?: string; apiKey: string; sandbox?: boolean; defaultSenderName?: string };
} | null {
  const atApiKey = process.env.AFRICASTALKING_API_KEY;
  const atUsername = process.env.AFRICASTALKING_USERNAME;
  const scApiKey = process.env.SENDCHAMP_API_KEY;

  if (atApiKey && atUsername) {
    return {
      provider: "africastalking",
      config: {
        username: atUsername,
        apiKey: atApiKey,
        sandbox: process.env.AFRICASTALKING_SANDBOX === "true",
      },
    };
  }

  if (scApiKey) {
    return {
      provider: "sendchamp",
      config: {
        apiKey: scApiKey,
        defaultSenderName: process.env.SENDCHAMP_SENDER_NAME ?? "Shopinbos",
      },
    };
  }

  return null;
}

/** True when our own WhatsApp number is connected (WhatsApp Cloud API). WhatsApp goes nowhere else. */
export function platformWhatsAppReady() {
  return metaWhatsAppConfig() !== null;
}

function getProviderInstance(): NotificationProvider | null {
  const env = getEnvConfig();
  if (!env) return null;
  return createProvider(env.provider, env.config);
}

/**
 * Platform SMS (notifications, OTP fallbacks, marketing, review requests). Goes through src/lib/sms, which tries
 * SMS_PROVIDER first and every other configured provider (Termii, Africa's Talking, Sendchamp) if it errors.
 */
export async function sendSms(options: SmsOptions): Promise<SendResult> {
  const result = await sendPlatformSms({ to: options.to, body: options.message, senderId: options.senderName ?? null });
  const provider = (result.provider ?? platformSmsProviders()[0] ?? "termii") as ProviderName;
  return result.ok
    ? { success: true, provider, message: "SMS sent successfully", providerResponse: { messageId: result.externalId } }
    : { success: false, provider, message: result.error, providerResponse: result.attempts };
}

export async function sendVoice(options: VoiceOptions): Promise<SendResult> {
  const provider = getProviderInstance();
  if (!provider) {
    return { success: false, provider: "sendchamp", message: "No provider configured" };
  }
  if (!provider.sendVoice) {
    return { success: false, provider: provider.name as ProviderName, message: "Voice not supported by this provider" };
  }
  return provider.sendVoice(options);
}

const NOT_CONNECTED = "WhatsApp Cloud isn't connected (WHATSAPP_LEADS_* or WHATSAPP_OTP_* keys)";

/**
 * Platform WhatsApp, always through WhatsApp Cloud (our own number on Meta's Cloud API), never Sendchamp or Africa's
 * Talking. Free text only reaches people who messaged the number in the last 24 hours; use a template otherwise.
 */
export async function sendWhatsAppMessage(options: WhatsAppTextOptions): Promise<SendResult> {
  const config = metaWhatsAppConfig();
  if (!config) return { success: false, provider: "meta", message: NOT_CONNECTED };
  const results = await Promise.all(options.to.map((to) => sendMetaText(config, { to, text: options.message })));
  const failed = results.find((result) => !result.ok);
  return failed && !failed.ok
    ? { success: false, provider: "meta", message: failed.error, providerResponse: results }
    : { success: true, provider: "meta", message: "WhatsApp message sent", providerResponse: results };
}

/** An approved template on WhatsApp Cloud. Numbered parameters ("1", "2", …) fill {{1}}, {{2}}, … in order. */
export async function sendWhatsAppTemplate(options: WhatsAppTemplateOptions): Promise<SendResult> {
  const config = metaWhatsAppConfig();
  if (!config) return { success: false, provider: "meta", message: NOT_CONNECTED };
  const params = Object.keys(options.parameters)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => options.parameters[key]);
  const results = await Promise.all(options.to.map((to) => sendMetaTemplate(config, { to, template: options.templateName, language: options.language ?? "en", params })));
  const failed = results.find((result) => !result.ok);
  return failed && !failed.ok
    ? { success: false, provider: "meta", message: failed.error, providerResponse: results }
    : { success: true, provider: "meta", message: "WhatsApp template sent", providerResponse: results };
}

export async function sendOtp(options: OtpOptions): Promise<OtpResult> {
  const provider = getProviderInstance();
  if (!provider) {
    return { success: false, message: "No provider configured" };
  }
  if (!provider.sendOtp) {
    return { success: false, message: "OTP not supported by this provider" };
  }
  return provider.sendOtp(options);
}

export async function verifyOtp(options: OtpVerifyOptions): Promise<OtpResult> {
  const provider = getProviderInstance();
  if (!provider) {
    return { success: false, message: "No provider configured" };
  }
  if (!provider.verifyOtp) {
    return { success: false, message: "OTP verification not supported by this provider" };
  }
  return provider.verifyOtp(options);
}
