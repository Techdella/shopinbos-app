// New-message notification settings (shared/message-notifications.ts): per-source push for delivery partners, the
// unread-message email, riders' own switches and quiet hours (Lagos), and the wiring into every message sender.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = await import("../shared/message-notifications.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Lagos is UTC+1 all year.
const lagos = (hh, mm = 0) => new Date(Date.UTC(2026, 9, 13, (hh + 23) % 24, mm));
const QUIET = { enabled: true, start: "22:00", end: "07:00", timezone: "Africa/Lagos" };

test("shouldPushMessage: off switches, per-source switches, quiet hours in Lagos", () => {
  assert.equal(m.shouldPushMessage({}, "riders", lagos(12)), "send");
  assert.equal(m.shouldPushMessage({ on: false }, "riders", lagos(12)), "off", "Messages switched off");
  assert.equal(m.shouldPushMessage({ sources: { riders: false } }, "riders", lagos(12)), "off");
  assert.equal(m.shouldPushMessage({ sources: { riders: false } }, "business", lagos(12)), "send", "only that source");
  assert.equal(m.shouldPushMessage({ quietHours: QUIET }, "riders", lagos(23)), "quiet");
  assert.equal(m.shouldPushMessage({ quietHours: QUIET }, "riders", lagos(6, 59)), "quiet");
  assert.equal(m.shouldPushMessage({ quietHours: QUIET }, "riders", lagos(7)), "send");
  assert.equal(m.shouldPushMessage({ quietHours: { ...QUIET, enabled: false } }, "riders", lagos(23)), "send");
  assert.equal(m.shouldPushMessage({ sources: { shops: false }, quietHours: QUIET }, "shops", lagos(23)), "off", "off beats quiet");
  assert.equal(m.shouldPushMessage({ sources: { riders: false } }, null, lagos(12)), "send", "no source: only the master switch");
});

test("partner sources: rows, defaults and the unread-message email", () => {
  assert.deepEqual(m.messageSourcesFor("logistics_partner"), ["riders", "business"]);
  assert.deepEqual(m.messageSourcesFor("seller"), []);
  assert.equal(m.messageSourceEventKey("riders"), "notify.messages.riders");
  const rows = [{ eventKey: "notify.messages.riders", push: false }];
  assert.equal(m.sourcePushOn(rows, "riders"), false);
  assert.equal(m.sourcePushOn(rows, "business"), true, "no row: on");
  assert.equal(m.sourcePushOn(rows, null), true);
  assert.deepEqual(m.messageSourceSwitches(rows, "logistics_partner"), [{ key: "riders", push: false }, { key: "business", push: true }]);
  assert.equal(m.unreadEmailOn([]), true, "the unread email is on until turned off");
  assert.equal(m.unreadEmailOn([{ eventKey: "message_received", push: false, email: false }]), false);
  assert.equal(m.unreadEmailOn([{ eventKey: "message_received", push: false, email: true }]), true);
});

test("riders: saved JSON read safely, changes validated, quiet hours", () => {
  assert.deepEqual(m.readRiderNotifyPrefs(null), m.DEFAULT_RIDER_NOTIFY_PREFS);
  assert.deepEqual(m.readRiderNotifyPrefs("junk"), m.DEFAULT_RIDER_NOTIFY_PREFS);
  const saved = m.readRiderNotifyPrefs({ company: false, quiet: { enabled: true, start: "21:00", end: "nope" } });
  assert.equal(saved.company, false);
  assert.equal(saved.shops, true);
  assert.deepEqual(saved.quiet, { enabled: true, start: "21:00", end: "07:00" });

  const base = m.DEFAULT_RIDER_NOTIFY_PREFS;
  assert.equal(m.mergeRiderNotifyPrefs(base, { shops: false }).shops, false);
  assert.equal(m.mergeRiderNotifyPrefs(base, { quiet: { enabled: true } }).quiet.enabled, true);
  assert.equal(m.mergeRiderNotifyPrefs(base, { shops: "no" }), null);
  assert.equal(m.mergeRiderNotifyPrefs(base, { quiet: { start: "25:00" } }), null);
  assert.equal(m.mergeRiderNotifyPrefs(base, null), null);
  assert.equal(base.shops, true, "the current settings aren't changed in place");

  assert.equal(m.riderMessagePush(base, "company", lagos(23)), "send", "riders start with quiet hours off");
  const quiet = m.mergeRiderNotifyPrefs(base, { quiet: { enabled: true } });
  assert.equal(m.riderMessagePush(quiet, "company", lagos(23)), "quiet");
  assert.equal(m.riderMessagePush(quiet, "company", lagos(9)), "send");
  assert.equal(m.riderMessagePush({ ...base, shops: false }, "shops", lagos(9)), "off");
  assert.equal(m.riderMessagePush({ ...base, shops: false }, "company", lagos(9)), "send");

  assert.equal(m.clockWords("22:00"), "10pm");
  assert.equal(m.clockWords("07:30"), "7:30am");
  assert.equal(m.clockWords("00:00"), "12am");
  assert.equal(m.clockWords("12:00"), "12pm");
});

test("wiring: every new-message sender passes who wrote, and notify() honours it", () => {
  const notifyServer = read("src/lib/notifications/notify.server.ts");
  assert.match(notifyServer, /category === "messages" && plan\.push !== "off" && !sourcePushOn\(rows, input\.messageSource\)/);
  assert.match(notifyServer, /riderMessagePush\(await riderNotifyPrefs\(input\.riderId\), input\.messageFrom/);
  assert.match(read("src/lib/notifications/create.ts"), /messageSource: input\.messageSource/);

  const riderChat = read("src/lib/logistics/rider-messages.server.ts");
  assert.match(riderChat, /messageFrom: data\.audience === "shop" \? "shops" : "company"/);
  assert.equal((riderChat.match(/messageSource: "riders"/g) ?? []).length, 2, "partner and shop told about a rider's message");
  assert.match(read("src/lib/conversations/service.server.ts"), /messageSource: "business"/);

  const settings = read("src/app/api/notifications/settings/route.ts");
  assert.match(settings, /messageSourceEventKey\(source\)/);
  assert.match(settings, /saveUnreadEmail/);
  assert.match(read("src/app/api/mobile/logistics/rider/notifications/route.ts"), /mergeRiderNotifyPrefs/);
  assert.match(read("prisma/schema.prisma"), /notifyPrefs\s+Json\?/);
  assert.match(read("docs/migrations/2026-12-15-message-notification-settings.sql"), /ADD COLUMN IF NOT EXISTS "notifyPrefs" JSONB/);
});

test("screens: web and phone settings, both Riders apps", () => {
  assert.match(read("src/components/notifications/NotificationSettingsPanel.tsx"), /messages\.fromRiders/);
  assert.match(read("apps/mobile/src/app/notifications/settings.tsx"), /messages\.unreadEmail/);
  assert.match(read("apps/mobile/src/app/rider/(tabs)/me.tsx"), /\/rider\/notifications/);
  assert.match(read("apps/mobile/src/app/rider/notifications.tsx"), /saveRiderNotify/);
  assert.match(read("src/app/rider/[token]/RiderApp.tsx"), /<RiderNotifySettings/);
});
