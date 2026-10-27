// Setup nudges for new sellers (src/lib/setup/lifecycle.ts): when they go out, what they say, and when they stop.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lc = await import("../src/lib/setup/lifecycle.ts");
const setup = await import("../src/lib/setup/checklist.ts");
const DAY = 24 * 60 * 60 * 1000;
const created = new Date("2026-10-01T09:00:00Z");
const at = (days, hours = 0) => created.getTime() + days * DAY + hours * 3600_000;
const facts = { lookChosen: true, products: 2, productsWithPhotos: 0, paymentMethodsOn: 1, activeDeliveryZones: 0, deliveryPartners: 0, payoutBank: false, live: false, socialsConnected: 0, shared: false, customDomain: false, subscribers: 0, campaignsSent: 0 };
const choices = { skipped: [], dismissed: false, sharedAt: null };

test("nudges go out on days 1, 3, 7 and 14, one at a time, a day apart at least", () => {
  assert.equal(lc.dueLifecycleEmail(created, [], at(0, 20)), null, "not on day 0");
  assert.equal(lc.dueLifecycleEmail(created, [], at(1)), 0);
  const first = [new Date(at(1)).toISOString()];
  assert.equal(lc.dueLifecycleEmail(created, first, at(2)), null);
  assert.equal(lc.dueLifecycleEmail(created, first, at(3)), 1);
  assert.equal(lc.dueLifecycleEmail(created, [...first, new Date(at(3)).toISOString(), new Date(at(7)).toISOString(), new Date(at(14)).toISOString()], at(20)), null, "four at most");
  assert.equal(lc.dueLifecycleEmail(created, [], at(31)), null, "nothing past the window");
});

test("a shop met late gets only the latest nudge, not a catch-up run", () => {
  assert.equal(lc.dueLifecycleEmail(created, [], at(10)), 2, "day 10: the day-7 nudge");
  const settings = lc.withLifecycleEmailSent({ setup: { start: { skipped: ["domain"] } }, other: 1 }, new Date(at(10)), 2);
  assert.deepEqual(lc.sentLifecycleEmails(settings).slice(0, 2), ["skipped", "skipped"]);
  assert.equal(settings.other, 1, "the rest of brandSettings is kept");
  assert.deepEqual(settings.setup.start, { skipped: ["domain"] }, "Start here choices are kept");
  assert.equal(lc.dueLifecycleEmail(created, lc.sentLifecycleEmails(settings), at(11)), null);
  assert.equal(lc.dueLifecycleEmail(created, lc.sentLifecycleEmails(settings), at(14)), 3);
});

test("the email leads with the next step, its button and what's left; nudges stop when setup is done or dismissed", () => {
  const checklist = setup.buildSetupChecklist(facts, choices);
  assert.equal(lc.wantsSetupNudges(checklist), true);
  const email = lc.lifecycleEmail({ index: 0, firstName: "Ada", storeName: "Ada Fabrics", checklist, base: "https://app.shopinbos.com" });
  assert.match(email.subject, /Ada Fabrics: your next step is "add your first products with photos"/);
  assert.match(email.bodyHtml, /Add your first products with photos/);
  assert.match(email.bodyHtml, /href="https:\/\/app\.shopinbos\.com\/products"/, "the step's own page");
  assert.match(email.bodyHtml, /Set where you deliver/, "other steps left are listed");
  assert.match(email.bodyHtml, /Ask Rex/);
  const inline = setup.buildSetupChecklist({ ...facts, productsWithPhotos: 2 }, choices);
  assert.equal(lc.stepLink(inline.next, "https://app.shopinbos.com"), "https://app.shopinbos.com/home/start", "steps done in place open Start here");
  assert.equal(lc.wantsSetupNudges(setup.buildSetupChecklist(facts, { ...choices, dismissed: true })), false, "\"I'm done here\" stops them");
  const done = { ...facts, productsWithPhotos: 2, activeDeliveryZones: 1, payoutBank: true, live: true, socialsConnected: 1, shared: true };
  assert.equal(lc.wantsSetupNudges(setup.buildSetupChecklist(done, choices)), false, "finished setup stops them");
});

