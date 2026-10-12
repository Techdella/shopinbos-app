// What happened to a batch handed to the email provider (Resend's batch API), as the weekly summary and product
// news senders need it to decide what may be retried. Pure, unit-tested in tests/email-retry-and-upload.test.mjs.
//
// - "sent": every email was accepted.
// - "partial": some were refused one by one (Resend's permissive batch validation reports them by index); the rest
//   were accepted. Only the refused ones may be retried.
// - "refused": the provider answered with an error for the whole batch (quota, rate limit, bad domain, validation,
//   its own 5xx). Nothing was accepted, so the whole batch may be retried.
// - "unknown": no answer (network error, timeout, a crash in the client). The emails may have gone out, so they are
//   never retried automatically: a duplicate is worse than a missing email.

export interface BatchSendResult {
  success: boolean;
  ids?: string[];
  message?: string;
  /** The provider's HTTP status when it answered with an error; null when it never answered. */
  statusCode?: number | null;
  /** Per-email refusals (permissive validation), by index in the batch. */
  errors?: Array<{ index: number; message: string }>;
}

export type BatchOutcome =
  | { kind: "sent"; sent: number[] }
  | { kind: "partial"; sent: number[]; refused: Array<{ index: number; message: string }> }
  | { kind: "refused"; message: string }
  | { kind: "unknown"; message: string };

const clip = (text: string) => text.slice(0, 500);

export function batchOutcome(result: BatchSendResult | null | undefined, size: number): BatchOutcome {
  const all = Array.from({ length: size }, (_, i) => i);
  if (!result) return { kind: "unknown", message: "The email provider gave no answer" };
  if (!result.success) {
    const message = clip(result.message?.trim() || "The email provider refused the batch");
    return result.statusCode === null ? { kind: "unknown", message } : { kind: "refused", message };
  }
  const refused = new Map<number, string>();
  for (const error of result.errors ?? []) {
    if (Number.isInteger(error.index) && error.index >= 0 && error.index < size) refused.set(error.index, clip(error.message || "Refused by the email provider"));
  }
  if (!refused.size) return { kind: "sent", sent: all };
  if (refused.size === size) return { kind: "refused", message: [...new Set(refused.values())].join("; ").slice(0, 500) };
  return { kind: "partial", sent: all.filter((i) => !refused.has(i)), refused: [...refused].map(([index, message]) => ({ index, message })) };
}

/** Runs the send, turning a thrown error (the request may have gone out) into an "unknown" result. */
export async function sendSafely<T>(send: (emails: T[]) => Promise<BatchSendResult>, emails: T[]): Promise<BatchOutcome> {
  try {
    return batchOutcome(await send(emails), emails.length);
  } catch (error) {
    return { kind: "unknown", message: clip(`The email provider call failed: ${error instanceof Error ? error.message : String(error)}`) };
  }
}
