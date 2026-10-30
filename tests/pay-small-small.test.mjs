// Pay small small (shared/instalments.ts): parts are whole naira and add up exactly, the last part absorbs the
// rounding, Shopinbos's fee is spread so it adds up, due dates are Lagos days, and the grace / reminder / autopay
// windows behave.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = await import("../shared/instalments.ts");

const sum = (list) => list.reduce((a, b) => a + b, 0);

test("parts are whole naira, rounded up, and the last absorbs the rounding", () => {
  // ₦10,000 over 6 weeks: 1666.67 → 1667 × 5 = 8335, last 1665.
  const parts = s.splitIntoParts(1_000_000, 6);
  assert.deepEqual(parts, [166_700, 166_700, 166_700, 166_700, 166_700, 166_500]);
  assert.equal(sum(parts), 1_000_000);
  for (const part of parts.slice(0, -1)) assert.equal(part % 100, 0);
  assert.equal(s.weeklyKobo(1_000_000, 6), 166_700);
});

test("an exact division gives equal parts", () => {
  assert.deepEqual(s.splitIntoParts(800_000, 4), [200_000, 200_000, 200_000, 200_000]);
  assert.deepEqual(s.splitIntoParts(800_000, 8), Array(8).fill(100_000));
});

test("a price with kobo still adds up exactly (the last part keeps the kobo)", () => {
  const parts = s.splitIntoParts(1_500_050, 4); // ₦15,000.50
  assert.equal(sum(parts), 1_500_050);
  assert.equal(parts[0], 375_100);
  assert.equal(parts[3], 1_500_050 - 3 * 375_100);
});

test("every allowed length adds up for many prices", () => {
  for (const weeks of s.PAY_SMALL_WEEKS) {
    for (let naira = 2_000; naira < 400_000; naira += 7_919) {
      const parts = s.splitIntoParts(naira * 100, weeks);
      assert.equal(parts.length, weeks);
      assert.equal(sum(parts), naira * 100);
      assert.ok(parts.at(-1) > 0 && parts.at(-1) <= parts[0]);
    }
  }
});

test("too-small totals are refused", () => {
  assert.equal(s.splitIntoParts(0, 4), null);
  assert.equal(s.splitIntoParts(500, 8), null); // ₦5 over 8 weeks leaves nothing for the last part
  assert.match(s.planProblem(200_000, 8), /at least ₦500/); // ₦2,000 / 8 = ₦250 a week
  assert.equal(s.planProblem(200_000, 4), null); // ₦500 a week
  assert.match(s.planProblem(1_000_000, 5), /4, 6 or 8/);
});

test("allowed lengths and the refund rule are cleaned", () => {
  assert.deepEqual(s.cleanWeeksList([8, 4, 4, "6", 5]), [4, 6, 8]);
  assert.equal(s.cleanWeeksList([3, 5]), null);
  assert.equal(s.cleanWeeksList("4"), null);
  assert.equal(s.cleanRefundRule("   "), s.REFUND_PRESET);
  assert.equal(s.cleanRefundRule("  No  refunds\n after delivery "), "No refunds after delivery");
  assert.equal(s.cleanRefundRule("x".repeat(900)).length, 500);
});

test("Shopinbos's fee is spread over the parts and adds up exactly", () => {
  const parts = s.splitIntoParts(1_000_000, 6);
  const fees = s.spreadKobo(15_001, parts);
  assert.equal(sum(fees), 15_001);
  assert.ok(fees.every((fee) => fee >= 0));
  assert.deepEqual(s.spreadKobo(0, parts), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.spreadKobo(100, []), []);
});

test("price lock off: remaining parts follow a new price; paid parts never change", () => {
  const parts = s.splitIntoParts(1_200_000, 4); // 3,000 × 4
  const up = s.repriceRemaining(parts, 2, 1_400_000);
  assert.deepEqual(up.slice(0, 2), parts.slice(0, 2));
  assert.equal(sum(up), 1_400_000);
  const down = s.repriceRemaining(parts, 3, 800_000); // already paid 9,000 > 8,000
  assert.deepEqual(down, [300_000, 300_000, 300_000, 0]);
  assert.deepEqual(s.repriceRemaining(parts, 4, 2_000_000), parts);
});

test("Lagos days: a payment at 23:30 UTC is already the next day in Lagos", () => {
  assert.equal(s.lagosDay(new Date("2026-11-02T23:30:00Z")), "2026-11-03");
  assert.equal(s.lagosDay(new Date("2026-11-02T22:59:00Z")), "2026-11-02");
  assert.equal(s.endOfLagosDay("2026-11-02").toISOString(), "2026-11-02T22:59:59.999Z");
  assert.equal(s.addDays("2026-12-29", 7), "2027-01-05");
  assert.equal(s.daysBetween("2026-12-29", "2027-01-05"), 7);
});

test("part n is due at the end of the Lagos day 7×(n−1) days after the start", () => {
  const start = new Date("2026-11-02T10:00:00Z"); // Monday in Lagos
  assert.equal(s.partDueAt(start, 1).toISOString(), "2026-11-02T22:59:59.999Z");
  assert.equal(s.partDueAt(start, 2).toISOString(), "2026-11-09T22:59:59.999Z");
  const schedule = s.planSchedule(start, 6);
  assert.equal(schedule.length, 6);
  assert.equal(s.lagosDay(schedule[5]), "2026-12-07");
  assert.equal(s.nextDueAt({ weeks: 6, paidCount: 1, startedAt: start }).toISOString(), "2026-11-09T22:59:59.999Z");
  assert.equal(s.nextDueAt({ weeks: 6, paidCount: 6, startedAt: start }), null);
});

