// Rider pay: what the partner pays each rider (src/lib/logistics/job-rules.ts), saved on the job when it's delivered,
// and shown in the Riders app (web and phone) instead of delivery fees once it's set.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = await import("../src/lib/logistics/job-rules.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const job = { deliveryFee: 3000, platformFee: 300, netAmount: 2700 };

test("pay per delivery, or a share of the fee after the Shopinbos fee", () => {
  assert.equal(rules.riderPayFor({ payType: "per_drop", payRate: 800 }, job), 800);
  assert.equal(rules.riderPayFor({ payType: "share", payRate: 60 }, job), 1620);
  // Older jobs without netAmount fall back to the fee minus the platform fee.
  assert.equal(rules.riderPayFor({ payType: "share", payRate: 50 }, { deliveryFee: 2000, platformFee: 200, netAmount: 0 }), 900);
  assert.equal(rules.riderPayFor({ payType: null, payRate: null }, job), null);
  assert.equal(rules.riderPayFor(null, job), null);
  assert.equal(rules.riderPayFor({ payType: "per_drop", payRate: 0 }, job), null);
});

test("the app shows earnings once pay is set, keeps what was saved at delivery, else delivery fees", () => {
  const rule = { payType: "per_drop", payRate: 700 };
  assert.equal(rules.riderAmount(rule, job), 700);
  assert.equal(rules.riderAmount(rule, { ...job, riderPay: 500 }), 500, "a later pay change never rewrites a delivered job");
  assert.equal(rules.riderAmount({ payType: null, payRate: null }, job), 2700, "no pay set: the delivery fee, as before");
  assert.equal(rules.riderEarning({ payType: null, payRate: null }, { ...job, riderPay: 500 }), 500);
  assert.equal(rules.riderEarning({ payType: null, payRate: null }, job), null);
});

test("what a partner types for a rider's pay is checked", () => {
  assert.deepEqual(rules.parseRiderPay("per_drop", "₦1,500"), { ok: true, rule: { payType: "per_drop", payRate: 1500 } });
  assert.deepEqual(rules.parseRiderPay("share", "62.5%"), { ok: true, rule: { payType: "share", payRate: 62.5 } });
  assert.deepEqual(rules.parseRiderPay("none", ""), { ok: true, rule: { payType: null, payRate: null } });
  assert.deepEqual(rules.parseRiderPay(null, null), { ok: true, rule: { payType: null, payRate: null } });
  assert.equal(rules.parseRiderPay("share", "120").ok, false);
  assert.equal(rules.parseRiderPay("per_drop", "0").ok, false);
  assert.equal(rules.parseRiderPay("per_drop", "abc").ok, false);
  assert.equal(rules.parseRiderPay("hourly", "500").ok, false);
});

test("pay is saved on the job at delivery and every rider screen uses riderAmount", () => {
  const jobs = read("src/lib/logistics/jobs.ts");
  assert.match(jobs, /data\.riderPay = pay/);
  assert.match(jobs, /job\.riderPay === null/);
  for (const path of ["src/app/rider/[token]/page.tsx", "src/app/api/mobile/logistics/rider/route.ts", "src/lib/logistics/rider-app.server.ts"]) {
    const source = read(path);
    assert.match(source, /riderAmount\(rider, job\)/, path);
    assert.doesNotMatch(source, /bookingNet/, path);
    assert.match(source, /riderPay: true/, path);
  }
  assert.match(read("src/lib/logistics/rider-session.ts"), /payType: true, payRate: true/);
  assert.match(read("src/app/rider/[token]/RiderApp.tsx"), /paySet \? "app\.earnedToday" : "app\.feesToday"/);
  assert.match(read("src/app/logistics/couriers/page.tsx"), /action=\{setRiderPay\}/);
});

test("schema and migration", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /payType\s+String\?/);
  assert.match(schema, /payRate\s+Float\?/);
  assert.match(schema, /riderPay\s+Float\?/);
  const sql = read("docs/migrations/2026-11-18-rider-pay.sql");
  assert.match(sql, /ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "payType" TEXT;/);
  assert.match(sql, /ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "payRate" DOUBLE PRECISION;/);
  assert.match(sql, /ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "riderPay" DOUBLE PRECISION;/);
});

test("copy exists in every language", async () => {
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const rider = (await import(`../shared/i18n/messages/rider/${lang}.ts`)).default;
    const logistics = (await import(`../shared/i18n/messages/logistics/${lang}.ts`)).default;
    for (const key of ["app.earnedToday", "run.youEarn"]) assert.ok(rider[key], `${lang} rider ${key}`);
    for (const key of ["riders.payToday", "riders.payLabel", "riders.payHow", "riders.paySave", "riders.payHint"]) assert.ok(logistics[key], `${lang} logistics ${key}`);
  }
});
