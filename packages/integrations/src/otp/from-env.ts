import { termiiSmsSender } from './termii';
import type { OtpChannel, OtpSender } from './types';
import { whatsappOtpSender } from './whatsapp';

type Env = Record<string, string | undefined>;

/** Builds the sender list from env (OTP_CHANNEL_ORDER, default "whatsapp,sms"). Unconfigured channels are skipped. */
export function otpSendersFromEnv(env: Env = process.env): OtpSender[] {
  const order = (env.OTP_CHANNEL_ORDER ?? 'whatsapp,sms')
    .split(',')
    .map((s) => s.trim()) as OtpChannel[];
  const senders: OtpSender[] = [];
  for (const channel of order) {
    if (channel === 'whatsapp' && env.WHATSAPP_PHONE_NUMBER_ID && env.META_SYSTEM_USER_TOKEN) {
      senders.push(
        whatsappOtpSender({
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          accessToken: env.META_SYSTEM_USER_TOKEN,
          templateName: env.WHATSAPP_OTP_TEMPLATE ?? 'shopinbos_otp',
          languageCode: env.WHATSAPP_OTP_TEMPLATE_LANG ?? 'en',
        }),
      );
    }
    if (channel === 'sms' && env.TERMII_API_KEY) {
      senders.push(
        termiiSmsSender({
          apiKey: env.TERMII_API_KEY,
          senderId: env.TERMII_SENDER_ID ?? 'Shopinbos',
        }),
      );
    }
  }
  return senders;
}