test("defaulted only after the 2-day grace", () => {
  const due = s.partDueAt(new Date("2026-11-02T10:00:00Z"), 2); // 9 Nov, end of day Lagos
  assert.equal(s.pastGrace(new Date("2026-11-11T22:00:00Z"), due), false);
  assert.equal(s.pastGrace(new Date("2026-11-11T23:30:00Z"), due), true);
});

test("the reminder goes the Lagos day before, in sending hours, once", () => {
  const due = s.partDueAt(new Date("2026-11-02T10:00:00Z"), 2); // 9 Nov
  assert.equal(s.reminderDue(new Date("2026-11-08T09:00:00Z"), due, 2, 1), true); // 10am Lagos, 8 Nov
  assert.equal(s.reminderDue(new Date("2026-11-08T05:00:00Z"), due, 2, 1), false); // 6am Lagos
  assert.equal(s.reminderDue(new Date("2026-11-08T09:00:00Z"), due, 2, 2), false); // already reminded
  assert.equal(s.reminderDue(new Date("2026-11-09T09:00:00Z"), due, 2, 1), false); // due day itself
});

test("autopay from the due day until grace ends, once per part", () => {
  const due = s.partDueAt(new Date("2026-11-02T10:00:00Z"), 2);
  assert.equal(s.autopayDue(new Date("2026-11-08T09:00:00Z"), due, 2, 1), false); // a day early
  assert.equal(s.autopayDue(new Date("2026-11-09T09:00:00Z"), due, 2, 1), true);
  assert.equal(s.autopayDue(new Date("2026-11-10T09:00:00Z"), due, 2, 1), true); // late but in grace
  assert.equal(s.autopayDue(new Date("2026-11-09T09:00:00Z"), due, 2, 2), false); // tried
  assert.equal(s.autopayDue(new Date("2026-11-12T09:00:00Z"), due, 2, 1), false); // past grace
});

test("a payment only counts as the next part, and the last one completes the plan", () => {
  const plan = { weeks: 4, paidCount: 2, paidKobo: 600_000 };
  assert.equal(s.applyPartPaid(plan, 2, 300_000), null); // a repeat
  assert.equal(s.applyPartPaid(plan, 4, 300_000), null); // out of order
  assert.deepEqual(s.applyPartPaid(plan, 3, 300_000), { paidCount: 3, paidKobo: 900_000, completed: false });
  assert.deepEqual(s.applyPartPaid({ ...plan, paidCount: 3, paidKobo: 900_000 }, 4, 300_000), { paidCount: 4, paidKobo: 1_200_000, completed: true });
  assert.deepEqual(s.nextPart({ weeks: 4, paidCount: 3, amountsKobo: [1, 2, 3, 4] }), { n: 4, amountKobo: 4 });
  assert.equal(s.nextPart({ weeks: 4, paidCount: 4, amountsKobo: [1, 2, 3, 4] }), null);
  assert.equal(s.planPercent({ paidKobo: 300_000, totalKobo: 1_200_000 }), 25);
});

test("autopay only with a reusable card", () => {
  assert.equal(s.canAutopay({ reusable: true, authorization_code: "AUTH_x" }), true);
  assert.equal(s.canAutopay({ reusable: false, authorization_code: "AUTH_x" }), false);
  assert.equal(s.canAutopay(null), false);
});

test("the shared rules stay import-free and never mention holding money as savings", () => {
  const source = readFileSync(new URL("../shared/instalments.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import /m);
  assert.match(source, /never holds the money/);
});

test("every part payment goes through the seller's split (server module)", () => {
  const server = readFileSync(new URL("../src/lib/paystack/plans.server.ts", import.meta.url), "utf8");
  assert.match(server, /paystackSplitParams/);
  assert.match(server, /buildSplitPlan/);
  // Card checks for group buy are the only charge without the seller's split, and they are refunded at once.
  assert.match(server, /refundPaystackTransaction/);
});

test("the Paystack webhook routes every pay-together reference, before the retail-order branch", () => {
  const hook = readFileSync(new URL("../src/app/api/webhooks/paystack/route.ts", import.meta.url), "utf8");
  const together = hook.indexOf("isTogetherReference(event.data?.reference)");
  const retail = hook.indexOf("// ── Retail order payment (storefront checkout)");
  assert.ok(together > 0 && together < retail);
  const payments = readFileSync(new URL("../src/lib/pay-together/payments.server.ts", import.meta.url), "utf8");
  for (const prefix of ["INSTALMENT_REF_PREFIX", "AJO_REF_PREFIX", "GROUP_VERIFY_PREFIX", "GROUP_CHARGE_PREFIX"]) assert.match(payments, new RegExp(prefix));
});

test("saved-card charges carry the seller's split (charge_authorization with subaccount + transaction_charge)", () => {
  const client = readFileSync(new URL("../src/lib/paystack.ts", import.meta.url), "utf8");
  assert.match(client, /split\?: \{ subaccount: string; transaction_charge\?: number; bearer\?: string \}/);
  assert.match(client, /\.\.\.\(input\.split \?\? \{\}\)/);
  const plans = readFileSync(new URL("../src/lib/paystack/plans.server.ts", import.meta.url), "utf8");
  assert.match(plans, /split: singleSplit\(input\.plan\)/);
  // Every pay-together payment start goes through the split helpers, never a bare initialize.
  for (const file of ["instalments", "ajo", "group-buy"]) {
    const source = readFileSync(new URL(`../src/lib/pay-together/${file}.server.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /initializePaystackTransaction|chargePaystackAuthorization/);
  }
});
