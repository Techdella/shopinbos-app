// Retention journeys: when each step is due, sending hours, the email cap, the words, and the weekly referral box.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const j = await import("../src/lib/member-messaging/journeys.ts");
const now = new Date("2026-12-10T10:00:00Z"); // Thursday 11:00 Lagos
const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000);

test("journeys: setup help on day 3 and day 10, then nothing", () => {
  assert.equal(j.setupStage(daysAgo(2), now), null);
  assert.equal(j.setupStage(daysAgo(3), now), "d3");
  assert.equal(j.setupStage(daysAgo(9.9), now), "d3");
  assert.equal(j.setupStage(daysAgo(10), now), "d10");
  assert.equal(j.setupStage(daysAgo(25), now), null);
});

test("journeys: win-back after 7, 14 and 30 quiet days; a new quiet spell starts again", () => {
  assert.equal(j.winbackStage(daysAgo(6), now), null);
  assert.equal(j.winbackStage(daysAgo(7), now), "d7");
  assert.equal(j.winbackStage(daysAgo(20), now), "d14");
  assert.equal(j.winbackStage(daysAgo(31), now), "d30");
  assert.equal(j.winbackStage(daysAgo(60), now), null, "long gone: leave them be");
  assert.notEqual(j.winbackPeriod("2026-11-01", "d7"), j.winbackPeriod("2026-12-01", "d7"));
  assert.equal(j.WINBACK_GIFT_CREDITS, 50);
});

test("journeys: sending hours and the weekly email cap", () => {
  assert.equal(j.sendingHours(new Date("2026-12-10T06:59:00Z")), false, "07:59 Lagos");
  assert.equal(j.sendingHours(new Date("2026-12-10T07:00:00Z")), true, "08:00 Lagos");
  assert.equal(j.sendingHours(new Date("2026-12-10T19:00:00Z")), false, "20:00 Lagos");
  assert.equal(j.sendingHours(new Date("2026-12-13T10:00:00Z")), false, "Sunday");
  assert.equal(j.overEmailCap(2), false);
  assert.equal(j.overEmailCap(3), true);
  assert.equal(j.monthPeriod(new Date("2026-11-30T23:30:00Z")), "2026-12", "Lagos is already in December");
});

test("journeys: each message has words, a button into the right portal and a bell", () => {
  const roles = { seller: /^\/home/, supplier: /^\/supplier/, logistics_partner: /^\/logistics/ };
  for (const [role, prefix] of Object.entries(roles)) {
    const cases = [
      ["setup_help", "d3", { firstName: "Ada", nextStep: { label: "Add a pickup point", hint: "Where riders collect.", href: "/logistics/pickup-points" }, done: 2, total: 5 }],
      ["winback", "d7", { firstName: "Ada" }],
      ["winback", "d14", { firstName: "Ada", giftCredits: 50 }],
      ["winback", "d30", { firstName: "Ada" }],
      ["first_win", "once", { firstName: "Ada" }],
      ["credits_low", "month", { firstName: "Ada", creditsLeft: 7 }],
    ];
    for (const [key, stage, vars] of cases) {
      const message = j.journeyMessage(key, stage, role, vars);
      assert.ok(message.subject && message.heading && message.title && message.description, `${role} ${key} ${stage}`);
      assert.ok(message.subject.length <= 70, `${role} ${key}: subject length`);
      if (key !== "setup_help") assert.match(message.cta.path, prefix, `${role} ${key}: button opens their portal`);
      assert.doesNotMatch(JSON.stringify(message), /—/, "no em dashes");
    }
  }
  assert.match(j.journeyMessage("winback", "d14", "seller", { firstName: "Ada", giftCredits: 50 }).subject, /50 AI credits/);
  assert.match(j.journeyMessage("credits_low", "month", "seller", { firstName: "Ada", creditsLeft: 1 }).subject, /1 AI credit left/);
  assert.match(j.journeyBodyHtml({ paragraphs: ["<b>x</b>"] }), /&lt;b&gt;x&lt;\/b&gt;/);
});

test("journeys: the weekly summary's Refer & earn box, and the wiring", () => {
  assert.match(j.referralSummaryHtml({ appUrl: "https://app.shopinbos.com/", joined: 0, rewarded: 0, waiting: 0, earned: null }), /3 months free or 500 AI credits/);
  const box = j.referralSummaryHtml({ appUrl: "https://app.shopinbos.com", joined: 3, rewarded: 1, waiting: 2, earned: "3 months free" });
  assert.match(box, /3 businesses joined with your invite, 2 on their way\. You've earned 3 months free so far\./);
  assert.match(box, /href="https:\/\/app\.shopinbos\.com\/refer"/);
  const server = fs.readFileSync("src/lib/member-messaging/journeys.server.ts", "utf8");
  assert.match(server, /=== true/, "journeys are off until switched on");
  assert.match(fs.readFileSync("src/app/api/webhooks/paystack/route.ts", "utf8"), /notifyRenewalFailed\(event\.data/);
  assert.match(fs.readFileSync("src/lib/email/weekly-summary.server.ts", "utf8"), /rendered\.bodyHtml \+= await referralBox/);
});
