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

export interface NotificationProvider {
  readonly name: string;

  sendSms(options: SmsOptions): Promise<SendResult>;

  sendVoice?(options: VoiceOptions): Promise<SendResult>;

  sendWhatsAppText?(options: WhatsAppTextOptions): Promise<SendResult>;

  sendWhatsAppTemplate?(options: WhatsAppTemplateOptions): Promise<SendResult>;

  sendOtp?(options: OtpOptions): Promise<OtpResult>;

  verifyOtp?(options: OtpVerifyOptions): Promise<OtpResult>;
}
