// Late cash pay-ins from delivery partners (src/lib/logistics/payin-deadline.ts):
//   - cut-off and due-date maths in Lagos time (before and after 6pm, across midnight), configurable by env;
//   - grace after the cut-off;
//   - flag and unflag transitions (credit counted, the team's "Unpause" respected);
//   - escalation at 24 and 72 hours, strikes per day late;
//   - notification de-duplication keys (stable across runs, new per late period);
//   - the pause excluding only cash-on-delivery jobs;
//   - the wiring: cron route, pay-in hooks, partner pickers, migration.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const d = await import("../src/lib/logistics/payin-deadline.ts");
const rules = await import("../src/lib/logistics/payin-rules.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const cfg = { cutoffHour: 18, graceMinutes: 60 };
const at = (iso) => new Date(iso);
const job = (iso, cash) => ({ codCollected: cash, codCollectedAt: at(iso), createdAt: at(iso) });
const CLEAN = { ...d.CLEAR_STANDING };
const plan = (jobs, now, standing = CLEAN, credit = 0) =>
  d.planPayInStanding({ partnerId: "p1", standing, position: d.payInPosition(jobs, credit, at(now), cfg), now: at(now), config: cfg });
const kinds = (result) => result.steps.map((step) => step.kind);

// ─── Cut-off maths ─────────────────────────────────────────────────────────────

test("cash collected before 6pm Lagos is due 6pm Lagos (17:00 UTC) the same day", () => {
  assert.equal(d.jobDeadline(job("2026-10-12T09:00:00Z", 5000), cfg).toISOString(), "2026-10-12T17:00:00.000Z");
  // 5:59pm Lagos is still today.
  assert.equal(d.jobDeadline(job("2026-10-12T16:59:00Z", 5000), cfg).toISOString(), "2026-10-12T17:00:00.000Z");
});

test("cash collected after 6pm is due 6pm the next day", () => {
  assert.equal(d.jobDeadline(job("2026-10-12T17:00:00Z", 5000), cfg).toISOString(), "2026-10-13T17:00:00.000Z");
  assert.equal(d.jobDeadline(job("2026-10-12T19:30:00Z", 5000), cfg).toISOString(), "2026-10-13T17:00:00.000Z");
});

test("across midnight: 11:30pm and 12:30am Lagos are both due 6pm on the Lagos day after / of", () => {
  // 22:30Z = 11:30pm Lagos on the 12th → after 6pm → 6pm on the 13th.
  assert.equal(d.jobDeadline(job("2026-10-12T22:30:00Z", 1), cfg).toISOString(), "2026-10-13T17:00:00.000Z");
  // 23:30Z = 12:30am Lagos on the 13th (UTC still says the 12th) → 6pm on the 13th, not the 12th.
  assert.equal(d.jobDeadline(job("2026-10-12T23:30:00Z", 1), cfg).toISOString(), "2026-10-13T17:00:00.000Z");
  // Month end: 31 Oct 8pm Lagos → 1 Nov 6pm.
  assert.equal(d.jobDeadline(job("2026-10-31T19:00:00Z", 1), cfg).toISOString(), "2026-11-01T17:00:00.000Z");
});

test("the cut-off hour and grace come from env, with safe defaults", () => {
  assert.deepEqual(d.payInConfig({}), { cutoffHour: 18, graceMinutes: 60 });
  assert.deepEqual(d.payInConfig({ PARTNER_PAYIN_CUTOFF_HOUR: "17", PARTNER_PAYIN_GRACE_MINUTES: "30" }), { cutoffHour: 17, graceMinutes: 30 });
  assert.deepEqual(d.payInConfig({ PARTNER_PAYIN_CUTOFF_HOUR: "25", PARTNER_PAYIN_GRACE_MINUTES: "-5" }), { cutoffHour: 18, graceMinutes: 60 });
  assert.deepEqual(d.payInConfig({ PARTNER_PAYIN_CUTOFF_HOUR: "six", PARTNER_PAYIN_GRACE_MINUTES: "0" }), { cutoffHour: 18, graceMinutes: 0 });
  // A 5pm cut-off moves the deadline and the words.
  assert.equal(d.jobDeadline(job("2026-10-12T09:00:00Z", 1), { cutoffHour: 17, graceMinutes: 60 }).toISOString(), "2026-10-12T16:00:00.000Z");
  assert.equal(rules.payInDue(at("2026-10-12T09:00:00Z"), at("2026-10-12T10:00:00Z"), 17).words, "by 5pm today");
  assert.equal(rules.payInDue(at("2026-10-12T19:00:00Z"), at("2026-10-12T19:30:00Z")).words, "by 6pm tomorrow");
  assert.equal(rules.hourWords(18), "6pm");
  assert.equal(rules.hourWords(12), "12pm");
  assert.equal(rules.hourWords(0), "12am");
});

// ─── Grace ─────────────────────────────────────────────────────────────────────

test("nobody is late during the grace hour after 6pm; late from 7pm", () => {
  const jobs = [job("2026-10-12T09:00:00Z", 5000)];
  assert.equal(d.payInPosition(jobs, 0, at("2026-10-12T17:59:00Z"), cfg).overdue.amount, 0);
  assert.deepEqual(kinds(plan(jobs, "2026-10-12T17:59:00Z")), []);
  const late = d.payInPosition(jobs, 0, at("2026-10-12T18:00:00Z"), cfg);
  assert.equal(late.overdue.amount, 5000);
  assert.equal(late.overdue.since.toISOString(), "2026-10-12T17:00:00.000Z");
  // No grace: late straight after 6pm.
  assert.equal(d.payInPosition(jobs, 0, at("2026-10-12T17:00:00Z"), { cutoffHour: 18, graceMinutes: 0 }).overdue.amount, 5000);
});

test("only cash past its own deadline counts as overdue; credit comes off the oldest", () => {
  const jobs = [job("2026-10-11T09:00:00Z", 5000), job("2026-10-12T09:00:00Z", 3000)];
  const morning = d.payInPosition(jobs, 1000, at("2026-10-12T08:00:00Z"), cfg);
  assert.equal(morning.overdue.amount, 4000);
  assert.equal(morning.owed, 7000);
  assert.deepEqual(morning.next, { deadline: at("2026-10-12T17:00:00Z"), amount: 7000 });
});

// ─── Reminder ──────────────────────────────────────────────────────────────────

test("a 4pm reminder (2 hours before) when cash is still owed, once per deadline", () => {
  const jobs = [job("2026-10-12T09:00:00Z", 5000)];
  assert.deepEqual(kinds(plan(jobs, "2026-10-12T14:59:00Z")), []);
  const first = plan(jobs, "2026-10-12T15:00:00Z");
  assert.deepEqual(kinds(first), ["reminder"]);
  assert.equal(first.steps[0].key, "reminder:p1:2026-10-12T17:00:00.000Z");
  assert.equal(first.steps[0].amount, 5000);
  // Every later run before 6pm produces the same key, so the saved key stops a second message.
  assert.equal(plan(jobs, "2026-10-12T16:45:00Z").steps[0].key, first.steps[0].key);
  // Nothing owed (credit covers it): no reminder.
  assert.deepEqual(kinds(plan(jobs, "2026-10-12T15:00:00Z", CLEAN, 5000)), []);
  // Inside the grace hour: no reminder, not late yet.
  assert.deepEqual(kinds(plan(jobs, "2026-10-12T17:30:00Z")), []);
  assert.equal(d.payInMessage("reminder", { amount: 5000, deadline: at("2026-10-12T17:00:00Z"), account: null, config: cfg, now: at("2026-10-12T15:00:00Z") }).title, "Pay in ₦5,000 by 6pm");
});

// ─── Flag and unflag ───────────────────────────────────────────────────────────

test("late: flagged with the missed deadline and amount, paused from cash-on-delivery jobs", () => {
  const jobs = [job("2026-10-12T09:00:00Z", 5000), job("2026-10-12T10:00:00Z", 2500)];
  const result = plan(jobs, "2026-10-12T18:00:00Z");
  assert.equal(result.changed, true);
  assert.equal(result.standing.codPaused, true);
  assert.equal(result.standing.payInOverdueSince.toISOString(), "2026-10-12T17:00:00.000Z");
  assert.equal(result.standing.payInOverdueAmount, 7500);
  assert.deepEqual(kinds(result), ["overdue", "strike"]);
  assert.equal(result.steps[0].key, "overdue:p1:2026-10-12T17:00:00.000Z");

  // Running again with the saved standing: same keys, nothing changes.
  const again = plan(jobs, "2026-10-12T18:15:00Z", result.standing);
  assert.equal(again.changed, false);
  assert.deepEqual(again.steps.map((step) => step.key), result.steps.map((step) => step.key));
});

test("a part pay-in lowers the overdue amount but keeps the first missed deadline", () => {
  const first = plan([job("2026-10-11T09:00:00Z", 5000), job("2026-10-12T09:00:00Z", 3000)], "2026-10-12T19:00:00Z");
  assert.equal(first.standing.payInOverdueSince.toISOString(), "2026-10-11T17:00:00.000Z");
  const after = plan([job("2026-10-12T09:00:00Z", 3000)], "2026-10-12T19:05:00Z", first.standing);
  assert.equal(after.standing.payInOverdueAmount, 3000);
  assert.equal(after.standing.payInOverdueSince.toISOString(), "2026-10-11T17:00:00.000Z");
  assert.equal(after.standing.codPaused, true);
});

test("paid in: unflagged and unpaused at once, with one 'back to all jobs' message", () => {
  const flagged = plan([job("2026-10-12T09:00:00Z", 5000)], "2026-10-12T18:00:00Z").standing;
  const cleared = plan([], "2026-10-12T18:20:00Z", flagged);
  assert.deepEqual(kinds(cleared), ["cleared"]);
  assert.equal(cleared.steps[0].key, "cleared:p1:2026-10-12T17:00:00.000Z");
  assert.deepEqual(cleared.standing, d.CLEAR_STANDING);
  assert.equal(cleared.changed, true);
  // Idempotent: once cleared there's nothing more to do.
  const again = plan([], "2026-10-12T18:35:00Z", cleared.standing);
  assert.deepEqual(kinds(again), []);
  assert.equal(again.changed, false);
  // Credit that covers the late cash clears too.
  assert.deepEqual(kinds(plan([job("2026-10-12T09:00:00Z", 5000)], "2026-10-12T18:20:00Z", flagged, 5000)), ["cleared"]);
  assert.equal(d.payInMessage("cleared", { amount: 0, deadline: at("2026-10-12T17:00:00Z"), account: null, config: cfg, now: at("2026-10-12T18:20:00Z") }).title, "Thanks, you're back to getting all jobs.");
});

test("the team's Unpause holds until the late period clears; the next late period pauses again", () => {
  const jobs = [job("2026-10-12T09:00:00Z", 5000)];
  const flagged = plan(jobs, "2026-10-12T18:00:00Z").standing;
  const waived = { ...flagged, codPaused: false, payInPauseWaived: true };
  const still = plan(jobs, "2026-10-12T19:00:00Z", waived);
  assert.equal(still.standing.codPaused, false);
  assert.equal(still.standing.payInOverdueAmount, 5000);
  const cleared = plan([], "2026-10-12T20:00:00Z", still.standing);
  assert.equal(cleared.standing.payInPauseWaived, false);
  const nextTime = plan([job("2026-10-13T09:00:00Z", 2000)], "2026-10-13T18:00:00Z", cleared.standing);
  assert.equal(nextTime.standing.codPaused, true);
  assert.equal(nextTime.steps[0].key, "overdue:p1:2026-10-13T17:00:00.000Z");
});

// ─── Escalation ────────────────────────────────────────────────────────────────

test("24 hours late: told again and high priority; 72 hours: review; a strike for every day", () => {
  const jobs = [job("2026-10-12T09:00:00Z", 5000)];
  let standing = plan(jobs, "2026-10-12T18:00:00Z").standing;

  const day = plan(jobs, "2026-10-13T16:59:00Z", standing);
  assert.deepEqual(kinds(day), ["overdue", "strike"]);
  assert.equal(day.standing.payInEscalatedAt, null);

  const escalated = plan(jobs, "2026-10-13T17:00:00Z", standing);
  assert.deepEqual(kinds(escalated), ["overdue", "escalated", "strike", "strike"]);
  assert.equal(escalated.standing.payInEscalatedAt.toISOString(), "2026-10-13T17:00:00.000Z");
  assert.equal(d.lateLevel(escalated.standing), "high");
  standing = escalated.standing;

  const review = plan(jobs, "2026-10-15T17:00:00Z", standing);
  assert.deepEqual(kinds(review), ["overdue", "escalated", "review", "strike", "strike", "strike", "strike"]);
  // The escalation time is kept, the review time is set; still only paused, never suspended here.
  assert.equal(review.standing.payInEscalatedAt.toISOString(), "2026-10-13T17:00:00.000Z");
  assert.equal(review.standing.payInReviewAt.toISOString(), "2026-10-15T17:00:00.000Z");
  assert.equal(review.standing.codPaused, true);
  assert.equal(d.lateLevel(review.standing), "review");
  assert.deepEqual(review.steps.filter((step) => step.kind === "strike").map((step) => step.key), [1, 2, 3, 4].map((n) => `strike:p1:2026-10-12T17:00:00.000Z:${n}`));
  assert.equal(d.lateDays(at("2026-10-12T17:00:00Z"), at("2026-10-12T17:00:00Z")), 1);
  assert.equal(d.lateDays(at("2026-10-12T17:00:00Z"), at("2026-10-12T16:00:00Z")), 0);
});

// ─── De-duplication keys ───────────────────────────────────────────────────────

test("keys are per kind, partner and deadline: the same late period never repeats, a new one does", () => {
  const since = at("2026-10-12T17:00:00Z");
  assert.equal(d.payInKey("overdue", "p1", since), "overdue:p1:2026-10-12T17:00:00.000Z");
  assert.notEqual(d.payInKey("overdue", "p1", since), d.payInKey("overdue", "p2", since));
  assert.notEqual(d.payInKey("overdue", "p1", since), d.payInKey("escalated", "p1", since));
  assert.notEqual(d.payInKey("overdue", "p1", since), d.payInKey("overdue", "p1", at("2026-10-13T17:00:00Z")));
  assert.equal(d.payInKey("strike", "p1", since, 3), "strike:p1:2026-10-12T17:00:00.000Z:3");
  // Every step a plan can produce has a unique key.
  const steps = plan([job("2026-10-12T09:00:00Z", 5000)], "2026-10-16T17:00:00Z").steps;
  assert.equal(new Set(steps.map((step) => step.key)).size, steps.length);
});

// ─── The pause only covers cash-on-delivery jobs ────────────────────────────

test("a late partner gets prepaid jobs but no cash-on-delivery jobs", () => {
  const late = { status: "active", verificationStatus: "verified", codPaused: true };
  const fine = { status: "active", verificationStatus: "verified", codPaused: false };
  assert.equal(d.canOfferJob(late, { cod: true }), false);
  assert.equal(d.canOfferJob(late, { cod: false }), true);
  assert.equal(d.canOfferJob(fine, { cod: true }), true);
  // "Taking new jobs" off, or not verified: no jobs at all, either kind.
  assert.equal(d.canOfferJob({ ...fine, status: "paused" }, { cod: false }), false);
  assert.equal(d.canOfferJob({ ...fine, verificationStatus: "pending" }, { cod: false }), false);
  assert.deepEqual(d.payWhenItArrivesWhere(true), { codPaused: false });
  assert.deepEqual(d.payWhenItArrivesWhere(false), {});
});

// ─── Words ─────────────────────────────────────────────────────────────────────

test("plain words: the amber card and the partner message", () => {
  const since = at("2026-10-12T17:00:00Z");
  assert.equal(d.lagosWhenWords(since, at("2026-10-12T19:00:00Z")), "today 6pm");
  assert.equal(d.lagosWhenWords(since, at("2026-10-13T09:00:00Z")), "yesterday 6pm");
  // 23:30Z on the 13th is already the 14th in Lagos.
  assert.equal(d.lagosWhenWords(since, at("2026-10-13T23:30:00Z")), "Monday 6pm");
  assert.equal(d.lagosWhenWords(since, at("2026-10-25T09:00:00Z")), "12 Oct 6pm");
  const card = d.overdueCardWords({ amount: 12500, since, paused: true, now: at("2026-10-13T09:00:00Z") });
  assert.equal(card.title, "₦12,500 overdue since yesterday 6pm.");
  assert.equal(card.body, "You're paused from cash-on-delivery jobs until you pay in.");
  const message = d.payInMessage("overdue", { amount: 12500, deadline: since, account: { accountNumber: "9930000001", bankName: "Wema Bank" }, config: cfg, now: at("2026-10-12T18:00:00Z") });
  assert.equal(message.body, "You have ₦12,500 from customers to pay in. Until you pay, you won't get new cash-on-delivery jobs. Pay into your account: 9930000001 Wema Bank.");
});

// ─── Wiring ────────────────────────────────────────────────────────────────────

test("cron route, pay-in hooks, partner pickers and migration are wired up", () => {
  const cron = read("src/app/api/cron/partner-payins/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/, "the cron secret or a signed QStash call");
  assert.match(read("scripts/qstash-schedules.mjs"), /\{ id: "partner-payins", path: "\/api\/cron\/partner-payins", cron: "\*\/15 \* \* \* \*" \}/);
  assert.match(cron, /runPartnerPayInSweep/);

  assert.match(read("src/lib/logistics/remittances.ts"), /if \(result\.ok\) await refreshPayInStandingSafely\(input\.partnerId\)/);
  const payins = read("src/lib/logistics/payins.server.ts");
  assert.equal((payins.match(/refreshPayInStandingSafely\(/g) ?? []).length >= 3, true);
  assert.match(payins, /export async function recheckPartnerPayIns/);
  // A cleared late period closes its keys, so a later one with the same missed deadline is told again.
  assert.match(read("src/lib/logistics/payin-standing.server.ts"), /SET "dedupeKey" = "dedupeKey" \|\| \$\{closed\}/);

  assert.match(read("src/app/api/app/logistics/bookings/route.ts"), /canOfferJob\(.*\{ cod: Boolean\(codAmount\) \}\)/);
  const pickup = read("src/lib/supplier-orders/pickup.server.ts");
  assert.match(pickup, /payWhenItArrivesWhere\(order\.collect > 0\)/);
  assert.match(pickup, /order\.collect > 0 && partner\.codPaused/);
  assert.match(read("src/app/api/public/logistics/partners/route.ts"), /payWhenItArrivesWhere\(cod === "true" \|\| cod === "1"\)/);
  // The partner's own switch only moves "status", never the late pause.
  assert.doesNotMatch(read("src/app/api/mobile/logistics/taking/route.ts"), /codPaused/);

  const sql = read("docs/migrations/2026-10-19-payin-deadline.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "codPaused"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "PartnerPayInEvent"/);
  assert.match(sql, /ALTER TABLE "PartnerPayInEvent" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /-- select cron\.schedule\(\n--   'partner-payins',\n--   '\*\/15 \* \* \* \*'/);
  assert.match(sql, /https:\/\/app\.shopinbos\.com\/api\/cron\/partner-payins/);
  assert.match(sql, /name = 'cron_secret'/);
  assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE)\b/im);
});

test("the reminder says 'today' for a same-day cut-off and 'tonight' for a midnight one", () => {
  const msg = (config, deadline, now) => d.payInMessage("reminder", { amount: 4000, deadline: at(deadline), account: { accountNumber: "9930000001", bankName: "Wema Bank" }, config, now: at(now) });
  assert.equal(msg(cfg, "2026-10-12T17:00:00Z", "2026-10-12T15:00:00Z").body, "Cash your riders collected from customers is due by 6pm today. Pay into your account: 9930000001 Wema Bank.");
  assert.match(msg({ cutoffHour: 0, graceMinutes: 60 }, "2026-10-12T23:00:00Z", "2026-10-12T21:30:00Z").body, /due by 12am tonight\./);
});
