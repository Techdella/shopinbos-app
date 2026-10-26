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
  // A "show it to shops" save from an unverified supplier is kept as a draft (never refused, never sent for review).
  assert.match(productApi, /status: parsed\.data\.status === "pending_review" && !unverified \? "pending_review" : "draft"/);
  assert.doesNotMatch(productApi, /VERIFICATION_REQUIRED/);
  const productPatch = readFileSync("src/app/api/supplier/products/[id]/route.ts", "utf8");
  assert.match(productPatch, /VERIFICATION_REQUIRED/);
  const cron = readFileSync("src/app/api/cron/verification-reminders/route.ts", "utf8");
  // cronDenied (src/lib/auth/cron-request.ts): QStash signature or Bearer CRON_SECRET via constant-time cronAuthorization.
  assert.match(cron, /export async function GET\(req: NextRequest\) \{\s*const denied = await cronDenied\(req\);\s*if \(denied\) return denied;/);
  assert.match(readFileSync("src/lib/auth/cron-request.ts", "utf8"), /cronAuthorization\(req\.headers\.get\("authorization"\), secret\) !== "ok"/);
  // Copy lives in the onboarding catalog; the component shows it through t().
  const ui = readFileSync("src/components/onboarding/SupplierOnboarding.tsx", "utf8") + readFileSync("shared/i18n/messages/onboarding/en.ts", "utf8");
  assert.match(ui, /Continue without documents/);
  assert.match(ui, /CacInstantCheck/);
});

test("verify sequence: the first nudge now, then 3 and 7 days after it, never two in a day", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const start = Date.parse("2026-10-26T10:00:00Z");
  assert.equal(r.dueNudge([], start), 0);
  const first = [new Date(start).toISOString()];
  assert.equal(r.dueNudge(first, start + 2 * DAY), null);
  assert.equal(r.dueNudge(first, start + 3 * DAY), 1);
  const second = [...first, new Date(start + 3 * DAY).toISOString()];
  assert.equal(r.dueNudge(second, start + 6 * DAY), null);
  assert.equal(r.dueNudge(second, start + 7 * DAY), 2);
  assert.equal(r.dueNudge([...second, new Date(start + 7 * DAY).toISOString()], start + 30 * DAY), null, "three at most");
  assert.deepEqual(r.sentNudges({ verifyNudges: ["a", 1, "b"] }), ["a", "b"]);
});

test("verify sequence: the wallet switches on when they verify, and Peggy's free call is always there", () => {
  const base = { role: "logistics_partner", firstName: "Ada", businessName: "Ada Logistics", missing: ["CAC certificate"], link: "https://app.shopinbos.com/logistics/verification", cacEnabled: false, peggyImage: "https://app.shopinbos.com/brand/email/call-peggy.png", dashboard: "https://app.shopinbos.com/logistics/dashboard" };
  const withWallet = r.verifyNudgeEmail({ ...base, index: 0, wallet: { number: "9818722144", bank: "Wema Bank" } });
  assert.match(withWallet.subject, /Shopinbos Wallet switches on when you verify/);
  assert.match(withWallet.bodyHtml, /981 872 2144/);
  assert.match(withWallet.bodyHtml, /Call Peggy, free/);
  assert.match(withWallet.bodyHtml, /call-peggy\.png/);
  const noWallet = r.verifyNudgeEmail({ ...base, index: 1, wallet: null });
  assert.match(noWallet.subject, /Call Peggy/);
  assert.doesNotMatch(noWallet.bodyHtml, /wallet account number/i);
});
