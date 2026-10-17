import "server-only";
import { Resend } from "resend";
import type { SendResult } from "./types";
import type { BatchSendResult } from "@/lib/email/batch-outcome";

const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe / List-Unsubscribe-Post (see src/lib/email/shell.ts). */
  headers?: Record<string, string>;
  /** Plain-text alternative. */
  text?: string;
  /** Files to attach (e.g. print-ready labels for a print shop). */
  attachments?: Array<{ filename: string; content: Buffer }>;
}

export interface EmailSendResult {
  success: boolean;
  id?: string;
  message?: string;
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "Shopinbos <noreply@shopinbos.com>";

export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    return { success: false, message: "Resend API key not configured" };
  }

  const { data, error } = await resend.emails.send({
    from: options.from ?? DEFAULT_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    headers: options.headers,
    ...(options.attachments?.length ? { attachments: options.attachments } : {}),
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, id: data?.id };
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function formatFromAddress(senderName?: string | null) {
  if (!senderName) return DEFAULT_FROM;
  // Keep the verified sending address; only the display name changes per store.
  const address = DEFAULT_FROM.match(/<([^>]+)>/)?.[1] ?? DEFAULT_FROM;
  return `${senderName.replace(/["<>]/g, "")} <${address}>`;
}

export interface BatchEmail {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/**
 * Sends up to 100 emails in one Resend call. `statusCode` is the provider's HTTP status when it answered with an
 * error, and null when it never answered (network error or timeout: the emails may have gone out, see
 * src/lib/email/batch-outcome.ts). With `permissive`, Resend sends the valid emails and reports the invalid ones
 * in `errors` (by index) instead of refusing the whole batch over one bad address.
 */
export async function sendEmailBatch(emails: BatchEmail[], options: { permissive?: boolean } = {}): Promise<BatchSendResult> {
  const resend = getResendClient();
  if (!resend) return { success: false, message: "Resend API key not configured" };
  if (emails.length === 0) return { success: true, ids: [] };
  if (emails.length > 100) return { success: false, message: "Resend batches are limited to 100 emails" };

  const payload = emails.map((email) => ({
    from: email.from ?? DEFAULT_FROM,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    replyTo: email.replyTo,
    headers: email.headers,
  }));
  let response: Awaited<ReturnType<Resend["batch"]["send"]>>;
  try {
    response = options.permissive ? await resend.batch.send(payload, { batchValidation: "permissive" }) : await resend.batch.send(payload);
  } catch (error) {
    return { success: false, statusCode: null, message: `The email provider call failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  const { data, error } = response;
  if (error) {
    const statusCode = (error as { statusCode?: number | null }).statusCode;
    return { success: false, message: error.message, statusCode: typeof statusCode === "number" ? statusCode : statusCode === null ? null : undefined };
  }
  const body = (data ?? {}) as { data?: Array<{ id: string }>; errors?: Array<{ index: number; message: string }> };
  const errors = Array.isArray(body.errors) ? body.errors.filter((e) => typeof e?.index === "number") : [];
  return { success: true, ids: (body.data ?? []).map((item) => item.id), ...(errors.length ? { errors } : {}) };
}

// Order confirmations, payout notices and seller alerts live in src/lib/email/notices.server.ts, built with the
// shared email shell (src/lib/email/shell.ts) so every email carries the logo and the compliance footer.

export async function addContactToAudience(
  email: string,
  firstName?: string,
  lastName?: string,
): Promise<{ success: boolean; message?: string }> {
  if (!RESEND_AUDIENCE_ID) {
    return { success: false, message: "Resend audience ID not configured" };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, message: "Resend API key not configured" };
  }

  const { data, error } = await resend.contacts.create({
    email,
    firstName,
    lastName,
    audienceId: RESEND_AUDIENCE_ID,
  });

  if (error) return { success: false, message: error.message };
  return { success: true };
}