test("the hourly job honours email preferences, records before sending, and only sellers get it", () => {
  const server = readFileSync(new URL("../src/lib/setup/lifecycle.server.ts", import.meta.url), "utf8");
  assert.match(server, /platformEmailAllowed\(user\.id, "lifecycle"\)/);
  assert.match(server, /user\.role !== "seller"/);
  assert.ok(server.indexOf("db.store.update") < server.indexOf("sendPlatformEmail({"), "recorded first, so a slow send can't double up");
  assert.match(readFileSync(new URL("../src/app/api/cron/lifecycle/route.ts", import.meta.url), "utf8"), /const denied = await cronDenied\(req\);/);
});

test("paused setup: nudged 2 and 5 days into a quiet spell, once each, then the winback journey takes over", () => {
  const lastActive = new Date("2026-10-20T00:00:00Z");
  const after = (days) => lastActive.getTime() + days * DAY;
  assert.equal(lc.resumeStage(lastActive, after(1.5)), null, "not before two days");
  assert.equal(lc.resumeStage(lastActive, after(2)), "d2");
  assert.equal(lc.resumeStage(lastActive, after(5.5)), "d5");
  assert.equal(lc.resumeStage(lastActive, after(7)), null, "winback from a week");
  assert.equal(lc.resumePeriod(lastActive, "d2"), "2026-10-20:d2");

  const checklist = setup.buildSetupChecklist(facts, choices);
  const period = lc.resumePeriod(lastActive, "d2");
  assert.equal(lc.wantsResumeNudge(checklist, [], period), true);
  const settings = lc.withResumeNudgeSent({ setup: { lifecycleEmails: ["2026-10-02T09:00:00.000Z"] }, other: 1 }, new Date(after(2)), period);
  assert.equal(settings.other, 1, "the rest of brandSettings is kept");
  assert.deepEqual(settings.setup.lifecycleEmails, ["2026-10-02T09:00:00.000Z"], "setup nudges are kept");
  const sent = lc.sentResumeNudges(settings);
  assert.deepEqual(sent, [{ period, at: new Date(after(2)).toISOString() }]);
  assert.equal(lc.wantsResumeNudge(checklist, sent, period), false, "once per spell and step");
  assert.equal(lc.wantsResumeNudge(checklist, sent, lc.resumePeriod(lastActive, "d5")), true);
  const many = Array.from({ length: lc.RESUME_MAX }, (_, i) => ({ period: `2026-09-0${i + 1}:d2`, at: "2026-09-01T00:00:00.000Z" }));
  assert.equal(lc.wantsResumeNudge(checklist, many, period), false, "capped across spells");
});

test("paused setup: only for sellers who started building and haven't finished or dismissed setup", () => {
  const period = "2026-10-20:d2";
  const untouched = setup.buildSetupChecklist({ ...facts, lookChosen: false, products: 0, productsWithPhotos: 0, paymentMethodsOn: 0 }, choices);
  assert.equal(lc.startedBuilding(untouched), false, "only the shop itself: the day 1/3/7/14 nudges cover them");
  assert.equal(lc.wantsResumeNudge(untouched, [], period), false);
  const dismissed = setup.buildSetupChecklist(facts, { ...choices, dismissed: true });
  assert.equal(lc.wantsResumeNudge(dismissed, [], period), false, "\"I'm done here\" stops them");
});

test("paused setup email: progress, what's done, and the next step's button", () => {
  const checklist = setup.buildSetupChecklist(facts, choices);
  const email = lc.resumeEmail({ stage: "d2", firstName: "Ada", storeName: "Ada <Fabrics>", checklist, base: "https://app.shopinbos.com" });
  assert.match(email.subject, new RegExp(`Pick up where you left off: Ada <Fabrics> is ${checklist.percent}% ready`));
  assert.match(email.bodyHtml, /Next: Add your first products with photos/);
  assert.match(email.bodyHtml, /href="https:\/\/app\.shopinbos\.com\/products"/);
  assert.match(email.bodyHtml, /Already done:/);
  assert.match(email.bodyHtml, /Choose your look/);
  assert.doesNotMatch(email.bodyHtml, /<Fabrics>/, "the shop name is escaped in the body");
  const later = lc.resumeEmail({ stage: "d5", firstName: "Ada", storeName: "Ada Fabrics", checklist, base: "https://app.shopinbos.com" });
  assert.match(later.subject, /Ada Fabrics is waiting for you, Ada/);
});
