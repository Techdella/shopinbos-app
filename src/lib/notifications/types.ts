export type ProviderName = "termii" | "africastalking" | "sendchamp" | "meta";

export type SmsRoute = "dnd" | "non_dnd" | "international";

export interface SmsOptions {
  to: string[];
  message: string;
  senderName?: string;
  route?: SmsRoute;
}

export interface VoiceOptions {
  to: string[];
  message: string;
}

export interface WhatsAppTextOptions {
  to: string[];
  message: string;
}

export interface WhatsAppTemplateOptions {
  to: string[];
  templateName: string;
  parameters: Record<string, string>;
  language?: string;
}

export interface OtpOptions {
  to: string[];
  length?: number;
  expiry?: number;
}

export interface OtpVerifyOptions {
  pinId: string;
  code: string;
}

export interface OtpResult {
  success: boolean;
  pinId?: string;
  message?: string;
}

export interface ProviderConfig {
  username?: string;
  apiKey: string;
  sandbox?: boolean;
  defaultSenderName?: string;
  defaultRoute?: SmsRoute;
}

export interface SendResult {
  success: boolean;
  provider: ProviderName;
  message: string;
  providerResponse?: unknown;
}
