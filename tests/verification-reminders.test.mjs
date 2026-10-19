// "Continue without documents": portal access, reminder schedule and the reminder email.
// Pure helpers plus source checks (src/lib/verification/reminders.ts, src/lib/role-queries.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const r = await import("../src/lib/verification/reminders.ts");
const DAY = 24 * 60 * 60 * 1000;
const start = "2026-10-01T10:00:00.000Z";
const t0 = Date.parse(start);

test("reminders go out on days 1, 3 and 7, one per run, never two within a day, three at most", () => {
  assert.equal(r.dueReminder(start, [], t0 + DAY - 1), null, "not before a day");
  assert.equal(r.dueReminder(start, [], t0 + DAY), 0);
  const first = new Date(t0 + DAY).toISOString();
  assert.equal(r.dueReminder(start, [first], t0 + 2 * DAY), null, "second waits for day 3");
  assert.equal(r.dueReminder(start, [first], t0 + 3 * DAY), 1);
  // Someone who started long ago only gets the next one, then waits a day.
  const late = t0 + 30 * DAY;
  assert.equal(r.dueReminder(start, [], late), 0);
  assert.equal(r.dueReminder(start, [new Date(late).toISOString()], late + 1000), null);
  assert.equal(r.dueReminder(start, [new Date(late).toISOString()], late + DAY), 1);
  assert.equal(r.dueReminder(start, ["a", "b", "c"], late), null, "three at most");
  assert.equal(r.dueReminder(null, [], late), null);
  assert.equal(r.dueReminder("nonsense", [], late), null);
});

test("the clock starts at 'documents later', else a completed onboarding save", () => {
  assert.equal(r.reminderStart({ docsLaterAt: start, updatedAt: "x" }), start);
  assert.equal(r.reminderStart({ completed: true, updatedAt: start }), start);
  assert.equal(r.reminderStart({ completed: false, updatedAt: start }), null, "still in the wizard");
  assert.equal(r.reminderStart(null), null);
  assert.deepEqual(r.sentReminders({ docReminders: [start, 4] }), [start]);
  assert.deepEqual(r.sentReminders([]), []);
});

test("reminder email escapes names and lists what's missing", () => {
  const { subject, html } = r.reminderEmail({
    index: 0, role: "supplier", firstName: "Ada<script>", businessName: "Ada & Co", missing: ["Owner identity document (NIN)"],
    link: "https://app.shopinbos.com/supplier/verification", cacEnabled: true,
  });
  assert.match(subject, /Ada & Co/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Ada&lt;script&gt;/);
  assert.match(html, /Owner identity document \(NIN\)/);
  assert.match(html, /CAC/);
  assert.match(html, /\/supplier\/verification/);
  assert.notEqual(r.reminderEmail({ index: 2, role: "logistics_partner", firstName: "A", businessName: "B", missing: [], link: "x", cacEnabled: false }).subject, subject);
});

test("'add documents later' opens the portal but never trading or review", () => {
  const roles = readFileSync("src/lib/role-queries.ts", "utf8");
  assert.match(roles, /docsLaterAt/, "onboarding counts as done once documents are deferred");
  const api = readFileSync("src/app/api/supplier/onboarding/route.ts", "utf8");
  assert.match(api, /docsLater/);
  assert.match(api, /parsed\.data\.completed \? "pending" : "unverified"/, "deferring never marks the account pending or verified");
  const actions = readFileSync("src/app/actions/supplier.ts", "utf8");
  assert.match(actions, /wantsReview && verified \? "pending_review" : "draft"/, "unverified suppliers can only save drafts");
  assert.match(actions, /function assertVerifiedSupplier/, "quotes and orders still need verification");
  const productApi = readFileSync("src/app/api/supplier/products/route.ts", "utf8");
  assert.match(productApi, /unverified && parsed\.data\.status && parsed\.data\.status !== "draft"/);
  const productPatch = readFileSync("src/app/api/supplier/products/[id]/route.ts", "utf8");
  assert.match(productPatch, /VERIFICATION_REQUIRED/);
  const cron = readFileSync("src/app/api/cron/verification-reminders/route.ts", "utf8");
  assert.match(cron, /cronAuthorization/);
  // Copy lives in the onboarding catalog; the component shows it through t().
  const ui = readFileSync("src/components/onboarding/SupplierOnboarding.tsx", "utf8") + readFileSync("shared/i18n/messages/onboarding/en.ts", "utf8");
  assert.match(ui, /Continue without documents/);
  assert.match(ui, /CacInstantCheck/);
});
