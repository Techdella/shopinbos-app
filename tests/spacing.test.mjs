// Spacing (no nuisance) and one account per phone number.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sp = await import("../src/lib/member-messaging/spacing.ts");
const { phoneKey } = await import("../shared/phone.ts");
const read = (path) => fs.readFileSync(path, "utf8");
const at = (iso) => new Date(iso);
const now = at("2026-11-12T10:00:00Z"); // Thursday 11:00 Lagos

test("spacing: one marketing message a day, emails 2 days apart, WhatsApp 4 days apart, weekly caps", () => {
  assert.equal(sp.spacingCheck("email", [], now).ok, true);
  const waYesterdayEvening = [{ channel: "whatsapp", at: at("2026-11-11T18:00:00Z") }];
  const blocked = sp.spacingCheck("email", waYesterdayEvening, now);
  assert.equal(blocked.ok, false, "a WhatsApp 16 hours ago: no email yet");
  assert.match(blocked.reason, /today/);
  assert.equal(blocked.until.toISOString(), "2026-11-12T14:00:00.000Z", "20 hours after it");
  assert.equal(sp.spacingCheck("email", [{ channel: "whatsapp", at: at("2026-11-11T09:00:00Z") }], now).ok, true, "a day later is fine");
  assert.equal(sp.spacingCheck("email", [{ channel: "email", at: at("2026-11-11T09:00:00Z") }], now).ok, false, "emails 2 days apart");
  assert.equal(sp.spacingCheck("email", [{ channel: "email", at: at("2026-11-10T09:00:00Z") }], now).ok, true);
  assert.equal(sp.spacingCheck("whatsapp", [{ channel: "whatsapp", at: at("2026-11-09T09:00:00Z") }], now).ok, false, "WhatsApp 4 days apart");
  assert.equal(sp.spacingCheck("whatsapp", [{ channel: "whatsapp", at: at("2026-11-08T09:00:00Z") }], now).ok, true);
  const threeEmails = ["2026-11-06T09:00:00Z", "2026-11-08T09:00:00Z", "2026-11-10T09:00:00Z"].map((iso) => ({ channel: "email", at: at(iso) }));
  const capped = sp.spacingCheck("email", threeEmails, now);
  assert.equal(capped.ok, false);
  assert.match(capped.reason, /3 emails this week/);
  assert.equal(sp.spacingCheck("email", [{ channel: "email", at: at("2026-11-01T09:00:00Z") }], now).ok, true, "older than a week doesn't count");
});

test("spacing: only Mon–Sat 08:00–20:00 Lagos, and waiting lands in those hours", () => {
  assert.equal(sp.inSendingHours(at("2026-11-12T06:59:00Z")), false, "07:59 Lagos");
  assert.equal(sp.inSendingHours(at("2026-11-12T07:00:00Z")), true);
  assert.equal(sp.inSendingHours(at("2026-11-15T10:00:00Z")), false, "Sunday");
  assert.equal(sp.nextSendingTime(at("2026-11-12T21:30:00Z")).toISOString(), "2026-11-13T07:00:00.000Z", "22:30 → 08:00 next day");
  assert.equal(sp.nextSendingTime(at("2026-11-14T20:00:00Z")).toISOString(), "2026-11-16T07:00:00.000Z", "Saturday night → Monday 08:00");
  assert.equal(sp.spacingCheck("email", [], at("2026-11-12T22:00:00Z")).ok, false);
});

test("spacing: every sender asks first and waits instead of piling up", () => {
  assert.match(read("src/lib/member-messaging/tips.server.ts"), /canContactMember\(person\.id, channel, now\)/);
  const journeys = read("src/lib/member-messaging/journeys.server.ts");
  assert.match(journeys, /return "waiting";/);
  assert.match(journeys, /canContactMember\(person\.id, "whatsapp", now\)/);
  assert.match(read("src/lib/member-messaging/announce.server.ts"), /waiting\.push\(person\.id\)/);
  assert.match(read("src/lib/lead-growth/service.server.ts"), /SPACING\.anyGapHours/);
  const touches = read("src/lib/member-messaging/spacing.server.ts");
  for (const source of ["memberMessage", "productNewsRecipient", "weeklySummaryLog", "lifecycleEmails"]) assert.match(touches, new RegExp(source), `${source} counts`);
});

test("one account per phone number: compared by the last 10 digits, checked at sign-up, sync and profile", () => {
  assert.equal(phoneKey("+234 803 123 4567"), "8031234567");
  assert.equal(phoneKey("08031234567"), "8031234567");
  assert.equal(phoneKey("2348031234567"), "8031234567");
  assert.equal(phoneKey("12345"), null);
  const otp = read("src/app/api/auth/otp/route.ts");
  assert.match(otp, /if \(create && usePhone\) \{[\s\S]*phoneOwner\(target\.phone\)[\s\S]*signsInWithPhone\(owner\.supabaseId, target\.phone\)[\s\S]*PHONE_TAKEN, 409/);
  assert.match(read("src/lib/auth/app-user.ts"), /phoneOwner\(phone, existingUser\?\.id \?\? null\)[\s\S]*phone = undefined/);
  assert.match(read("src/lib/seller-settings.server.ts"), /phoneOwner\(me\.phone, userId\)\)\) throw new PhoneTakenError/);
});
