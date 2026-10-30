import "expo-sqlite/localStorage/install";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { tNow } from "./app-locale";
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

// Rex jobs on the phone (shared/rex-jobs.ts, src/lib/ai/rex-jobs.server.ts; the web's twin is
// src/lib/ai/rex-jobs-client.ts). A paid Rex request (logos, banners, Create with Rex designs, video scripts and
// shots) carries a clientKey kept on the phone until the result is on screen, so asking again after losing signal
// or pressing back reuses it: the saved result comes back and nothing is charged twice. useRexResume picks up, when
// a Rex screen opens, what Rex finished (or is still making) while the seller was away.

function keyStore(): KeyStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls one job until it's done or failed; null when it's still going after REX_POLL_MAX_MS (or isn't there). */
export async function waitForRexJob(id: string, signal?: { cancelled: boolean }): Promise<RexJobView | null> {
  const until = Date.now() + REX_POLL_MAX_MS;
  while (Date.now() < until && !signal?.cancelled) {
    await sleep(REX_POLL_MS);
    try {
      const job = await api<RexJobView>(`/api/app/rex-jobs/${encodeURIComponent(id)}`);
      if (job && job.status !== "pending") return job;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      // Offline for a moment: keep trying.
    }
  }
  return null;
}

export async function markRexJobsSeen(ids: string[]) {
  if (!ids.length) return;
  await api("/api/app/rex-jobs", { method: "POST", json: { ids } }).catch(() => null);
}

export async function fetchUnseenRexJobs(kinds: RexJobKind[]): Promise<RexJobView[]> {
  const rows = await api<RexJobView[]>(`/api/app/rex-jobs?unseen=1&kind=${kinds.join(",")}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

/** Thrown when Rex is still working after the wait: the result turns up when the screen opens again. */
export class RexStillWorking extends Error {
  constructor(readonly jobId: string) {
    super(tNow("rexJobs")("resume.stillWorking"));
  }
}

/**
 * POSTs a paid Rex request as a resumable job (`slot` names the button). Resolves with the route's answer, the same
 * shape whether it came straight back or was polled. Throws ApiError on a refusal (402 credits, 429 cap…), ApiError
 * status 0 when offline (the key is kept, so tapping again doesn't pay twice), RexStillWorking after a long wait.
 */
export async function rexApi<T>(path: string, payload: Record<string, unknown>, slot: string): Promise<T & { rexJobId?: string | null; resumed?: boolean }> {
  const store = keyStore();
  const clientKey = rexKeyFor(store, slot, rexRequestSignature(slot, payload), newRexKey);
  let body: unknown;
  try {
    body = await api<unknown>(path, { method: "POST", json: { ...payload, clientKey } });
  } catch (error) {
    // Refused before anything ran (no credits, today's cap, a bad ask): the next tap is a new ask.
    if (error instanceof ApiError && error.status !== 0 && error.status < 500) forgetRexKey(store, slot);
    throw error;
  }
  if (isRexPending(body)) {
    const job = await waitForRexJob(body.rexJobId);
    if (!job) throw new RexStillWorking(body.rexJobId);
    forgetRexKey(store, slot);
    if (job.status === "failed") throw new ApiError(job.error ?? "Rex couldn't finish that. Your credits were given back.", 500, "REX_FAILED");
    void markRexJobsSeen([job.id]);
    return { ...(job.result ?? {}), rexJobId: job.id, resumed: true } as T & { rexJobId?: string | null; resumed?: boolean };
  }
  forgetRexKey(store, slot);
  const jobId = body && typeof body === "object" && typeof (body as { rexJobId?: unknown }).rexJobId === "string" ? ((body as { rexJobId: string }).rexJobId) : null;
  if (jobId) void markRexJobsSeen([jobId]);
  return body as T & { rexJobId?: string | null; resumed?: boolean };
}

/**
 * When a Rex screen opens: the newest unseen finished job of these kinds goes to `onResult` (and is marked seen); a
 * pending one is polled first (`waiting` meanwhile). `resumed` is the job shown, for "Rex finished … while you were away".
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
        job = await waitForRexJob(latest.id, signal);
        if (!signal.cancelled) setWaiting(false);
      }
      if (!job || signal.cancelled) return;
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
