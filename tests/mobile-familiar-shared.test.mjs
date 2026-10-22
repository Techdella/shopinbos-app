// The phone app's shared "Familiar app" screens (apps/mobile/src/app/{rewards,ask-peggy}.tsx, create/, posts/,
// status/new.tsx): the pure helpers are loaded directly (Node strips the types); the screens are checked for the
// product rules: AI credits are never sold in the app, we never claim to post for anyone, points are never money,
// and every backend call has a "coming soon" path while the routes land.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pure = await import("../apps/mobile/src/lib/familiar-pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const en = read("shared/i18n/messages/m_familiar/en.ts");

const SCREENS = [
  "apps/mobile/src/app/rewards.tsx",
  "apps/mobile/src/app/ask-peggy.tsx",
  "apps/mobile/src/app/create/index.tsx",
  "apps/mobile/src/app/create/[id].tsx",
  "apps/mobile/src/app/posts/index.tsx",
  "apps/mobile/src/app/posts/[id].tsx",
  "apps/mobile/src/app/status/new.tsx",
];

test("week strip: Monday to Sunday, and the range the calendar asks for", () => {
  const wednesday = new Date(2026, 9, 21, 15, 30);
  const days = pure.weekDays(wednesday);
  assert.equal(days.length, 7);
  assert.equal(days[0].getDay(), 1);
  assert.equal(days[0].getDate(), 19);
  assert.equal(days[6].getDate(), 25);
  const sunday = pure.weekDays(new Date(2026, 9, 25, 23, 0));
  assert.equal(sunday[0].getDate(), 19, "Sunday belongs to the week that started on Monday");
  const range = pure.weekRange(wednesday);
  assert.equal(range.from.getTime(), new Date(2026, 9, 19).getTime());
  assert.equal(range.to.getTime(), new Date(2026, 9, 26).getTime());
});

test("scheduling: only times still ahead, else tomorrow morning", () => {
  const morning = new Date(2026, 9, 21, 7, 0);
  assert.deepEqual(pure.firstSlot(morning).hour, 8);
  const lateEvening = new Date(2026, 9, 21, 20, 0);
  const slot = pure.firstSlot(lateEvening);
  assert.equal(slot.hour, 8);
  assert.equal(slot.day.getDate(), 22);
  assert.equal(pure.canSchedule(new Date(2026, 9, 21), 13, new Date(2026, 9, 21, 12, 55)), false, "less than 10 minutes away");
  assert.equal(pure.canSchedule(new Date(2026, 9, 21), 13, new Date(2026, 9, 21, 12, 0)), true);
  assert.equal(pure.scheduleDays(morning).length, 7);
});

test("post pills and the day a post sits on", () => {
  assert.deepEqual(pure.postPill("posted"), { key: "posted", tone: "ok" });
  assert.deepEqual(pure.postPill("scheduled"), { key: "scheduled", tone: "teal" });
  assert.deepEqual(pure.postPill("anything"), { key: "draft", tone: "gray" });
  assert.deepEqual(pure.postPill("attention"), { key: "attention", tone: "warn" });
  assert.deepEqual(pure.postPill("posted", true), { key: "yourTurn", tone: "org" });
  assert.deepEqual(pure.postPill("draft", true), { key: "draft", tone: "gray" });
  assert.equal(pure.postDay({ scheduledAt: null, postedAt: null }), null);
  assert.equal(pure.postDay({ scheduledAt: "2026-10-22T07:00:00.000Z", postedAt: null }).toISOString(), "2026-10-22T07:00:00.000Z");
  for (const key of ["attention", "yourTurn"]) assert.match(en, new RegExp(`"posts\\.status\\.${key}"`));
});

test("scheduling copy is honest per app: auto for a seller's connected Facebook and Instagram, reminders for the rest", () => {
  const seller = [
    { key: "whatsapp", linked: true, auto: false },
    { key: "instagram", linked: false, auto: false },
    { key: "facebook", linked: true, auto: true },
    { key: "tiktok", linked: false, auto: false },
  ];
  assert.deepEqual(pure.scheduleSplit(["whatsapp", "facebook", "tiktok"], seller), { auto: ["facebook"], remind: ["whatsapp", "tiktok"] });
  assert.deepEqual(pure.scheduleSplit(["whatsapp"], seller), { auto: [], remind: ["whatsapp"] });
  assert.deepEqual(pure.scheduleSplit(["facebook"], null), { auto: [], remind: ["facebook"] }, "before the accounts load: reminders");
  assert.equal(pure.needsConnecting("instagram", seller), true, "a seller's Instagram needs the Page connected first");
  assert.equal(pure.needsConnecting("facebook", seller), false);
  assert.equal(pure.needsConnecting("whatsapp", seller), false);
  // Suppliers and partners: no `auto`, every app is a reminder and can be picked.
  const supplier = [{ key: "instagram", linked: false }, { key: "facebook", linked: true }];
  assert.equal(pure.needsConnecting("instagram", supplier), false);
  assert.deepEqual(pure.scheduleSplit(["instagram", "facebook"], supplier), { auto: [], remind: ["instagram", "facebook"] });

  const and = (a, b) => `${a} and ${b}`;
  assert.equal(pure.joinNames([], and), "");
  assert.equal(pure.joinNames(["WhatsApp"], and), "WhatsApp");
  assert.equal(pure.joinNames(["WhatsApp", "TikTok"], and), "WhatsApp and TikTok");
  assert.equal(pure.joinNames(["Facebook", "Instagram", "X"], and), "Facebook, Instagram and X");
  for (const key of ["sched.autoOnly", "sched.autoAndRemind", "sched.connectFirst", "posts.statusNoteSeller", "and"]) assert.match(en, new RegExp(`"${key.replace(".", "\\.")}"`));
  assert.match(read("apps/mobile/src/components/familiar/ScheduleSheet.tsx"), /fetchPostAccounts\(\)/);
});

