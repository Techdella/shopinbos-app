// Rewards for sellers, suppliers and delivery partners (src/lib/rewards/rules.ts): levels, streaks, the Lagos week,
// what events pay and the per-role catalogs, plus the routes, schema and hooks that use them.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rules = await import("../src/lib/rewards/rules.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test("levels: from XP, per role, with the next level's name and threshold", () => {
  assert.deepEqual(rules.levelFor("seller", 0), { level: 1, levelName: "New seller", nextLevelName: "Growing seller", xpForNext: 200 });
  assert.deepEqual(rules.levelFor("seller", 640), { level: 3, levelName: "Rising seller", nextLevelName: "Star seller", xpForNext: 1000 });
  assert.equal(rules.levelFor("seller", 1000).levelName, "Star seller", "the threshold itself reaches the level");
  assert.equal(rules.levelFor("seller", 999).level, 3);
  assert.deepEqual(rules.levelFor("supplier", 420), { level: 2, levelName: "Trusted supplier", nextLevelName: "Top supplier", xpForNext: 800 });
  assert.deepEqual(rules.levelFor("logistics_partner", 1320), { level: 4, levelName: "Reliable partner", nextLevelName: "Top partner", xpForNext: 1600 });
  const top = rules.levelFor("logistics_partner", 1_000_000);
  assert.equal(top.nextLevelName, null);
  assert.equal(top.xpForNext, null);
  assert.equal(rules.levelFor("seller", -5).level, 1);
});

