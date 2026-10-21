import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { assertPublicUrl } from "@/lib/security/safe-fetch.server";
import { WEBHOOK_RETRY_DELAYS_MS, buildEventEnvelope, nextWebhookAttempt, signWebhook, webhookWants, type PartnerEventName } from "./partner-api-core";

// Partner webhooks (job.offered, job.updated, job.cancelled, cod.reminder), signed with each webhook's secret.
// Callers fire and forget, so nothing here throws.
//
// Retries: every event is saved to the queue (PartnerWebhookDelivery) before the first attempt. A failed delivery is
// retried 3 times (after 2s, 10s and 30s) inside the same request's lifetime, using next/server `after()` so the
// caller's response isn't held up. If it still fails, /api/cron/partner-webhooks tries again after 5 minutes,
// 30 minutes, 2 hours, 6 hours and 24 hours (WEBHOOK_QUEUE_DELAYS_MS), then gives up. Partners can always read the
// current state from GET /v1/partner/jobs, and the event id never changes between attempts so they can skip repeats.
export type PartnerEvent = PartnerEventName;

type Hook = { id: string; url: string; secret: string };

const TIMEOUT_MS = 5_000;
const QUEUE_BATCH = 50;
const KEEP_DELIVERED_MS = 30 * 24 * 3_600_000;

export async function emitPartnerEvent(partnerId: string, event: PartnerEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const hooks = await db.partnerWebhook.findMany({
      where: { logisticsPartnerId: partnerId, active: true },
      select: { id: true, url: true, secret: true, events: true },
    });
    const targets = hooks.filter((hook) => webhookWants(hook.events, event));
    if (!targets.length) return;

    const body = JSON.stringify(buildEventEnvelope(event, payload));
    // Queued first, due once the in-request round would be over: if this function dies mid-way, the cron still sends it.
    const queued = await Promise.all(
      targets.map((hook) =>
        db.partnerWebhookDelivery
          .create({ data: { webhookId: hook.id, event, body, nextAttemptAt: nextWebhookAttempt(1) }, select: { id: true } })
          .then((row) => ({ hook, deliveryId: row.id as string | null }))
          .catch(() => ({ hook, deliveryId: null })),
      ),
    );
    const run = () => Promise.all(queued.map(({ hook, deliveryId }) => deliverWithRetries(hook, event, body, deliveryId))).then(() => undefined);
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
    // The URL was checked when saved, but its DNS can change since: never deliver into our own network.
    await assertPublicUrl(hook.url, { httpsOnly: true });
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

async function deliverWithRetries(hook: Hook, event: string, body: string, deliveryId: string | null) {
  let status = await deliverWebhook(hook, event, body);
  for (const delay of WEBHOOK_RETRY_DELAYS_MS) {
    if (isDelivered(status)) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    status = await deliverWebhook(hook, event, body);
  }
  if (deliveryId) await recordRound(deliveryId, 1, status);
}

/** Saves the outcome of a delivery round: delivered, due again later, or given up. */
async function recordRound(deliveryId: string, rounds: number, status: number, now = new Date()) {
  const delivered = isDelivered(status);
  const next = delivered ? null : nextWebhookAttempt(rounds, now);
  await db.partnerWebhookDelivery
    .update({
      where: { id: deliveryId },
      data: { attempts: rounds, lastStatus: status, nextAttemptAt: next, ...(delivered ? { deliveredAt: now } : next ? {} : { failedAt: now }) },
    })
    .catch(() => null);
}

function isDelivered(status: number) {
  return status >= 200 && status < 300;
}

/**
 * The retry queue (/api/cron/partner-webhooks, every 5 minutes): one attempt for each delivery that's due, oldest first.
 * Deliveries to a webhook that was switched off are given up. Delivered rows older than 30 days are cleared.
 */
export async function retryDueWebhooks(now = new Date()) {
  const due = await db.partnerWebhookDelivery.findMany({
    where: { nextAttemptAt: { lte: now }, deliveredAt: null, failedAt: null },
    orderBy: { nextAttemptAt: "asc" },
    take: QUEUE_BATCH,
    select: { id: true, event: true, body: true, attempts: true, webhook: { select: { id: true, url: true, secret: true, active: true } } },
  });
  let delivered = 0;
  let waiting = 0;
  let givenUp = 0;
  for (const row of due) {
    if (!row.webhook.active) {
      await db.partnerWebhookDelivery.update({ where: { id: row.id }, data: { nextAttemptAt: null, failedAt: now } }).catch(() => null);
      givenUp += 1;
      continue;
    }
    const status = await deliverWebhook(row.webhook, row.event, row.body);
    const rounds = row.attempts + 1;
    await recordRound(row.id, rounds, status, new Date());
    if (isDelivered(status)) delivered += 1;
    else if (nextWebhookAttempt(rounds, now)) waiting += 1;
    else givenUp += 1;
  }
  const cleared = await db.partnerWebhookDelivery
    .deleteMany({ where: { deliveredAt: { lt: new Date(now.getTime() - KEEP_DELIVERED_MS) } } })
    .then((result) => result.count)
    .catch(() => 0);
  return { tried: due.length, delivered, waiting, givenUp, cleared };
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
