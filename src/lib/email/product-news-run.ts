// Product news sending without the database: claiming batches, what each provider answer does to the recipients,
// and which failures "Retry failed" may resend. src/lib/email/product-news.server.ts gives it a Prisma store;
// tests/email-retry-and-upload.test.mjs drives it with an in-memory store and a failing sender.
//
// Recipient rows (unique per broadcast and user): queued → sending → sent | failed | skipped.
// - A batch is claimed queued → sending atomically, so overlapping runs never take the same rows.
// - Refused by the provider (nothing went out): "failed" with the provider's message. "Retry failed" queues
//   these again.
// - No answer from the provider, or a run that died mid-send (left "sending" > 15 min): "failed" too, but with
//   an error that marks them as possibly delivered, and "Retry failed" leaves them alone.

import { sendSafely, type BatchSendResult } from "./batch-outcome.ts";

export const NEWS_BATCH = 100;
export const NEWS_STALE_MS = 15 * 60_000;
export const NEWS_INTERRUPTED = "Interrupted while sending";
/** Prefix for failures where the email may have gone out (never retried). */
export const NEWS_UNKNOWN_PREFIX = "Delivery unknown: ";

/** Whether "Retry failed" may queue a failed recipient again: only when nothing can have been delivered. */
export function isRetryableNewsFailure(error: string | null | undefined) {
  const text = String(error ?? "");
  return text !== NEWS_INTERRUPTED && !text.startsWith(NEWS_UNKNOWN_PREFIX);
}

/**
 * The same rule as a database filter over ProductNewsRecipient rows: failed, and the error is not one that marks
 * them as possibly delivered (NULL errors count as retryable; NOT (error = x) alone would skip them). Both the
 * "Retry failed" requeue and the retryableCount the admin list shows use this, so they can't disagree.
 */
export function retryableNewsWhere(broadcastId: string | { in: string[] }) {
  return {
    broadcastId,
    status: "failed",
    OR: [{ error: null }, { AND: [{ NOT: { error: NEWS_INTERRUPTED } }, { NOT: { error: { startsWith: NEWS_UNKNOWN_PREFIX } } }] }],
  };
}

/** What the admin list shows about failures: how many "Retry N failed" would resend, and how many it won't. */
export function newsRetrySummary(failedCount: number, retryableCount: number) {
  const retryable = Math.max(0, Math.min(retryableCount, failedCount));
  return { retryableCount: retryable, unconfirmedCount: Math.max(0, failedCount - retryable) };
}

export interface NewsRecipient {
  id: string;
  userId: string;
  email: string;
  role: string;
}

export interface NewsCounts {
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
  sending: number;
}

export interface NewsStore<E> {
  status(id: string): Promise<string | null>;
  hasRecipients(id: string): Promise<boolean>;
  snapshot(id: string): Promise<void>;
  /** Up to `take` queued rows moved to "sending" (FOR UPDATE SKIP LOCKED). */
  claim(id: string, take: number): Promise<NewsRecipient[]>;
  /** Of these users, who turned product news off. */
  optedOut(userIds: string[]): Promise<Set<string>>;
  build(id: string, recipient: NewsRecipient): E;
  /** These updates only touch rows still "sending". */
  markSkipped(rowIds: string[]): Promise<void>;
  markSent(rowIds: string[], at: Date): Promise<void>;
  markFailed(rowIds: string[], error: string): Promise<void>;
  /** Rows left "sending" since before `before` → failed (NEWS_INTERRUPTED). */
  closeStale(id: string, before: Date): Promise<void>;
  /** Recounts the rows and stores the totals on the broadcast. */
  refreshCounts(id: string): Promise<NewsCounts>;
  /** sending → sent | failed (only if still sending). */
  finish(id: string, status: "sent" | "failed", lastError: string | null, at: Date): Promise<void>;
  setLastError(id: string, lastError: string): Promise<void>;
  /** failed rows whose error isRetryableNewsFailure → queued; returns how many. */
  requeueRetryable(id: string): Promise<number>;
  /** → sending, lastError cleared. */
  resume(id: string): Promise<void>;
}