test("Lagos days and weeks: Monday 00:00 Africa/Lagos (UTC+1)", () => {
  // Sunday 23:30 UTC is already Monday 00:30 in Lagos.
  assert.equal(rules.lagosDay(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(rules.lagosDay(new Date("2026-10-25T22:59:59Z")), "2026-10-25");
  // Wednesday 21 Oct 2026 → Monday 19 Oct 00:00 Lagos = Sunday 18 Oct 23:00 UTC.
  assert.equal(rules.weekStart(new Date("2026-10-21T12:00:00Z")).toISOString(), "2026-10-18T23:00:00.000Z");
  assert.equal(rules.weekResetsAt(new Date("2026-10-21T12:00:00Z")).toISOString(), "2026-10-25T23:00:00.000Z");
  // The boundary: one second before Monday in Lagos is last week; Monday 00:00 is the new week.
  assert.equal(rules.weekStart(new Date("2026-10-25T22:59:59Z")).toISOString(), "2026-10-18T23:00:00.000Z");
  assert.equal(rules.weekStart(new Date("2026-10-25T23:00:00Z")).toISOString(), "2026-10-25T23:00:00.000Z");
  // Across a month and year end.
  assert.equal(rules.weekStart(new Date("2027-01-01T10:00:00Z")).toISOString(), "2026-12-27T23:00:00.000Z");
  assert.equal(rules.lagosDayStart(new Date("2026-10-21T00:30:00Z")).toISOString(), "2026-10-20T23:00:00.000Z");
});

test("streak: same day unchanged, next day +1, a gap starts again; shown as 0 once broken", () => {
  assert.deepEqual(rules.updateStreak({ streak: 0, lastActiveDay: null }, "2026-10-21"), { streak: 1, lastActiveDay: "2026-10-21" });
  assert.deepEqual(rules.updateStreak({ streak: 3, lastActiveDay: "2026-10-21" }, "2026-10-21"), { streak: 3, lastActiveDay: "2026-10-21" });
  assert.deepEqual(rules.updateStreak({ streak: 3, lastActiveDay: "2026-10-20" }, "2026-10-21"), { streak: 4, lastActiveDay: "2026-10-21" });
  assert.deepEqual(rules.updateStreak({ streak: 9, lastActiveDay: "2026-10-18" }, "2026-10-21"), { streak: 1, lastActiveDay: "2026-10-21" });
  assert.deepEqual(rules.updateStreak({ streak: 2, lastActiveDay: "2026-10-31" }, "2026-11-01"), { streak: 3, lastActiveDay: "2026-11-01" }, "month end");
  assert.deepEqual(rules.updateStreak({ streak: 4, lastActiveDay: "2026-10-22" }, "2026-10-21"), { streak: 4, lastActiveDay: "2026-10-22" }, "a late event doesn't move it");

  assert.equal(rules.currentStreak(null, "2026-10-21"), 0);
  assert.equal(rules.currentStreak({ streak: 5, lastActiveDay: "2026-10-21" }, "2026-10-21"), 5);
  assert.equal(rules.currentStreak({ streak: 5, lastActiveDay: "2026-10-20" }, "2026-10-21"), 5, "still alive until tonight");
  assert.equal(rules.currentStreak({ streak: 5, lastActiveDay: "2026-10-19" }, "2026-10-21"), 0);
});

test("events: known kinds only, daily caps stop farming, status pays +15", () => {
  assert.equal(rules.isRewardKind("status_posted"), true);
  assert.equal(rules.isRewardKind("withdraw"), false);
  assert.equal(rules.isRewardKind(undefined), false);
  assert.deepEqual(rules.eventReward("status_posted", 0), { xp: 15, points: 15 });
  assert.deepEqual(rules.eventReward("status_posted", 2), { xp: 15, points: 15 });
  assert.deepEqual(rules.eventReward("status_posted", 3), { xp: 0, points: 0 }, "the 4th status of the day pays nothing");
  assert.deepEqual(rules.eventReward("order_paid", 500), rules.eventReward("order_paid", 0), "real sales are never capped");
  for (const kind of rules.REWARD_KINDS) {
    const value = rules.EVENT_VALUES[kind];
    assert.ok(value.xp >= 0 && value.points >= 0, kind);
    assert.ok(value.perDay === null || value.perDay > 0, kind);
  }
});

test("timing rules: fast accepts and on-time deliveries", () => {
  const at = new Date("2026-10-21T10:00:00Z");
  const plus = (ms) => new Date(at.getTime() + ms);
  assert.equal(rules.within(at, plus(rules.FAST_SUPPLIER_ACCEPT_MS - 1), rules.FAST_SUPPLIER_ACCEPT_MS), true);
  assert.equal(rules.within(at, plus(rules.FAST_SUPPLIER_ACCEPT_MS), rules.FAST_SUPPLIER_ACCEPT_MS), false, "2 hours exactly is not under 2 hours");
  assert.equal(rules.within(at, plus(29 * 60_000), rules.FAST_JOB_ACCEPT_MS), true);
  assert.equal(rules.within(at, plus(31 * 60_000), rules.FAST_JOB_ACCEPT_MS), false);
  assert.equal(rules.within(at, null, rules.FAST_JOB_ACCEPT_MS), false);
  assert.equal(rules.within(at, plus(-1000), rules.FAST_JOB_ACCEPT_MS), false);

  // Promised for Wed 21 Oct: on time until Wed 23:59 Lagos (22:59 UTC).
  const promised = new Date("2026-10-21T09:00:00Z");
  assert.equal(rules.deliveredOnTime({ estimatedDelivery: promised, deliveredAt: new Date("2026-10-21T22:59:00Z") }), true);
  assert.equal(rules.deliveredOnTime({ estimatedDelivery: promised, deliveredAt: new Date("2026-10-21T23:00:00Z") }), false);
  assert.equal(rules.deliveredOnTime({ estimatedDelivery: null, deliveredAt: at, failedAttempts: 0 }), true);
  assert.equal(rules.deliveredOnTime({ estimatedDelivery: null, deliveredAt: at, failedAttempts: 1 }), false);
  assert.equal(rules.deliveredOnTime({ estimatedDelivery: promised, deliveredAt: null }), false);
});

test("catalogs: every role has levels, challenges and four badges that make sense", () => {
  for (const role of rules.REWARD_ROLES) {
    const catalog = rules.catalogFor(role);
    assert.equal(catalog.levels[0].xp, 0, `${role} starts at 0 XP`);
    catalog.levels.forEach((level, i) => {
      assert.equal(level.level, i + 1);
      if (i) assert.ok(level.xp > catalog.levels[i - 1].xp, `${role} thresholds go up`);
    });
    const keys = [...catalog.challenges.map((c) => c.key), ...catalog.badges.map((b) => b.key)];
    assert.equal(new Set(keys).size, keys.length, `${role} keys are unique`);
    for (const challenge of catalog.challenges) {
      assert.ok(rules.isRewardKind(challenge.kind), challenge.key);
      assert.ok(challenge.target >= 1 && challenge.points > 0, challenge.key);
    }
    assert.equal(catalog.badges.length, 4);
    for (const badge of catalog.badges) if (badge.rule.type === "count") assert.ok(rules.isRewardKind(badge.rule.kind), badge.key);
  }
  const titles = (role, list) => rules.catalogFor(role)[list].map((x) => `${x.title}${x.points ? ` +${x.points}` : ""}`);
  assert.deepEqual(titles("logistics_partner", "challenges"), ["Deliver 10 on time +60", "Accept jobs within 30 minutes +40", "Post a status +15"]);
  assert.deepEqual(titles("logistics_partner", "badges"), ["Verified", "On time", "5-day streak", "500 deliveries"]);
  assert.deepEqual(titles("supplier", "challenges"), ["Accept new orders within 2 hours +40", "Post 2 statuses +20", "Add 3 new products +30"]);
  assert.deepEqual(titles("supplier", "badges"), ["First order", "Fast packer", "100 orders", "10 shops"]);
  assert.deepEqual(titles("seller", "challenges"), ["Post 3 statuses +30", "Answer chats within an hour +20", "Get 10 orders +100", "Connect a delivery partner +50"]);
  assert.deepEqual(titles("seller", "badges"), ["First sale", "3-day streak", "Quick replier", "50 orders"]);
  assert.equal(rules.asRewardRole("admin"), null);
  assert.equal(rules.asRewardRole("supplier"), "supplier");
});

test("challenges and badges: claimable once done, claimed once; badges by count, streak or verification", () => {
  const def = rules.catalogFor("supplier").challenges[2]; // Add 3 new products
  assert.deepEqual(rules.challengeView(def, 1, false), { key: def.key, title: def.title, progress: 1, target: 3, points: 30, claimable: false, claimed: false });
  assert.equal(rules.challengeView(def, 3, false).claimable, true);
  assert.equal(rules.challengeView(def, 7, false).progress, 3, "progress stops at the target");
  assert.deepEqual([rules.challengeView(def, 3, true).claimable, rules.challengeView(def, 3, true).claimed], [false, true]);

  const stats = { counts: { order_paid: 1 }, streak: 2, verified: false };
  assert.equal(rules.badgeEarned({ type: "count", kind: "order_paid", target: 1 }, stats), true);
  assert.equal(rules.badgeEarned({ type: "count", kind: "order_paid", target: 50 }, stats), false);
  assert.equal(rules.badgeEarned({ type: "count", kind: "delivery_done", target: 1 }, stats), false);
  assert.equal(rules.badgeEarned({ type: "streak", target: 3 }, stats), false);
  assert.equal(rules.badgeEarned({ type: "streak", target: 3 }, { ...stats, streak: 3 }), true);
  assert.equal(rules.badgeEarned({ type: "verified" }, { ...stats, verified: true }), true);
});

test("swap: 100 points for 20 credits, only with 100 or more; points are never cash", () => {
  assert.deepEqual({ ...rules.SWAP }, { points: 100, credits: 20 });
  assert.equal(rules.canSwap(99), false);
  assert.equal(rules.canSwap(100), true);
  const server = read("src/lib/rewards/rewards.server.ts");
  assert.match(server, /points: \{ gte: SWAP\.points \}/, "the points are taken only when there are enough, inside the transaction");
  assert.match(server, /packId: "reward_swap"/);
  assert.match(server, /aiCreditAccount\.update\(\{ where: \{ userId \}, data: \{ balance: \{ increment: SWAP\.credits \} \} \}\)/);
  assert.doesNotMatch(server, /wallet|payout|withdraw|bank/i, "nothing in rewards touches money");
});

test("idempotency: one RewardEvent per (userId, kind, ref), duplicates swallowed, never throws", () => {
  const schema = read("prisma/schema.prisma");
  const section = schema.slice(schema.indexOf("// ─── Rewards (sellers, suppliers, delivery partners)"));
  assert.ok(section.length > 100, "the Rewards section is in the schema");
  assert.match(section, /model RewardEvent \{[\s\S]*@@unique\(\[userId, kind, ref\]\)/);
  assert.match(section, /model ChallengeClaim \{[\s\S]*@@unique\(\[userId, key, weekStart\]\)/);
  assert.match(section, /model UserBadge \{[\s\S]*@@unique\(\[userId, key\]\)/);
  assert.match(section, /model RewardAccount \{\s*userId\s+String\s+@id/);
  const sql = read("docs/migrations/2026-11-18-rewards.sql");
  for (const name of ["RewardAccount", "RewardEvent", "ChallengeClaim", "UserBadge"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${name}"`));
  assert.match(sql, /"RewardEvent_userId_kind_ref_key" ON "RewardEvent"\("userId", "kind", "ref"\)/);

  const server = read("src/lib/rewards/rewards.server.ts");
  const record = server.slice(server.indexOf("export async function recordRewardEvent"), server.indexOf("export async function rewardsFor"));
  assert.match(record, /try \{[\s\S]*\} catch \(error\) \{[\s\S]*isUniqueError\(error\)\) return null;[\s\S]*return null;/);
});

test("routes and hooks: three mobile routes for the three roles, events fired from the existing flows", () => {
  for (const path of ["src/app/api/mobile/rewards/route.ts", "src/app/api/mobile/rewards/claim/route.ts", "src/app/api/mobile/rewards/swap/route.ts"]) assert.ok(exists(path), path);
  assert.match(read("src/app/api/mobile/rewards/_shared.ts"), /withAuth\(handler, \["seller", "supplier", "logistics_partner"\]\)/);
  const hooks = {
    "src/lib/supplier-orders/service.server.ts": "rewardSupplierOrderAccepted",
    "src/lib/logistics/jobs.ts": "rewardJobMoved",
    "src/lib/commerce/order-paid.server.ts": "rewardOrderPaid",
    "src/lib/delivery-market/manage.server.ts": '"partner_connected"',
    "src/app/api/app/inbox/conversations/[id]/messages/route.ts": "rewardChatReply",
    "src/app/api/store/products/route.ts": '"product_added"',
    "src/app/api/supplier/products/route.ts": '"product_added"',
    "src/app/api/mobile/supplier/quotes/[id]/route.ts": '"quote_sent"',
  };
  for (const [file, call] of Object.entries(hooks)) assert.ok(read(file).includes(call), `${file} fires ${call}`);
});
