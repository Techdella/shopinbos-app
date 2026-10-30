"use client";

import { useEffect, useRef, useState } from "react";
import {
  forgetRexKey,
  isRexPending,
  newRexKey,
  REX_POLL_MAX_MS,
  REX_POLL_MS,
  rexKeyFor,
  rexRequestSignature,
  type KeyStore,
  type RexJobKind,
  type RexJobView,
} from "@shared/rex-jobs";

// Browser side of Rex jobs (shared/rex-jobs.ts, src/lib/ai/rex-jobs.server.ts).
//
//   rexPost(url, payload, { slot }) sends one "Generate" tap with a clientKey kept in localStorage until the result
//   is on screen, so a retry after the connection drops reuses it (no second charge, the saved result comes back);
//   a 202 { pending } is polled until Rex finishes. useRexResume(kinds, onResult) picks up, when a Rex screen
//   opens, what Rex finished (or is still making) while the seller was away.

function keyStore(): KeyStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class RexRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls one job until it's done or failed (or REX_POLL_MAX_MS passes: then it's still pending, try again later). */
export async function waitForRexJob(id: string, options: { signal?: { cancelled: boolean } } = {}): Promise<RexJobView | null> {
  const until = Date.now() + REX_POLL_MAX_MS;
  while (Date.now() < until && !options.signal?.cancelled) {
    await sleep(REX_POLL_MS);
    const response = await fetch(`/api/app/rex-jobs/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    if (!response) continue; // offline for a moment: keep trying
    if (response.status === 404) return null;
    const body = (await response.json().catch(() => null)) as { data?: RexJobView } | null;
    const job = body?.data;
    if (job && job.status !== "pending") return job;
  }
  return null;
}

/** Says the seller has seen these results, so they aren't offered again. Never throws. */
export async function markRexJobsSeen(ids: string[]) {
  if (!ids.length) return;
  await fetch("/api/app/rex-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => null);
}

/** The person's Rex jobs of these kinds not yet seen (done, pending or failed), newest first. */
export async function fetchUnseenRexJobs(kinds: RexJobKind[]): Promise<RexJobView[]> {
  const response = await fetch(`/api/app/rex-jobs?unseen=1&kind=${kinds.join(",")}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return [];
  const body = (await response.json().catch(() => null)) as { data?: RexJobView[] } | null;
  return Array.isArray(body?.data) ? body.data : [];
}

/**
 * POSTs a paid Rex request as a resumable job. `slot` names the button (e.g. "logo"); the same ask on the same slot
 * reuses its key until the answer is on screen. Resolves with the route's answer (unwrapped from { data } when
 * `envelope`), the same shape whether it came straight back or was polled. Throws RexRequestError on a refusal
 * (402 credits, 429 cap, 4xx/5xx), a TypeError when offline (the key is kept for the retry).
 */
export async function rexPost<T>(url: string, payload: Record<string, unknown>, options: { slot: string; envelope?: boolean }): Promise<T & { rexJobId?: string | null; resumed?: boolean }> {
  const store = keyStore();
  const clientKey = rexKeyFor(store, options.slot, rexRequestSignature(options.slot, payload), newRexKey);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, clientKey }) });
  const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const body = (options.envelope && raw && typeof raw === "object" && "data" in raw ? raw.data : raw) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = (raw?.error ?? null) as { code?: string; message?: string } | string | null;
    const message = typeof error === "string" ? error : error?.message ?? "Rex couldn't do that just now.";
    // A refusal before anything ran (no credits, today's cap): the next tap is a new ask.
    if (response.status === 402 || response.status === 429 || response.status === 400) forgetRexKey(store, options.slot);
    throw new RexRequestError(message, response.status, typeof error === "string" ? undefined : error?.code, raw);
  }
  if (isRexPending(body)) {
    const job = await waitForRexJob(body.rexJobId);
    if (!job) throw new RexRequestError("Rex is still working on it. It will be here when it's done.", 202, "REX_PENDING");
    if (job.status === "failed") {
      forgetRexKey(store, options.slot);
      throw new RexRequestError(job.error ?? "Rex couldn't finish that. Your credits were given back.", 500, "REX_FAILED");
    }
    forgetRexKey(store, options.slot);
    void markRexJobsSeen([job.id]);
    return { ...(job.result ?? {}), rexJobId: job.id, resumed: true } as T & { rexJobId?: string | null; resumed?: boolean };
  }
  forgetRexKey(store, options.slot);
  const jobId = typeof body?.rexJobId === "string" ? body.rexJobId : null;
  if (jobId) void markRexJobsSeen([jobId]);
  return (body ?? {}) as T & { rexJobId?: string | null; resumed?: boolean };
}

/** A key for a request that isn't JSON-in/JSON-out (the voiceover's MP3): same rules as rexPost. */
export function rexKey(slot: string, payload: unknown) {
  return rexKeyFor(keyStore(), slot, rexRequestSignature(slot, payload), newRexKey);
}

export function rexKeyDone(slot: string) {
  forgetRexKey(keyStore(), slot);
}

/**
 * When a Rex screen opens: the newest unseen finished job of these kinds goes to `onResult` (and is marked seen),
 * a pending one is polled first. Returns the job shown (for "Rex finished … while you were away") and whether one
 * is still being made.
 */
export function useRexResume(kinds: RexJobKind[], onResult: (job: RexJobView) => void, enabled = true) {
  const [resumed, setResumed] = useState<RexJobView | null>(null);
  const [waiting, setWaiting] = useState(false);
  const handler = useRef(onResult);
  handler.current = onResult;
  const kindKey = kinds.join(",");

  useEffect(() => {
    if (!enabled) return;
    const signal = { cancelled: false };
    void (async () => {
      const jobs = await fetchUnseenRexJobs(kindKey.split(",") as RexJobKind[]);
      const latest = jobs[0];
      if (!latest || signal.cancelled) return;
      let job: RexJobView | null = latest;
      if (latest.status === "pending") {
        setWaiting(true);
        job = await waitForRexJob(latest.id, { signal });
        if (!signal.cancelled) setWaiting(false);
      }
      if (!job || signal.cancelled) return;
      // Older unseen ones of the same kinds are superseded by the newest.
      void markRexJobsSeen(jobs.filter((item) => item.status !== "pending").map((item) => item.id).concat(job.id));
      if (job.status !== "done" || !job.result) return;
      setResumed(job);
      handler.current(job);
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [kindKey, enabled]);

  return { resumed, waiting, dismiss: () => setResumed(null) };
}
