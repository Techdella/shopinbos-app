import "server-only";

import { after, type NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { meterAiCharged, refundAi, type AiKind } from "@/lib/ai/usage";
import { cleanClientKey, decideRexJob, REX_JOB_STALE_MS, trimRexInput, type RexJobKind } from "@shared/rex-jobs";
import type { CreditAction } from "@shared/ai-credits";

// Rex jobs (rules in shared/rex-jobs.ts, table docs/migrations/2026-12-14-rex-jobs.sql).
//
//   runRexJob({ user, kind, clientKey, input }, async (job) => { await job.charge("image", 1, "photo"); …; return result })
//
// With a clientKey (one per "Generate" tap, sent again on a retry):
//   * a finished job answers with its saved result and charges nothing;
//   * a job still running answers { pending, jobId } and the client polls GET /api/app/rex-jobs/[id];
//   * otherwise ONE runner claims the job, charges inside it (each charge is recorded on the row, so a cut-off job
//     gives back exactly what it took), makes the thing and saves the result. The work is handed to next/server
//     `after()`, so it finishes and is saved even when the seller's connection drops or they press back.
// Without a clientKey (older app builds) it runs the same work with the same charging and refunds, just unsaved.
// A failure gives back every credit the job still holds (refundAi: a 12-month lot and the day's cap).

export class RexJobBlocked extends Error {
  constructor(readonly response: NextResponse) {
    super("blocked");
  }
}

export interface RexJobContext {
  jobId: string | null;
  /** Meters one use (meterAiCharged). Throws RexJobBlocked (a 402/429 to send back) when it can't be paid for. */
  charge(kind: AiKind, units?: number, action?: CreditAction): Promise<number>;
  /** Gives back part of a charge (a logo that didn't draw). */
  refund(kind: AiKind, units: number, credits: number): Promise<void>;
}

export type RexJobOutcome<T> =
  | { status: "done"; result: T; jobId: string | null; replayed: boolean }
  | { status: "pending"; jobId: string }
  | { status: "failed"; jobId: string | null; error: unknown; message: string }
  | { status: "blocked"; response: NextResponse };

interface Who {
  id: string;
}

interface Held {
  kind: AiKind;
  units: number;
  credits: number;
}

const tableMissing = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

const asJson = (value: unknown) => (value === undefined ? undefined : (JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue));

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? "failed")).slice(0, 500);
}

/** Registers the promise with next/server after() so the platform keeps the function alive until it settles. */
function keepAlive(promise: Promise<unknown>) {
  try {
    after(() => promise.then(() => undefined, () => undefined));
  } catch {
    // Outside a request (tests, scripts): the caller awaits it anyway.
  }
}

/** Gives back a stale job's credits once (the row moves running → failed first, so only one caller refunds). */
async function retireStale(job: { id: string; userId: string; creditsCharged: number }) {
  const moved = await db.rexJob.updateMany({
    where: { id: job.id, status: "running", updatedAt: { lt: new Date(Date.now() - REX_JOB_STALE_MS) } },
    data: { status: "failed", error: "Rex was cut off before it finished.", creditsCharged: 0 },
  });
  if (moved.count === 1 && job.creditsCharged > 0) await refundAi(job.userId, "image", 0, job.creditsCharged);
}

/**
 * Finds or claims the job for (user, clientKey). Returns the claimed row id to run, or a finished/pending outcome.
 * Null when there's no key or the table isn't there yet (run without a job).
 */
async function claim<T>(user: Who, kind: RexJobKind, clientKey: string, input: unknown, storeId: string | null): Promise<{ run: string } | RexJobOutcome<T> | null> {
  const trimmed = trimRexInput(input);
  const fresh = { status: "running", kind, input: trimmed === null ? Prisma.DbNull : asJson(trimmed), storeId, error: null, creditsCharged: 0, seenAt: null };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await db.rexJob.findUnique({ where: { userId_clientKey: { userId: user.id, clientKey } } });
    const decision = decideRexJob(existing);
    if (decision === "start") {
      try {
        const row = await db.rexJob.create({ data: { userId: user.id, clientKey, ...fresh } });
        return { run: row.id };
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") continue; // a twin request got there first
        throw error;
      }
    }
    if (!existing) continue;
    if (decision === "replay") return { status: "done", result: existing.result as T, jobId: existing.id, replayed: true };
    if (decision === "pending") return { status: "pending", jobId: existing.id };
    if (decision === "stale") await retireStale(existing);
    // failed (its credits were given back) or just retired: take it over, one runner only.
    const taken = await db.rexJob.updateMany({ where: { id: existing.id, status: "failed" }, data: { ...fresh, result: Prisma.DbNull } });
    if (taken.count === 1) return { run: existing.id };
  }
  const row = await db.rexJob.findUnique({ where: { userId_clientKey: { userId: user.id, clientKey } } });
  return row ? { status: "pending", jobId: row.id } : null;
}

