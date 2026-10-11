import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { WEBHOOK_RETRY_DELAYS_MS, buildEventEnvelope, signWebhook, webhookWants, type PartnerEventName } from "./partner-api-core";

// Partner webhooks (job.offered, job.updated, job.cancelled, cod.reminder), signed with each webhook's secret.
// Callers fire and forget, so nothing here throws.
//
// Retries: a failed delivery is retried 3 times (after 2s, 10s and 30s) inside the same request's lifetime, using
// next/server `after()` so the caller's response isn't held up. There is no delivery queue, so an endpoint that is
// down for longer than that misses the event; partners can always read the current state from GET /v1/partner/jobs.
export type PartnerEvent = PartnerEventName;

type Hook = { id: string; url: string; secret: string };

const TIMEOUT_MS = 5_000;

export async function emitPartnerEvent(partnerId: string, event: PartnerEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const hooks = await db.partnerWebhook.findMany({
      where: { logisticsPartnerId: partnerId, active: true },
      select: { id: true, url: true, secret: true, events: true },
    });
    const targets = hooks.filter((hook) => webhookWants(hook.events, event));
    if (!targets.length) return;

    const body = JSON.stringify(buildEventEnvelope(event, payload));
    const run = () => Promise.all(targets.map((hook) => deliverWithRetries(hook, event, body))).then(() => undefined);
    try {
      after(run);
    } catch {
      // Outside a request (scripts, or after the response has finished): send without waiting.
      void run().catch(() => undefined);
    }
  } catch {
    // Webhooks never break the action that triggered them.
  }
}

/** One signed POST. Returns the HTTP status, or 0 when the endpoint couldn't be reached in time. */
export async function deliverWebhook(hook: Hook, event: string, body: string): Promise<number> {
  let status = 0;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Shopinbos-Webhooks/1",
        "Shopinbos-Event": event,
        "Shopinbos-Signature": signWebhook(hook.secret, body, timestamp),
      },
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    await response.body?.cancel().catch(() => undefined);
  } catch {
    status = 0;
  }
  const delivered = status >= 200 && status < 300;
  await db.partnerWebhook
    .update({ where: { id: hook.id }, data: { lastStatus: status, ...(delivered ? { lastDeliveredAt: new Date() } : {}) } })
    .catch(() => null);
  return status;
}

async function deliverWithRetries(hook: Hook, event: string, body: string) {
  if (isDelivered(await deliverWebhook(hook, event, body))) return;
  for (const delay of WEBHOOK_RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (isDelivered(await deliverWebhook(hook, event, body))) return;
  }
}

function isDelivered(status: number) {
  return status >= 200 && status < 300;
}

/** "Send test event" on the Connect page: one attempt, no retries, so the partner sees the real answer. */
export async function sendTestEvent(partnerId: string, webhookId: string): Promise<{ ok: boolean; status: number } | null> {
  const hook = await db.partnerWebhook.findFirst({ where: { id: webhookId, logisticsPartnerId: partnerId }, select: { id: true, url: true, secret: true } });
  if (!hook) return null;
  const body = JSON.stringify(
    buildEventEnvelope("job.updated", { test: true, id: "job_test", status: "in_transit", actor: "api", note: "Test event from your Shopinbos dashboard." }),
  );
  const status = await deliverWebhook(hook, "job.updated", body);
  return { ok: isDelivered(status), status };
}
