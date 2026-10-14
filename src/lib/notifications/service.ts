import "server-only";

import { platformSmsProviders, sendPlatformSms } from "@/lib/sms";
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

/** True when a WhatsApp-capable provider (Africa's Talking or Sendchamp) is set up for platform messages. */
export function platformWhatsAppReady() {
  return getEnvConfig() !== null;
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

export async function sendWhatsAppMessage(options: WhatsAppTextOptions): Promise<SendResult> {
  const provider = getProviderInstance();
  if (!provider) {
    return { success: false, provider: "sendchamp", message: "No provider configured" };
  }
  if (!provider.sendWhatsAppText) {
    return { success: false, provider: provider.name as ProviderName, message: "WhatsApp not supported by this provider" };
  }
  return provider.sendWhatsAppText(options);
}

export async function sendWhatsAppTemplate(options: WhatsAppTemplateOptions): Promise<SendResult> {
  const provider = getProviderInstance();
  if (!provider) {
    return { success: false, provider: "sendchamp", message: "No provider configured" };
  }
  if (!provider.sendWhatsAppTemplate) {
    return { success: false, provider: provider.name as ProviderName, message: "WhatsApp templates not supported by this provider" };
  }
  return provider.sendWhatsAppTemplate(options);
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
