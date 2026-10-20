// Delivery analytics (src/lib/delivery-market/analytics.ts): totals, rates, medians, weekly series, breakdowns,
// decline reasons, customer problems, the per-partner comparison and the customer's state.
import test from "node:test";
import assert from "node:assert/strict";

const a = await import("../src/lib/delivery-market/analytics.ts");
const m = await import("../shared/delivery-market.ts");

const H = 3_600_000;
const D = 24 * H;
const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (days, hours = 0) => new Date(NOW.getTime() - days * D - hours * H);
const after = (date, hours) => new Date(date.getTime() + hours * H);

function delivered(days, { fee = 2000, lateHours = 0, paid = true, attempts = 0, state = "Lagos", service = "doorstep", sizeBand = "small", partner = "p1", acceptMins = 30, rideHours = 3 } = {}) {
  const createdAt = ago(days);
  const acceptedAt = new Date(createdAt.getTime() + acceptMins * 60_000);
  const pickedUpAt = after(acceptedAt, 2);
  const deliveredAt = after(pickedUpAt, rideHours);
  return {
    status: "delivered", createdAt, acceptedAt, pickedUpAt, deliveredAt, deliveryFee: fee,
    estimatedDelivery: after(deliveredAt, -lateHours), feePaidAt: paid ? createdAt : null, failedAttempts: attempts,
    state, service, sizeBand, logisticsPartnerId: partner,
  };
}

test("range: 30/90/365 days, anything else is 30; jobs outside the range are left out", () => {
  assert.equal(a.readRangeDays("90"), 90);
  assert.equal(a.readRangeDays(365), 365);
  assert.equal(a.readRangeDays("7"), 30);
  assert.equal(a.readRangeDays(undefined), 30);
  const range = a.rangeFor(30, NOW);
  assert.equal(range.to.getTime(), NOW.getTime());
  assert.equal(range.from.getTime(), NOW.getTime() - 30 * D);
  const rows = [{ createdAt: ago(1) }, { createdAt: ago(29) }, { createdAt: ago(31) }];
  assert.equal(a.jobsInRange(rows, range).length, 2);
});

test("totals: offered, accepted, declined, not accepted in time, delivered, failed attempts, returned, cancelled", () => {
  const jobs = [
    delivered(2),
    delivered(3, { attempts: 1 }),
    { status: "confirmed", createdAt: ago(1), acceptedAt: ago(1), deliveryFee: 1500 },
    { status: "declined", createdAt: ago(4), declinedAt: ago(4), declineReason: "No rider free in time", deliveryFee: 1500 },
    { status: "pending", createdAt: ago(1), acceptBy: after(ago(1), 4), deliveryFee: 1500 }, // past accept-by
    { status: "pending", createdAt: ago(0, 1), acceptBy: after(ago(0, 1), 4), deliveryFee: 1500 }, // still has time
    { status: "cancelled", createdAt: ago(5), acceptBy: after(ago(5), 4), replacedById: "j9", deliveryFee: 1500 }, // sent elsewhere unanswered
    { status: "cancelled", createdAt: ago(6), acceptedAt: ago(6), deliveryFee: 1500 }, // order cancelled after accepting
    { status: "failed", createdAt: ago(7), acceptedAt: ago(7), failedAttempts: 2, deliveryFee: 1500 },
    { status: "returned", createdAt: ago(8), acceptedAt: ago(8), failedAttempts: 1, deliveryFee: 1500 },
  ];
  const t = a.deliveryTotals(jobs, NOW);
  assert.equal(t.offered, 10);
  assert.equal(t.accepted, 6, "delivered ×2, confirmed, cancelled-after-accepting, failed, returned");
  assert.equal(t.declined, 1);
  assert.equal(t.notAcceptedInTime, 2);
  assert.equal(t.delivered, 2);
  assert.equal(t.failedAttempts, 4, "1 + 2 + 1");
  assert.equal(t.returned, 1);
  assert.equal(t.cancelled, 1, "the job sent to another partner counts as not accepted, not cancelled");
  assert.equal(t.acceptanceRate, Math.round((6 / 9) * 100));
});

