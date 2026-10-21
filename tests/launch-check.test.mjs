// Admin › Developers › Launch settings (src/lib/launch-check/pure.ts): which keys are set, and every scheduled job
// the app has is scheduled somewhere (pg_cron, QStash or Vercel Cron).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const lc = await import("../src/lib/launch-check/pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("settings: set, missing, placeholders and either-of keys", () => {
  const rows = lc.settingStatus({ RESEND_API_KEY: "re_live", CRON_SECRET: "  ", PAYSTACK_SECRET_KEY: "your_secret", BULKSMSNIGERIA_API_TOKEN: "tok" });
  const by = (label) => rows.find((r) => r.label === label);
  assert.equal(by("Resend API key").set, true);
  assert.equal(by("Cron secret").set, false, "blank doesn't count");
  assert.equal(by("Paystack secret key").set, false, "example placeholders don't count");
  assert.equal(by("SMS provider").set, true);
  assert.equal(by("SMS provider").setKey, "BULKSMSNIGERIA_API_TOKEN");
  for (const key of ["CRON_SECRET", "SUPABASE_SEND_SMS_HOOK_SECRET", "INBOX_ENCRYPTION_KEY", "INTEGRATIONS_ENCRYPTION_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL"]) {
    assert.equal(lc.SETTING_CHECKS.find((c) => c.keys.includes(key))?.level, "required", `${key} is required`);
  }
  assert.ok(lc.SETTING_CHECKS.some((c) => c.keys.includes("CAMPAIGN_PREVIEW_SECRET")));
  const example = read(".env.local.example");
  for (const key of lc.SETTING_CHECKS.flatMap((c) => c.keys)) assert.match(example, new RegExp(`^#?\\s*${key}=`, "m"), `${key} is documented in .env.local.example`);
});

test("jobs: running, failing, paused, missing, and a refused run explains the secret", () => {
  const at = new Date("2026-10-21T10:00:00Z");
  const rows = [
    { jobname: "send-scheduled-campaigns", active: true, schedule: "*/5 * * * *", lastRun: at, lastStatus: "succeeded", lastHttp: 200 },
    { jobname: "expire-unpaid-orders", active: true, schedule: "*/5 * * * *", lastRun: at, lastStatus: "failed", lastHttp: null },
    { jobname: "supplier-acceptance", active: false, schedule: "*/5 * * * *", lastRun: null, lastStatus: null, lastHttp: null },
    { jobname: "push-receipts", active: true, schedule: "*/5 * * * *", lastRun: at, lastStatus: "succeeded", lastHttp: 401 },
    { jobname: "sales-channels-sync", active: true, schedule: "23 */2 * * *", lastRun: null, lastStatus: null, lastHttp: null },
  ];
  const status = Object.fromEntries(lc.jobStatus(rows).map((j) => [j.path, j]));
  assert.equal(status["/api/cron/campaigns"].health, "running");
  assert.equal(status["/api/cron/expire-orders"].health, "failing");
  assert.equal(status["/api/cron/supplier-acceptance"].health, "paused");
  assert.equal(status["/api/cron/push-receipts"].health, "failing");
  assert.match(status["/api/cron/push-receipts"].detail, /CRON_SECRET/);
  assert.equal(status["/api/cron/sales-channels"].health, "running", "the old job name counts");
  assert.equal(status["/api/cron/money-owed"].health, "missing");
  assert.equal(status["/api/cron/reviews"].health, "vercel");
});

test("every /api/cron route is scheduled somewhere, and the lists agree", () => {
  const routes = readdirSync(new URL("../src/app/api/cron", import.meta.url)).filter((d) => existsSync(new URL(`../src/app/api/cron/${d}/route.ts`, import.meta.url)));
  const known = new Set(lc.SCHEDULED_JOBS.map((j) => j.path));
  for (const route of routes) assert.ok(known.has(`/api/cron/${route}`), `/api/cron/${route} is in SCHEDULED_JOBS`);

  const qstash = read("scripts/qstash-schedules.mjs");
  const vercel = JSON.parse(read("vercel.json")).crons.map((c) => c.path);
  for (const job of lc.SCHEDULED_JOBS) {
    if (job.vercel) assert.ok(vercel.includes(job.path), `${job.path} is in vercel.json`);
    else assert.match(qstash, new RegExp(`id: "${job.qstash}", path: "${job.path.replace(/\//g, "\\/")}"`), `${job.path} is in scripts/qstash-schedules.mjs`);
  }
  const sql = readdirSync(new URL("../docs/migrations", import.meta.url)).map((f) => read(`docs/migrations/${f}`)).join("\n");
  for (const job of lc.SCHEDULED_JOBS.filter((j) => !j.vercel)) {
    assert.ok(job.pgCron.some((name) => sql.includes(`'${name}'`)), `${job.path} has a pg_cron job in docs/migrations`);
  }
});
