import type { InboundSms, SendOutcome, SmsProviderKey, SmsStatus } from "./pure";

export type { InboundSms, SendOutcome, SmsProviderKey, SmsStatus } from "./pure";

/** Keys for one provider account: the platform's (from env) or a store's own (encrypted in InboxChannel). */
export interface SmsCredentials {
  provider: SmsProviderKey;
  apiKey: string;
  /** Africa's Talking app username ("sandbox" for the sandbox). */
  username?: string;
  /** Alphanumeric sender ID (3–11 characters), registered with the provider. */
  senderId?: string;
  /** The store's number or shortcode that receives replies (Termii number, AT shortcode or voice number). */
  phoneNumber?: string;
  /** Termii secret key, used to check X-Termii-Signature. */
  secretKey?: string;
  /** Route: Termii "dnd" | "generic", Sendchamp "dnd" | "non_dnd" | "international", BulkSMS Nigeria gateway. */
  route?: string;
  /** Termii accounts each have a base URL shown in the dashboard. */
  baseUrl?: string;
}

export interface SmsSendInput {
  to: string[];
  body: string;
}

export type VerifyOutcome = { ok: true; detail: string } | { ok: false; error: string };

/** What every provider module offers. Voice is Africa's Talking only (see ./africastalking.ts). */
export interface SmsProvider {
  key: SmsProviderKey;
  label: string;
  /** Can customers text back (to a Termii number or an AT shortcode)? */
  twoWay: boolean;
  send(credentials: SmsCredentials, input: SmsSendInput): Promise<SendOutcome>;
  /** Checks the keys with the provider before they are saved. */
  verify(credentials: SmsCredentials): Promise<VerifyOutcome>;
  parseInbound(body: Record<string, unknown>): InboundSms | null;
  parseStatus(body: Record<string, unknown>): SmsStatus | null;
  /**
   * Checks the provider's own request signature. null means the provider doesn't sign requests, so the webhook
   * relies on the secret token in its URL (and SMS_WEBHOOK_ALLOWED_IPS when set).
   */
  verifySignature(rawBody: string, headers: { get(name: string): string | null }, credentials: SmsCredentials | null): boolean | null;
}
