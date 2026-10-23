// Loyalty tiers on top of the rewards levels: perks, the next tier, founding members and anniversaries.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const l = await import("../shared/loyalty.ts");

test("loyalty: levels map to Bronze, Silver, Gold and Platinum with monthly credits", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((level) => l.tierForLevel(level).key), ["bronze", "bronze", "silver", "gold", "gold", "platinum"]);
  assert.deepEqual(l.LOYALTY_TIERS.map((tier) => tier.monthlyCredits), [0, 25, 75, 150]);
  assert.deepEqual(l.nextTier(2), { tier: l.LOYALTY_TIERS[1], atLevel: 3 });
  assert.equal(l.nextTier(4).atLevel, 6);
  assert.equal(l.nextTier(6), null);
  for (const tier of l.LOYALTY_TIERS) assert.doesNotMatch(tier.perks.join(" "), /call from|cash/i, "only perks the app gives");
});

test("loyalty: founding members and anniversaries", () => {
  assert.equal(l.isFoundingMember("2026-11-20T10:00:00Z"), true);
  assert.equal(l.isFoundingMember("2026-12-02T10:00:00Z"), false);
  const joined = "2026-11-05T09:00:00Z";
  assert.equal(l.anniversaryDue(joined, new Date("2027-11-04T12:00:00Z")), null, "not yet");
  assert.equal(l.anniversaryDue(joined, new Date("2027-11-05T10:00:00Z")), 1);
  assert.equal(l.anniversaryDue(joined, new Date("2027-11-11T08:00:00Z")), 1, "a week's grace");
  assert.equal(l.anniversaryDue(joined, new Date("2027-11-13T10:00:00Z")), null);
  assert.equal(l.anniversaryDue(joined, new Date("2028-11-06T10:00:00Z")), 2);
  const view = l.loyaltyView(3, "2026-11-20T10:00:00Z");
  assert.equal(view.tierName, "Silver");
  assert.equal(view.founding, true);
  assert.deepEqual(view.next, { tierName: "Gold", atLevel: 4, monthlyCredits: 75 });
});

test("loyalty: perks are off until switched on, given once each, and shown in the apps", () => {
  const server = fs.readFileSync("src/lib/member-messaging/loyalty.server.ts", "utf8");
  assert.match(server, /if \(!\(await loyaltyOn\(\)\)\) return \{ on: false \}/);
  assert.match(server, /claim\(account\.userId, "loyalty_monthly", month/);
  assert.match(server, /claim\(person\.id, "anniversary", String\(now\.getUTCFullYear\(\)\)/);
  assert.match(fs.readFileSync("src/lib/rewards/rewards.server.ts", "utf8"), /loyalty: loyaltyView\(/);
  assert.match(fs.readFileSync("apps/mobile/src/app/rewards.tsx", "utf8"), /data\.loyalty\.perks/);
  assert.match(fs.readFileSync("src/components/referrals/ReferEarn.tsx", "utf8"), /overview\.loyalty\.tierName/);
});