test("rates: on time uses the partnerStats 12-hour grace; failed rate matches partnerStats", () => {
  const jobs = [
    delivered(1),
    delivered(2, { lateHours: 11 }),
    delivered(3, { lateHours: 13 }),
    delivered(4, { attempts: 1 }),
    { status: "returned", createdAt: ago(5), failedAttempts: 1, deliveryFee: 1000 },
    { status: "failed", createdAt: ago(5), failedAttempts: 0, deliveryFee: 1000 }, // not finished: no attempt yet
  ];
  const t = a.deliveryTotals(jobs, NOW);
  assert.equal(t.timed, 4);
  assert.equal(t.onTimeRate, 75);
  assert.equal(t.finished, 5);
  assert.equal(t.failedRate, 40);
  const stats = m.partnerStats(jobs);
  assert.equal(stats.failedRate, t.failedRate);
  const five = [...jobs.slice(0, 4), delivered(6)];
  assert.equal(m.partnerStats(five).onTimeRate, a.deliveryTotals(five, NOW).onTimeRate);
  assert.equal(a.isOnTime({ status: "delivered", deliveredAt: NOW, estimatedDelivery: after(NOW, -12) }), true);
  assert.equal(a.isOnTime({ status: "delivered", deliveredAt: NOW }), null);
  assert.equal(a.isOnTime({ status: "failed", deliveredAt: NOW, estimatedDelivery: NOW }), null);
  const empty = a.deliveryTotals([], NOW);
  assert.equal(empty.onTimeRate, null);
  assert.equal(empty.failedRate, null);
  assert.equal(empty.acceptanceRate, null);
  assert.equal(empty.medianAcceptMs, null);
});

test("medians: time to accept and pickup to delivery", () => {
  const jobs = [delivered(1, { acceptMins: 10, rideHours: 1 }), delivered(2, { acceptMins: 30, rideHours: 2 }), delivered(3, { acceptMins: 90, rideHours: 6 })];
  const t = a.deliveryTotals(jobs, NOW);
  assert.equal(t.medianAcceptMs, 30 * 60_000);
  assert.equal(t.medianPickupToDeliveryMs, 2 * H);
  assert.equal(a.median([4, 1, 3, 2]), 2.5);
  assert.equal(a.median([]), null);
  assert.equal(a.durationWords(45 * 60_000), "45 min");
  assert.equal(a.durationWords(3.5 * H), "3.5 hours");
  assert.equal(a.durationWords(3 * D), "3 days");
  assert.equal(a.durationWords(null), "—");
});

test("fees: delivered jobs only, split into paid in the app and not", () => {
  const jobs = [delivered(1, { fee: 2000 }), delivered(2, { fee: 3000, paid: false }), { status: "confirmed", createdAt: ago(1), acceptedAt: ago(1), deliveryFee: 9999, feePaidAt: ago(1) }];
  const t = a.deliveryTotals(jobs, NOW);
  assert.equal(t.fees, 5000);
  assert.equal(t.feesPaidInApp, 2000);
  assert.equal(t.feesNotInApp, 3000);
});

test("weekly series: Monday weeks in Lagos time, empty weeks kept, counted by delivery date", () => {
  // 2026-10-19 is a Monday. 23:30 UTC Sunday is already Monday 00:30 in Lagos.
  assert.equal(a.weekStart(new Date("2026-10-18T23:30:00Z")).toISOString(), "2026-10-18T23:00:00.000Z");
  assert.equal(a.weekStart(new Date("2026-10-18T22:30:00Z")).toISOString(), "2026-10-11T23:00:00.000Z");
  const range = { from: new Date("2026-09-28T12:00:00Z"), to: NOW };
  const jobs = [
    { ...delivered(0), deliveredAt: new Date("2026-10-19T10:00:00Z"), estimatedDelivery: new Date("2026-10-19T12:00:00Z"), deliveryFee: 1000 },
    { ...delivered(0), deliveredAt: new Date("2026-10-20T10:00:00Z"), estimatedDelivery: new Date("2026-10-19T08:00:00Z"), deliveryFee: 2000 },
    { ...delivered(0), deliveredAt: new Date("2026-10-01T10:00:00Z"), estimatedDelivery: null, deliveryFee: 500 },
  ];
  const weeks = a.weeklySeries(jobs, range);
  assert.equal(weeks.length, 4, "weeks of 28 Sep, 5 Oct, 12 Oct and 19 Oct");
  assert.deepEqual(weeks.map((w) => w.delivered), [1, 0, 0, 2]);
  assert.deepEqual(weeks.map((w) => w.fees), [500, 0, 0, 3000]);
  assert.deepEqual(weeks.map((w) => w.onTimeRate), [null, null, null, 50]);
});

