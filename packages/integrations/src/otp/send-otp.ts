import { OtpSendError, type OtpChannel, type OtpMessage, type OtpSender } from './types';

export interface SendOtpResult {
  channel: OtpChannel;
  providerRef?: string;
  /** Channels that failed before the one that worked. */
  failed: OtpChannel[];
}

/**
 * Tries each sender in order (WhatsApp first, SMS fallback) and returns the first that works.
 * Throws the last error if every channel fails.
 */
export async function sendOtp(senders: OtpSender[], message: OtpMessage): Promise<SendOtpResult> {
  if (senders.length === 0) throw new Error('No OTP senders configured');
  const failed: OtpChannel[] = [];
  let lastError: unknown;
  for (const sender of senders) {
    try {
      const { providerRef } = await sender.send(message);
      return { channel: sender.channel, providerRef, failed };
    } catch (err) {
      failed.push(sender.channel);
      lastError = err;
    }
  }
  throw lastError instanceof OtpSendError
    ? lastError
    : new Error('All OTP channels failed', { cause: lastError });
}
