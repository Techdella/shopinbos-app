// The weekly summary run's bookkeeping, without the database: which users are claimed, what a refused batch
// becomes, and when it's retried. src/lib/email/weekly-summary.server.ts gives it a Prisma store, the numbers and
// the real sender; tests/email-retry-and-upload.test.mjs drives it with an in-memory store and a failing sender.
//
// Rows (WeeklySummaryLog, unique per user and week) go: claimed → sent | skipped | failed | unknown.
// - Each user/week is claimed once (insert, ON CONFLICT DO NOTHING); only the run whose insert won sends.
// - "failed" means the provider refused the email (nothing went out): a later run re-claims it (failed → claimed is
//   atomic, attempts + 1) until it has had MAX_ATTEMPTS tries, then it stays failed.
// - "unknown" means the provider never answered: it may have gone out, so it's never retried.
// - A row left "claimed" (the run died mid-send) is never retried either, for the same reason.

import { sendSafely, type BatchOutcome, type BatchSendResult } from "./batch-outcome.ts";
import type { SummaryKind } from "./weekly-summary.ts";

export const WEEKLY_BATCH = 50;
export const WEEKLY_MAX_ATTEMPTS = 3;

export interface WeeklyCandidate {
  id: string;
  email: string;
  name: string;
  role: "seller" | "supplier" | "logistics_partner";
}

export interface WeeklyStore<E> {
  /** Up to `take` failed rows with attempts < maxAttempts, moved failed → claimed (attempts + 1), for users who still want it. */
  reclaimFailed(weekStart: string, take: number, maxAttempts: number): Promise<WeeklyCandidate[]>;
  /** Users with no row for this week yet who haven't turned weekly summaries off. */
  nextCandidates(take: number): Promise<WeeklyCandidate[]>;
  /** Inserts "claimed" rows; returns the user ids whose row this call inserted. */
  claim(weekStart: string, users: WeeklyCandidate[]): Promise<Set<string>>;
  /** The last week each user got a quiet-week email. */
  lastQuiet(userIds: string[]): Promise<Map<string, string | null>>;
  /** Builds the user's email, or null when there's nothing to send this week. */
  compose(user: WeeklyCandidate, lastQuietWeekStart: string | null): Promise<{ kind: Exclude<SummaryKind, "none">; email: E } | null>;
  /** These updates only touch rows still "claimed". */
  markSkipped(weekStart: string, userId: string): Promise<void>;
  markSent(weekStart: string, userIds: string[], kind: Exclude<SummaryKind, "none">, at: Date): Promise<void>;
  markFailed(weekStart: string, userIds: string[], error: string): Promise<void>;
  markUnknown(weekStart: string, userIds: string[], error: string): Promise<void>;
}

export interface WeeklySummaryRunResult {
  weekStart: string;
  claimed: number;
  sent: number;
  quiet: number;
  skipped: number;
  failed: number;
  /** The provider never answered: not retried, they may have gone out. */
  unknown: number;
  more: boolean;
  errors: string[];
}

export async function runWeeklyBatches<E>(input: {
  weekStart: string;
  store: WeeklyStore<E>;
  send: (emails: E[]) => Promise<BatchSendResult>;
  maxPerRun: number;
  deadline: number;
  now?: () => number;
  batchSize?: number;
  maxAttempts?: number;
}): Promise<WeeklySummaryRunResult> {
  const { weekStart, store } = input;
  const now = input.now ?? Date.now;
  const batchSize = input.batchSize ?? WEEKLY_BATCH;
  const maxAttempts = input.maxAttempts ?? WEEKLY_MAX_ATTEMPTS;
  const result: WeeklySummaryRunResult = { weekStart, claimed: 0, sent: 0, quiet: 0, skipped: 0, failed: 0, unknown: 0, more: false, errors: [] };

  let retriedFailed = false;
  while (result.claimed < input.maxPerRun && now() < input.deadline) {
    const take = Math.min(batchSize, input.maxPerRun - result.claimed);
    let batch: WeeklyCandidate[] = [];
    // Refused batches from earlier runs go first, so a retry isn't starved by new users.
    if (!retriedFailed) {
      batch = await store.reclaimFailed(weekStart, take, maxAttempts);
      retriedFailed = batch.length < take;
    }
    if (!batch.length) {
      const candidates = await store.nextCandidates(take);
      if (!candidates.length) break;
      const owned = await store.claim(weekStart, candidates);
      batch = candidates.filter((user) => owned.has(user.id));
      if (!batch.length) continue; // another run took all of them; look again
    }
    result.claimed += batch.length;

    const lastQuiet = await store.lastQuiet(batch.map((u) => u.id));
    const outgoing: Array<{ user: WeeklyCandidate; kind: Exclude<SummaryKind, "none">; email: E }> = [];
    for (const user of batch) {
      try {
        const built = await store.compose(user, lastQuiet.get(user.id) ?? null);
        if (!built) {
          await store.markSkipped(weekStart, user.id);
          result.skipped += 1;
          continue;
        }
        outgoing.push({ user, ...built });
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        result.errors.push(`${user.id}: ${message}`);
        await store.markFailed(weekStart, [user.id], message).catch(() => null);
        result.failed += 1;
      }
    }
    if (!outgoing.length) continue;

    const outcome: BatchOutcome = await sendSafely(input.send, outgoing.map((item) => item.email));
    const ids = (items: typeof outgoing) => items.map((item) => item.user.id);
    const recordSent = async (items: typeof outgoing) => {
      const at = new Date(now());
      for (const kind of ["full", "quiet"] as const) {
        const ofKind = items.filter((item) => item.kind === kind);
        if (!ofKind.length) continue;
        await store.markSent(weekStart, ids(ofKind), kind, at);
        if (kind === "full") result.sent += ofKind.length;
        else result.quiet += ofKind.length;
      }
    };

    if (outcome.kind === "sent") {
      await recordSent(outgoing);
    } else if (outcome.kind === "partial") {
      await recordSent(outcome.sent.map((i) => outgoing[i]!));
      for (const refusal of outcome.refused) await store.markFailed(weekStart, [outgoing[refusal.index]!.user.id], refusal.message);
      result.failed += outcome.refused.length;
      result.errors.push(...outcome.refused.map((r) => `${outgoing[r.index]!.user.id}: ${r.message}`));
    } else if (outcome.kind === "refused") {
      await store.markFailed(weekStart, ids(outgoing), outcome.message);
      result.failed += outgoing.length;
      result.errors.push(outcome.message);
      break; // a refused batch is usually systemic (domain, quota): stop and let the next call retry
    } else {
      await store.markUnknown(weekStart, ids(outgoing), outcome.message);
      result.unknown += outgoing.length;
      result.errors.push(outcome.message);
      break;
    }
  }
  result.more = result.claimed >= input.maxPerRun || now() >= input.deadline;
  return result;
}
