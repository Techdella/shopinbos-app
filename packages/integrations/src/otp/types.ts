export type OtpChannel = 'whatsapp' | 'sms';

export interface OtpMessage {
  /** E.164 phone, e.g. +2348031234567 */
  to: string;
  code: string;
}

export interface OtpSender {
  channel: OtpChannel;
  send(message: OtpMessage): Promise<{ providerRef?: string }>;
}

export type FetchLike = typeof fetch;

export class OtpSendError extends Error {
  constructor(
    message: string,
    readonly channel: OtpChannel,
    readonly status?: number,
  ) {
    super(message);
  }
}