test("notification filters follow the prototype per role and map to the bell's categories", () => {
  assert.deepEqual(pure.notificationFilters("seller").map((f) => f.key), ["all", "orders", "money", "ai"]);
  assert.deepEqual(pure.notificationFilters("supplier").map((f) => f.key), ["all", "orders", "money", "ai"]);
  assert.deepEqual(pure.notificationFilters("logistics_partner").map((f) => f.key), ["all", "jobs", "money", "peggy"]);
  const categories = ["all", "orders", "money", "messages", "deliveries", "stock", "marketing", "account"];
  for (const role of ["seller", "supplier", "logistics_partner"]) for (const filter of pure.notificationFilters(role)) assert.ok(categories.includes(filter.tab), `${role} ${filter.key}`);
  assert.match(read("apps/mobile/src/app/notifications/index.tsx"), /notificationFilters\(role\)/);
});

test("status picks and headlines", () => {
  assert.deepEqual(pure.statusPicks("logistics_partner").map((p) => p.key), ["route", "pickup", "sameDay", "interstate"]);
  assert.equal(pure.statusPicks("supplier").length, 0, "suppliers pick one of their products instead");
  assert.equal(pure.statusHeadline("  Looking   for a Lagos partner ", ""), "Looking for a Lagos partner");
  assert.equal(pure.statusHeadline("", "New pickup point"), "New pickup point");
  assert.ok(pure.statusHeadline("x".repeat(200), "").length <= pure.STATUS_HEADLINE_MAX);
  assert.equal(pure.familiarRole("admin"), "seller");
  assert.equal(pure.asFormat("reel"), "reel");
  assert.equal(pure.asFormat("story"), null);
});

test("polling backs off and stops", () => {
  assert.ok(pure.pollDelay(0) >= 1000);
  assert.ok(pure.pollDelay(100) <= 6000);
  assert.ok(pure.POLL_LIMIT > 10);
});

test("credits are shown, never sold: Top up emails how to top up on the website", () => {
  const credits = read("apps/mobile/src/components/familiar/Credits.tsx");
  assert.match(credits, /emailTopUp\(\)/);
  for (const path of [...SCREENS, "apps/mobile/src/components/familiar/Credits.tsx"]) {
    const source = read(path);
    assert.doesNotMatch(source, /₦\s?\d|price list|Pay now|buyCredits|purchase/i, `${path} sells nothing`);
  }
  assert.match(en, /"credits\.emailed": "We've emailed you how to top up on the website\."/);
});

test("posting is share sheet plus reminders: no copy claims we post for anyone", () => {
  assert.match(en, /"sched\.remind": "We'll remind you to post it at that time\."/);
  assert.match(en, /"posts\.statusNote": "WhatsApp Status can't be posted for you/);
  const words = [...en.matchAll(/^\s+"[^"]+": "(.*)",$/gm)].map((m) => m[1]);
  for (const line of words) assert.doesNotMatch(line, /we(?:'ll| will)? post (?:it )?for you|auto-?post|posts? automatically/i, line);
  const share = read("apps/mobile/src/lib/familiar-share.ts");
  assert.match(share, /expo-file-system/);
  assert.match(share, /shareAsync/);
  assert.match(share, /whatsapp:\/\/send\?text=/);
  assert.match(share, /await import\("expo-sharing"\)/, "loaded lazily so an older build falls back instead of crashing");
});

test("points are never money", () => {
  assert.match(en, /"rw\.noCash": "Points can't be turned into cash\."/);
  assert.match(read("apps/mobile/src/app/rewards.tsx"), /rw\.noCash/);
  assert.doesNotMatch(read("apps/mobile/src/app/rewards.tsx"), /withdraw/i);
});

test("every screen has a coming-soon path for a backend that isn't there yet", () => {
  for (const path of SCREENS) {
    const source = read(path);
    assert.match(source, /soon/, `${path} shows "coming soon"`);
    assert.match(source, /404|optional\(|useLoad\(\(?\)? ?=?>? ?fetch\w+/, `${path} handles a missing route`);
  }
});

test("the reminder push opens the post", async () => {
  const notifications = await import("../shared/notifications.ts");
  assert.deepEqual(notifications.appRouteFor("app:/posts/p_9"), { pathname: "/posts/[id]", params: { id: "p_9" } });
  assert.match(read("apps/mobile/src/lib/notifications.ts"), /app:/);
});

test("the seller's Peggy screen stays; Ask Peggy is the screen for every role", () => {
  assert.match(read("apps/mobile/src/app/peggy.tsx"), /\/api\/app\/peggy/);
  const ask = read("apps/mobile/src/app/ask-peggy.tsx");
  assert.match(ask, /askPeggy\(/);
  assert.match(ask, /CreditsLine/);
  for (const role of ["seller", "supplier", "partner"]) assert.match(en, new RegExp(`"peg\\.suggest\\.${role}\\.1"`));
});