export type NewsProgress = { status: string } & NewsCounts;

export class NewsRunError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface NewsRunInput<E> {
  id: string;
  store: NewsStore<E>;
  send: (emails: E[]) => Promise<BatchSendResult>;
  deadline: number;
  maxBatches?: number;
  batchSize?: number;
  now?: () => number;
}

/** Sends the next batches (bounded by time and count), then updates the counts; marks it done once nothing is left. */
export async function processNewsBroadcast<E>(input: NewsRunInput<E>): Promise<NewsProgress> {
  const { id, store } = input;
  const now = input.now ?? Date.now;
  const status = await store.status(id);
  if (status === null) throw new NewsRunError("Not found", "NOT_FOUND", 404);
  if (status !== "sending") return { status, ...(await store.refreshCounts(id)) };

  if (!(await store.hasRecipients(id))) await store.snapshot(id);

  let lastError: string | null = null;
  const maxBatches = input.maxBatches ?? 20;
  for (let round = 0; round < maxBatches && now() < input.deadline; round++) {
    const claimed = await store.claim(id, input.batchSize ?? NEWS_BATCH);
    if (!claimed.length) break;

    // Preferences can change while a big send runs: check again right before sending.
    const off = await store.optedOut(claimed.map((r) => r.userId));
    const skip = claimed.filter((r) => off.has(r.userId));
    if (skip.length) await store.markSkipped(skip.map((r) => r.id));
    const go = claimed.filter((r) => !off.has(r.userId));
    if (!go.length) continue;

    const outcome = await sendSafely(input.send, go.map((r) => store.build(id, r)));
    if (outcome.kind === "sent") {
      await store.markSent(go.map((r) => r.id), new Date(now()));
    } else if (outcome.kind === "partial") {
      await store.markSent(outcome.sent.map((i) => go[i]!.id), new Date(now()));
      for (const refusal of outcome.refused) await store.markFailed([go[refusal.index]!.id], refusal.message);
      lastError = outcome.refused[0]!.message;
    } else if (outcome.kind === "refused") {
      lastError = outcome.message;
      await store.markFailed(go.map((r) => r.id), lastError);
      break; // usually systemic (domain, quota): stop; "Retry failed" or the next cron run can carry on
    } else {
      lastError = `${NEWS_UNKNOWN_PREFIX}${outcome.message}`.slice(0, 500);
      await store.markFailed(go.map((r) => r.id), lastError);
      break;
    }
  }

  // Rows a crashed run left in "sending" are closed, never resent (they may have gone out).
  await store.closeStale(id, new Date(now() - NEWS_STALE_MS));
  const counts = await store.refreshCounts(id);
  if (counts.queued === 0 && counts.sending === 0) {
    const done = counts.sent === 0 && counts.failed > 0 ? "failed" : "sent";
    await store.finish(id, done, lastError, new Date(now()));
    return { status: done, ...counts };
  }
  if (lastError) await store.setLastError(id, lastError);
  return { status: "sending", ...counts };
}

/** "Retry failed": queues again only the recipients whose batch was refused, then sends. */
export async function retryNewsFailed<E>(input: NewsRunInput<E>): Promise<NewsProgress> {
  const status = await input.store.status(input.id);
  if (status === null) throw new NewsRunError("Not found", "NOT_FOUND", 404);
  if (!["sent", "failed", "sending"].includes(status)) throw new NewsRunError("It hasn't been sent yet", "CONFLICT", 409);
  const queued = await input.store.requeueRetryable(input.id);
  if (!queued) throw new NewsRunError("Nothing to retry: the remaining failures may have been delivered, so they aren't resent.", "NOTHING_TO_RETRY", 409);
  await input.store.resume(input.id);
  return processNewsBroadcast(input);
}
