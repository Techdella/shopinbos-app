// Product ajo (shared/ajo.ts): weekly contribution = price ÷ members rounded up to the naira, Lagos week schedule,
// the seeded draw (returning members first, the same seed gives the same order), the seller's manual order, and
// who collects each week.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const a = await import("../shared/ajo.ts");

test("weekly contribution is the item price ÷ members, rounded up to the naira", () => {
  assert.equal(a.ajoWeeklyKobo(6_000_000, 6), 1_000_000); // ₦60,000 / 6 = ₦10,000
  assert.equal(a.ajoWeeklyKobo(1_000_000, 3), 333_400); // ₦3,333.33 → ₦3,334
  assert.ok(a.ajoWeekTotalKobo(333_400, 3) >= 1_000_000); // a full week pays for the item
  assert.equal(a.ajoWeeklyKobo(0, 3), 0);
});

test("group settings are checked", () => {
  const ok = { itemPriceKobo: 3_000_000, size: 6, depositKobo: 0, startDay: "2026-11-10", today: "2026-11-02" };
  assert.equal(a.ajoProblem(ok), null);
  assert.match(a.ajoProblem({ ...ok, size: 1 }), /2 to 20/);
  assert.match(a.ajoProblem({ ...ok, size: 21 }), /2 to 20/);
  assert.match(a.ajoProblem({ ...ok, itemPriceKobo: 100_000, size: 10 }), /at least/);
  assert.match(a.ajoProblem({ ...ok, startDay: "2026-11-01" }), /past/);
  assert.match(a.ajoProblem({ ...ok, startDay: "2026-02-30" }), /start date/);
  assert.match(a.ajoProblem({ ...ok, depositKobo: 4_000_000 }), /deposit/);
  assert.match(a.ajoProblem({ ...ok, startDay: "2027-06-01" }), /90 days/);
});

test("default rules are used when the seller leaves them empty, and say how removal works", () => {
  assert.equal(a.cleanAjoRules("  "), a.DEFAULT_AJO_RULES);
  assert.match(a.DEFAULT_AJO_RULES, /2 days/);
  assert.match(a.DEFAULT_AJO_RULES, /lose your turn/);
  assert.match(a.DEFAULT_AJO_RULES, /New members/);
  assert.equal(a.cleanAjoRules("My rules"), "My rules");
});

test("weeks are Lagos days from the start day", () => {
  assert.equal(a.ajoWeekDueAt("2026-11-10", 1).toISOString(), "2026-11-10T22:59:59.999Z");
  assert.equal(a.ajoWeekDueAt("2026-11-10", 3).toISOString(), "2026-11-24T22:59:59.999Z");
  assert.equal(a.currentAjoWeek("2026-11-10", 6, new Date("2026-11-09T12:00:00Z")), 0);
  assert.equal(a.currentAjoWeek("2026-11-10", 6, new Date("2026-11-10T00:30:00Z")), 1);
  assert.equal(a.currentAjoWeek("2026-11-10", 6, new Date("2026-11-17T08:00:00Z")), 2);
  assert.equal(a.currentAjoWeek("2026-11-10", 6, new Date("2027-03-01T08:00:00Z")), 6);
  assert.equal(a.ajoSchedule("2026-11-10", 3).map((w) => w.day).join(","), "2026-11-10,2026-11-17,2026-11-24");
  assert.equal(a.ajoRemoveAt("2026-11-10", 2).toISOString(), "2026-11-19T22:59:59.999Z");
});

test("reminders the day before; autopay from the due day until removal", () => {
  assert.equal(a.ajoReminderDue(new Date("2026-11-16T10:00:00Z"), "2026-11-10", 2, 1), true);
  assert.equal(a.ajoReminderDue(new Date("2026-11-16T10:00:00Z"), "2026-11-10", 2, 2), false);
  assert.equal(a.ajoReminderDue(new Date("2026-11-16T21:00:00Z"), "2026-11-10", 2, 1), false); // 10pm Lagos
  assert.equal(a.ajoAutopayDue(new Date("2026-11-16T10:00:00Z"), "2026-11-10", 2, 1), false);
  assert.equal(a.ajoAutopayDue(new Date("2026-11-17T10:00:00Z"), "2026-11-10", 2, 1), true);
  assert.equal(a.ajoAutopayDue(new Date("2026-11-20T10:00:00Z"), "2026-11-10", 2, 1), false); // removed by now
});

