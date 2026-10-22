// Partner webhooks' retry queue (src/lib/logistics/webhooks.ts, /api/cron/partner-webhooks) and the cod.reminder
// event sent with the pay-in reminder (src/lib/logistics/payin-standing.server.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = await import("../src/lib/logistics/partner-api-core.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("failed deliveries are tried again after 5 min, 30 min, 2 h, 6 h and 24 h, then given up", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  const gap = (rounds) => (core.nextWebhookAttempt(rounds, now)?.getTime() ?? NaN) - now.getTime();
  assert.equal(gap(1), 5 * 60_000);
  assert.equal(gap(2), 30 * 60_000);
  assert.equal(gap(3), 2 * 3_600_000);
  assert.equal(gap(4), 6 * 3_600_000);
  assert.equal(gap(5), 24 * 3_600_000);
  assert.equal(core.nextWebhookAttempt(6, now), null);
  assert.equal(core.nextWebhookAttempt(0, now), null);
});

test("every event is queued before the first attempt, and the cron works the queue", () => {
  const webhooks = read("src/lib/logistics/webhooks.ts");
  assert.match(webhooks, /partnerWebhookDelivery\s*\n?\s*\.create/);
  assert.match(webhooks, /nextAttemptAt: nextWebhookAttempt\(1\)/);
  assert.match(webhooks, /export async function retryDueWebhooks/);
  assert.match(webhooks, /failedAt: now/);
  const route = read("src/app/api/cron/partner-webhooks/route.ts");
  assert.match(route, /cronDenied\(req\)/);
  assert.match(route, /retryDueWebhooks/);
  assert.match(read("scripts/qstash-schedules.mjs"), /\{ id: "partner-webhooks", path: "\/api\/cron\/partner-webhooks", cron: "\*\/5 \* \* \* \*" \}/);
});

test("cod.reminder goes out with the pay-in reminder and when it's overdue", () => {
  const source = read("src/lib/logistics/payin-standing.server.ts");
  assert.match(source, /emitPartnerEvent\(partner\.id, "cod\.reminder"/);
  assert.match(source, /step\.kind === "reminder" \? "due" : "overdue"/);
});

test("schema and migration", () => {
  assert.match(read("prisma/schema.prisma"), /model PartnerWebhookDelivery \{/);
  const sql = read("docs/migrations/2026-11-18-partner-webhook-queue.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "PartnerWebhookDelivery"/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});
