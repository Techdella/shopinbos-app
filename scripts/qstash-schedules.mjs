#!/usr/bin/env node
// Creates (or updates) the QStash schedules that run Shopinbos's scheduled jobs (/api/cron/*), replacing the
// Supabase pg_cron jobs that used to call them. Safe to run again: each schedule has a fixed id, so a re-run
// updates it in place.
//
//   QSTASH_TOKEN=... node scripts/qstash-schedules.mjs https://app.shopinbos.com            # create / update
//   QSTASH_TOKEN=... node scripts/qstash-schedules.mjs https://app.shopinbos.com --paused   # create paused
//   QSTASH_TOKEN=... node scripts/qstash-schedules.mjs --list
//   QSTASH_TOKEN=... node scripts/qstash-schedules.mjs --resume | --pause | --delete
//
// QSTASH_URL picks the region (default https://qstash-us-east-1.upstash.io, next to the Vercel functions).
// The app must already be deployed with QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY, or every call is a 401
// (src/lib/auth/cron-request.ts). Once the schedules run, switch off the matching pg_cron jobs (docs/qstash.md).
//
// Each job gets 3 retries and parallelism 1 (a slow run is never overlapped by the next one). Runs that still fail
// land in the QStash DLQ (console.upstash.com → QStash → DLQ).

import { Client } from "@upstash/qstash";

// Same cadence as the pg_cron jobs they replace (cron is UTC). Not here: rider-trail-cleanup (plain SQL, stays in
// pg_cron) and /api/cron/reviews (Vercel Cron, vercel.json).
export const JOBS = [
  { id: "campaigns", path: "/api/cron/campaigns", cron: "*/5 * * * *" },
  { id: "expire-orders", path: "/api/cron/expire-orders", cron: "*/5 * * * *" },
  { id: "supplier-acceptance", path: "/api/cron/supplier-acceptance", cron: "*/5 * * * *" },
  { id: "push-receipts", path: "/api/cron/push-receipts", cron: "*/5 * * * *" },
  { id: "marketing", path: "/api/cron/marketing", cron: "*/10 * * * *" },
  { id: "unread-message-emails", path: "/api/conversations/cron", cron: "*/10 * * * *" },
  { id: "product-news", path: "/api/cron/product-news", cron: "*/10 * * * *" },
  { id: "whatsapp-catalog", path: "/api/cron/whatsapp-catalog", cron: "*/15 * * * *" },
  { id: "partner-payins", path: "/api/cron/partner-payins", cron: "*/15 * * * *" },
  { id: "verification-reminders", path: "/api/cron/verification-reminders", cron: "17 * * * *" },
  { id: "seasonal-campaigns", path: "/api/cron/seasonal-campaigns", cron: "*/5 * * * *" },
  { id: "gmail-sync", path: "/api/cron/gmail-sync", cron: "*/5 * * * *" },
  { id: "lead-growth", path: "/api/cron/lead-growth", cron: "*/10 * * * *" },
  { id: "sales-channels", path: "/api/cron/sales-channels", cron: "23 */2 * * *" },
  { id: "domain-renewals", path: "/api/cron/domain-renewals", cron: "17 7 * * *" },
  // Monday 06:00 UTC, then every 20 minutes until 09:40 to carry on with a large send.
  { id: "weekly-summary", path: "/api/cron/weekly-summary", cron: "0 6 * * 1" },
  { id: "weekly-summary-continue", path: "/api/cron/weekly-summary", cron: "20,40 6-9 * * 1" },
];

const PREFIX = "shopinbos-";

async function main() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("Set QSTASH_TOKEN (console.upstash.com → QStash)");
  const client = new Client({ token, baseUrl: process.env.QSTASH_URL || "https://qstash-us-east-1.upstash.io" });
  const args = process.argv.slice(2);
  const ids = JOBS.map((job) => PREFIX + job.id);

  if (args.includes("--list")) {
    const ours = (await client.schedules.list()).filter((s) => s.scheduleId.startsWith(PREFIX));
    for (const s of ours) console.log(`${s.scheduleId.padEnd(40)} ${s.cron.padEnd(18)} ${s.isPaused ? "paused " : "active "} ${s.destination}`);
    if (!ours.length) console.log("No Shopinbos schedules yet.");
    return;
  }
  for (const action of ["pause", "resume", "delete"]) {
    if (!args.includes(`--${action}`)) continue;
    for (const id of ids) {
      if (action === "delete") await client.schedules.delete(id).catch((error) => console.warn(`${id}: ${error.message}`));
      else await client.schedules[action]({ schedule: id });
      console.log(`${action}d ${id}`);
    }
    return;
  }

  const base = args.find((arg) => !arg.startsWith("--"))?.replace(/\/+$/, "");
  if (!base || !/^https:\/\//.test(base)) throw new Error("Pass the app's https base URL, e.g. https://app.shopinbos.com");
  const paused = args.includes("--paused");

  for (const job of JOBS) {
    const scheduleId = PREFIX + job.id;
    await client.schedules.create({
      scheduleId,
      destination: base + job.path,
      cron: job.cron,
      method: "GET",
      retries: 3,
      timeout: "300s",
      flowControl: { key: scheduleId, parallelism: 1 },
      label: "shopinbos-cron",
    });
    if (paused) await client.schedules.pause({ schedule: scheduleId });
    console.log(`${paused ? "paused " : "active "} ${scheduleId.padEnd(40)} ${job.cron.padEnd(18)} ${base + job.path}`);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