test("the draw is seeded: same seed, same order; returning members first", () => {
  const members = [
    { id: "m1", isNew: true },
    { id: "m2", isNew: false },
    { id: "m3", isNew: true },
    { id: "m4", isNew: false },
    { id: "m5", isNew: false },
  ];
  const one = a.drawOrder(members, "group-1:2026-11-02");
  const two = a.drawOrder([...members].reverse(), "group-1:2026-11-02");
  assert.deepEqual(one, two);
  assert.equal(one.length, 5);
  assert.deepEqual(new Set(one.slice(0, 3)), new Set(["m2", "m4", "m5"]));
  assert.deepEqual(new Set(one.slice(3)), new Set(["m1", "m3"]));
  // Different seeds give different orders for a big enough group.
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, isNew: false }));
  assert.notDeepEqual(a.drawOrder(many, "a"), a.drawOrder(many, "b"));
});

test("the shuffle is a permutation and spreads positions fairly", () => {
  const ids = ["a", "b", "c", "d"];
  const firsts = new Map();
  for (let i = 0; i < 4000; i += 1) {
    const order = a.seededShuffle(ids, `seed-${i}`);
    assert.deepEqual([...order].sort(), ids);
    firsts.set(order[0], (firsts.get(order[0]) ?? 0) + 1);
  }
  for (const id of ids) assert.ok(firsts.get(id) > 800 && firsts.get(id) < 1200, `${id} first ${firsts.get(id)} times`);
});

test("the seller's own order must be exactly the same members", () => {
  assert.deepEqual(a.manualOrder(["a", "b", "c"], ["c", "a", "b"]), ["c", "a", "b"]);
  assert.equal(a.manualOrder(["a", "b", "c"], ["c", "a"]), null);
  assert.equal(a.manualOrder(["a", "b", "c"], ["c", "a", "a"]), null);
  assert.equal(a.manualOrder(["a", "b", "c"], ["c", "a", "z"]), null);
});

test("ship only when everyone paying has paid; a removed member loses their turn", () => {
  const members = [
    { id: "a", status: "collected", position: 1 },
    { id: "b", status: "removed", position: 2 },
    { id: "c", status: "active", position: 3 },
    { id: "d", status: "active", position: 4 },
  ];
  assert.deepEqual(a.weekStatus(members, ["a", "c"]), { paid: ["a", "c"], missing: ["d"], complete: false });
  assert.deepEqual(a.canShipWeek({ week: 2, members, paidMemberIds: ["a", "c"], shippedWeeks: [1] }), { ok: false, reason: "not_all_paid" });
  assert.deepEqual(a.canShipWeek({ week: 2, members, paidMemberIds: ["a", "c", "d"], shippedWeeks: [1] }), { ok: true, memberId: "c" });
  assert.deepEqual(a.canShipWeek({ week: 2, members, paidMemberIds: ["a", "c", "d"], shippedWeeks: [1, 2] }), { ok: false, reason: "already_shipped" });
  assert.deepEqual(a.canShipWeek({ week: 0, members, paidMemberIds: [], shippedWeeks: [] }), { ok: false, reason: "not_started" });
  assert.equal(a.groupFinished(members), false);
  assert.equal(a.groupFinished(members.map((m) => (m.status === "active" ? { ...m, status: "collected" } : m))), true);
});

test("public member names are first names only", () => {
  assert.equal(a.publicFirstName("Adaeze Okafor"), "Adaeze");
  assert.equal(a.publicFirstName("   "), "Member");
});

test("the shared ajo rules are import-free", () => {
  const source = readFileSync(new URL("../shared/ajo.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import /m);
  assert.match(source, /never holds anyone's money/);
});
