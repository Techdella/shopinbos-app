import "server-only";

import type { NotificationProvider } from "./provider";
import type {
  SmsOptions,
  VoiceOptions,
  WhatsAppTextOptions,
  WhatsAppTemplateOptions,
  SendResult,
} from "./types";

const AT_SMS_URL = "https://api.africastalking.com/version1/messaging";
const AT_VOICE_URL = "https://voice.africastalking.com/call";
const AT_WHATSAPP_URL = "https://api.africastalking.com/version1/messaging";

interface ATConfig {
  username: string;
  apiKey: string;
  sandbox?: boolean;
}

export class AfricaTalkingProvider implements NotificationProvider {
  readonly name = "africastalking";
  private config: ATConfig;

  constructor(config: ATConfig) {
    this.config = {
      ...config,
      sandbox: config.sandbox ?? false,
    };
  }

  private get baseUrl(): string {
    return this.config.sandbox
      ? "https://api.sandbox.africastalking.com"
      : "https://api.africastalking.com";
  }

  private get headers(): Record<string, string> {
    return {
      apiKey: this.config.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };
  }

  async sendSms(options: SmsOptions): Promise<SendResult> {
    try {
      const params = new URLSearchParams();
      params.append("username", this.config.username);
      params.append("to", options.to.join(","));
      params.append("message", options.message);
      if (options.senderName) {
        params.append("from", options.senderName);
      }

      const res = await fetch(`${this.baseUrl}/version1/messaging`, {
        method: "POST",
        headers: this.headers,
        body: params.toString(),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "africastalking",
          message: data?.error ?? `SMS failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "africastalking",
        message: "SMS sent successfully",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "africastalking",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendVoice(options: VoiceOptions): Promise<SendResult> {
    try {
      const formData = new URLSearchParams();
      formData.append("username", this.config.username);
      formData.append("to", options.to.join(","));
      formData.append("message", options.message);
      formData.append("type", "text");

      const res = await fetch(AT_VOICE_URL, {
        method: "POST",
        headers: {
          apikey: this.config.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formData.toString(),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "africastalking",
          message: data?.error ?? `Voice call failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "africastalking",
        message: "Voice call initiated",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "africastalking",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendWhatsAppText(options: WhatsAppTextOptions): Promise<SendResult> {
    try {
      const params = new URLSearchParams();
      params.append("username", this.config.username);
      params.append("to", options.to.join(","));
      params.append("message", options.message);

      const res = await fetch(`${this.baseUrl}/version1/messaging`, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "africastalking",
          message: data?.error ?? `WhatsApp send failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "africastalking",
        message: "WhatsApp message sent",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "africastalking",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendWhatsAppTemplate(options: WhatsAppTemplateOptions): Promise<SendResult> {
    try {
      const payload = {
        username: this.config.username,
        to: options.to[0],
        message: options.templateName,
        templateData: options.parameters,
      };

      const res = await fetch(`${this.baseUrl}/version1/whatsapp/template`, {
        method: "POST",
        headers: {
          apiKey: this.config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          provider: "africastalking",
          message: data?.error ?? `Template send failed: ${res.status}`,
          providerResponse: data,
        };
      }

      return {
        success: true,
        provider: "africastalking",
        message: "WhatsApp template sent",
        providerResponse: data,
      };
    } catch (error) {
      return {
        success: false,
        provider: "africastalking",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
