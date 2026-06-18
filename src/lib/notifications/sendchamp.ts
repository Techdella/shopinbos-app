import "server-only";

import type { NotificationProvider } from "./provider";
import type {
  SmsOptions,
  VoiceOptions,
  WhatsAppTextOptions,
  WhatsAppTemplateOptions,
  OtpOptions,
  OtpVerifyOptions,
  OtpResult,
  SendResult,
} from "./types";

const SC_BASE_URL = "https://api.sendchamp.com/api/v1";

interface SCConfig {
  apiKey: string;
  defaultSenderName?: string;
  defaultRoute?: "dnd" | "non_dnd" | "international";
}

export class SendChampProvider implements NotificationProvider {
  readonly name = "sendchamp";
  private config: SCConfig;

  constructor(config: SCConfig) {
    this.config = {
      ...config,
      defaultSenderName: config.defaultSenderName ?? "Sendchamp",
      defaultRoute: config.defaultRoute ?? "non_dnd",
    };
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async sendSms(options: SmsOptions): Promise<SendResult> {
    try {
      const payload = {
        to: options.to,
        message: options.message,
        sender_name: options.senderName ?? this.config.defaultSenderName,
        route: options.route ?? this.config.defaultRoute ?? "non_dnd",
      };

      const res = await fetch(`${SC_BASE_URL}/sms/send`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "sendchamp",
          message: data?.message ?? `SMS failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "sendchamp",
        message: "SMS sent successfully",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "sendchamp",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendVoice(options: VoiceOptions): Promise<SendResult> {
    try {
      const payload = {
        to: options.to,
        message: options.message,
        type: "text",
      };

      const res = await fetch(`${SC_BASE_URL}/voice/send`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "sendchamp",
          message: data?.message ?? `Voice call failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "sendchamp",
        message: "Voice call initiated",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "sendchamp",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendWhatsAppText(options: WhatsAppTextOptions): Promise<SendResult> {
    try {
      const payload = {
        to: options.to,
        message: options.message,
      };

      const res = await fetch(`${SC_BASE_URL}/whatsapp/message/send`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "sendchamp",
          message: data?.message ?? `WhatsApp send failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "sendchamp",
        message: "WhatsApp message sent",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "sendchamp",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendWhatsAppTemplate(options: WhatsAppTemplateOptions): Promise<SendResult> {
    try {
      const payload = {
        to: options.to,
        template_name: options.templateName,
        params: options.parameters,
        language: options.language ?? "en",
      };

      const res = await fetch(`${SC_BASE_URL}/whatsapp/template/send`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "sendchamp",
          message: data?.message ?? `Template send failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "sendchamp",
        message: "WhatsApp template sent",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "sendchamp",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendOtp(options: OtpOptions): Promise<OtpResult> {
    try {
      const payload = {
        channel: "sms",
        sender: this.config.defaultSenderName ?? "Sendchamp",
        token_type: "numeric",
        expiration: options.expiry ?? 5,
        to: options.to[0],
      };

      const res = await fetch(`${SC_BASE_URL}/verification/send`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: data?.message ?? `OTP send failed: ${res.status}`,
        };
      }

      return {
        success: true,
        pinId: data?.data?.reference ?? data?.reference,
        message: "OTP sent successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async verifyOtp(options: OtpVerifyOptions): Promise<OtpResult> {
    try {
      const payload = {
        verification_reference: options.pinId,
        verification_code: options.code,
      };

      const res = await fetch(`${SC_BASE_URL}/verification/confirm`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: data?.message ?? `OTP verification failed: ${res.status}`,
        };
      }

      return {
        success: true,
        message: "OTP verified successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