export async function runRexJob<T>(
  options: { user: Who; kind: RexJobKind; clientKey?: unknown; input?: unknown; storeId?: string | null },
  work: (job: RexJobContext) => Promise<T>,
): Promise<RexJobOutcome<T>> {
  const { user, kind } = options;
  const clientKey = cleanClientKey(options.clientKey);

  let jobId: string | null = null;
  if (clientKey) {
    try {
      const claimed = await claim<T>(user, kind, clientKey, options.input, options.storeId ?? null);
      if (claimed && "run" in claimed) jobId = claimed.run;
      else if (claimed) return claimed;
    } catch (error) {
      // Before the migration (or the database hiccuped): make it the old way rather than fail the seller.
      if (!tableMissing(error)) console.error("[rex-jobs] claim failed, running without a job", error);
    }
  }

  const held: Held[] = [];
  const record = (delta: number) =>
    jobId && delta !== 0
      ? db.rexJob.update({ where: { id: jobId }, data: { creditsCharged: { increment: delta } } }).then(() => undefined, (error) => console.error("[rex-jobs] credit note failed", error))
      : Promise.resolve();

  const context: RexJobContext = {
    jobId,
    async charge(aiKind, units = 1, action) {
      const metered = await meterAiCharged(user.id, aiKind, units, action);
      if (metered.blocked) throw new RexJobBlocked(metered.blocked);
      held.push({ kind: aiKind, units, credits: metered.credits });
      await record(metered.credits);
      return metered.credits;
    },
    async refund(aiKind, units, credits) {
      const back = Math.max(0, Math.round(credits));
      await refundAi(user.id, aiKind, units, back);
      held.push({ kind: aiKind, units: -units, credits: -back });
      await record(-back);
    },
  };

  /** Everything the job still holds goes back, per kind. */
  const giveBackAll = async () => {
    const byKind = new Map<AiKind, { units: number; credits: number }>();
    for (const item of held) {
      const now = byKind.get(item.kind) ?? { units: 0, credits: 0 };
      byKind.set(item.kind, { units: now.units + item.units, credits: now.credits + item.credits });
    }
    for (const [aiKind, left] of byKind) {
      if (left.units > 0 || left.credits > 0) await refundAi(user.id, aiKind, Math.max(0, left.units), Math.max(0, left.credits));
    }
  };

  const running: Promise<RexJobOutcome<T>> = (async () => {
    try {
      const result = await work(context);
      if (jobId) {
        await db.rexJob
          .update({ where: { id: jobId }, data: { status: "done", result: asJson(result), error: null } })
          .catch((error) => console.error("[rex-jobs] saving the result failed", error));
      }
      return { status: "done", result, jobId, replayed: false } as const;
    } catch (error) {
      await giveBackAll();
      if (jobId) {
        // A blocked job (no credits) never ran: hide it from "Rex finished…" and let the same key try again.
        const blocked = error instanceof RexJobBlocked;
        await db.rexJob
          .update({ where: { id: jobId }, data: { status: "failed", error: blocked ? "blocked" : errorMessage(error), creditsCharged: 0, ...(blocked ? { seenAt: new Date() } : {}) } })
          .catch((saveError) => console.error("[rex-jobs] saving the failure failed", saveError));
      }
      if (error instanceof RexJobBlocked) return { status: "blocked", response: error.response } as const;
      return { status: "failed", jobId, error, message: errorMessage(error) } as const;
    }
  })();

  // The seller may be gone by the time it finishes: keep the function alive until the result is saved.
  keepAlive(running);
  return running;
}

/** The pending answer (202) a generating route gives while its job is still running. */
export function rexPendingBody(jobId: string) {
  return { pending: true as const, rexJobId: jobId };
}
