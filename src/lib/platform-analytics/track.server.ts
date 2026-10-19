import "server-only";

import { randomUUID } from "node:crypto";
import { mixpanelConfig, posthogConfig } from "./config";

// Server-side events to every connected analytics tool (sign-ups, leads coming in, leads converting). These don't
// depend on a browser running the SDK, so ad blockers don't hide sign-ups. The distinct id is the Supabase user id,
// the same id the browser SDKs identify people with (src/components/analytics/ProductAnalytics.tsx); a lead that
// hasn't signed up yet uses "lead:<id>".
// Never throws and never waits longer than a few seconds.

export type ServerEvent = { event: string; distinctId: string; properties?: Record<string, string | number | boolean | null>; insertId?: string };

const TIMEOUT_MS = 4000;

async function post(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
}

export async function trackServerEvent(input: ServerEvent) {
  const insertId = input.insertId ?? randomUUID();
  const properties = input.properties ?? {};
  const time = Date.now();
  const jobs: Array<Promise<void>> = [];

  const mp = mixpanelConfig();
  if (mp.token) {
    jobs.push(
      post(`${mp.ingestHost}/track?ip=0`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/plain" },
        body: JSON.stringify([{ event: input.event, properties: { ...properties, token: mp.token, distinct_id: input.distinctId, time, $insert_id: insertId.replace(/[^\w-]/g, "").slice(0, 36), source: "server" } }]),
      }),
    );
  }

  const ph = posthogConfig();
  if (ph.key) {
    jobs.push(
      post(`${ph.ingestHost}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: ph.key, event: input.event, distinct_id: input.distinctId, timestamp: new Date(time).toISOString(), properties: { ...properties, $process_person_profile: !input.distinctId.startsWith("lead:"), source: "server" } }),
      }),
    );
  }

  const results = await Promise.allSettled(jobs);
  for (const result of results) if (result.status === "rejected") console.warn("[analytics] server event failed:", input.event, String(result.reason));
}