test("breakdowns: by state, service and size band; unknown last", () => {
  const jobs = [
    delivered(1, { state: "Lagos", fee: 2000 }),
    delivered(2, { state: "Lagos", fee: 2500, service: "pickup_point" }),
    delivered(3, { state: "Oyo", fee: 4000, sizeBand: "bulky" }),
    { status: "failed", createdAt: ago(3), failedAttempts: 1, state: "Oyo", deliveryFee: 4000, service: "doorstep", sizeBand: "medium" },
    { status: "pending", createdAt: ago(1), state: null, deliveryFee: 1000 },
  ];
  const states = a.byState(jobs);
  assert.deepEqual(states.map((row) => [row.key, row.jobs, row.delivered, row.failed, row.fees]), [["Lagos", 2, 2, 0, 4500], ["Oyo", 2, 1, 1, 4000], ["Unknown", 1, 0, 0, 0]]);
  assert.deepEqual(a.byService(jobs).map((row) => [row.key, row.jobs]), [["doorstep", 3], ["pickup_point", 1], ["Unknown", 1]]);
  assert.deepEqual(a.bySizeBand(jobs).map((row) => [row.key, row.jobs]), [["small", 2], ["bulky", 1], ["medium", 1], ["Unknown", 1]]);
});

test("decline reasons and customer problems", () => {
  const jobs = [
    { status: "declined", createdAt: ago(1), declineReason: "No rider free in time", deliveryFee: 0 },
    { status: "declined", createdAt: ago(1), declineReason: "No rider free in time", deliveryFee: 0 },
    { status: "declined", createdAt: ago(1), declineReason: "We don't cover this route right now", deliveryFee: 0 },
    { status: "declined", createdAt: ago(1), declineReason: "  ", deliveryFee: 0 },
    delivered(1),
  ];
  assert.deepEqual(a.topDeclineReasons(jobs), [
    { key: "No rider free in time", count: 2 },
    { key: "No reason given", count: 1 },
    { key: "We don't cover this route right now", count: 1 },
  ]);
  assert.equal(a.topDeclineReasons(jobs, 1).length, 1);
  const range = a.rangeFor(30, NOW);
  const issues = [
    { kind: "late", status: "open", createdAt: ago(1) },
    { kind: "late", status: "resolved", createdAt: ago(2) },
    { kind: "damaged", status: "open", createdAt: ago(3) },
    { kind: "late", status: "open", createdAt: ago(60) },
  ];
  assert.deepEqual(a.issuesByKind(issues, range), [{ kind: "late", count: 2, open: 1 }, { kind: "damaged", count: 1, open: 1 }]);
  const all = a.deliveryAnalytics({ jobs, issues, range, now: NOW });
  assert.equal(all.issueCount, 3);
  assert.equal(all.openIssues, 2);
  assert.equal(all.totals.declined, 4);
  assert.equal(all.declineReasons[0].count, 2);
});

test("per-partner comparison: connected partners with no jobs still show; others are added", () => {
  const jobs = [
    delivered(1, { partner: "p1", fee: 2000 }),
    delivered(2, { partner: "p1", fee: 3000, lateHours: 20 }),
    { status: "declined", createdAt: ago(1), declineReason: "Other", deliveryFee: 1500, logisticsPartnerId: "p2" },
    delivered(3, { partner: "p9", fee: 1000 }),
  ];
  const rows = a.comparePartners(jobs, [{ id: "p1", name: "Swift" }, { id: "p2", name: "Kwik" }, { id: "p3", name: "New Co" }], NOW);
  assert.deepEqual(rows.map((row) => row.partnerId), ["p1", "p2", "p9", "p3"]);
  const p1 = rows[0];
  assert.equal(p1.jobs, 2);
  assert.equal(p1.delivered, 2);
  assert.equal(p1.onTimeRate, 50);
  assert.equal(p1.averageFee, 2500);
  assert.equal(p1.fees, 5000);
  assert.equal(rows[1].declines, 1);
  assert.equal(rows[1].averageFee, 1500, "no deliveries yet: average of what was offered");
  assert.equal(rows[2].connected, false);
  assert.equal(rows[3].jobs, 0);
  assert.equal(rows[3].averageFee, null);
});

test("destination state: the order's address first, else the destination text read from the end", () => {
  assert.equal(a.destinationState({ state: "lagos state", city: "Ikeja" }, "whatever"), "Lagos");
  assert.equal(a.destinationState({ city: "Port Harcourt" }, null), "Rivers");
  assert.equal(a.destinationState({}, "12 Allen Avenue, Ikeja, Lagos (landmark: near the bank, Abuja road)"), "Lagos");
  assert.equal(a.destinationState(null, "5 Aminu Kano Crescent, Wuse 2, Abuja"), "FCT");
  assert.equal(a.destinationState(null, "Somewhere nice"), null);
  assert.equal(a.destinationState(null, ""), null);
});
