// Push center (shared/push-campaigns.ts, src/lib/push-campaigns): audience filters, where a tap goes, the test
// before the first send, the daily limit and Lagos times, the run that never tells anyone twice, the "Shopinbos
// news" category people can switch off, and the admin nav entry.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pc = await import("../shared/push-campaigns.ts");
const n = await import("../shared/notifications.ts");
const nav = await import("../src/lib/nav.ts");
const team = await import("../src/lib/admin-team/pure.ts");
const lc = await import("../src/lib/launch-check/pure.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ─── Audience ─────────────────────────────────────────────────────────────────

test("audience: parsing keeps only what makes sense for the scope", () => {
  assert.deepEqual(pc.parseAudience({ scope: "everyone" }), { audience: { scope: "everyone", platform: "any" } });
  assert.ok("error" in pc.parseAudience({ scope: "roles", roles: [] }), "roles needs a role");
  assert.ok("error" in pc.parseAudience({ scope: "nobody" }));
  assert.ok("error" in pc.parseAudience({ scope: "user", contact: "  " }));
  const roles = pc.parseAudience({ scope: "roles", roles: ["seller", "seller", "hacker", "rider"], platform: "app", cities: [" Lagos ", "", "Lagos"] });
  assert.deepEqual(roles.audience, { scope: "roles", roles: ["seller", "rider"], platform: "app", cities: ["Lagos"] });
  // "only me" and one person ignore location and the bell-only option.
  assert.deepEqual(pc.parseAudience({ scope: "me", cities: ["Abuja"], includeBellOnly: true }).audience, { scope: "me", platform: "any" });
  // Bell-only people only make sense when every device kind is picked.
  assert.equal(pc.parseAudience({ scope: "everyone", platform: "web", includeBellOnly: true }).audience.includeBellOnly, undefined);
  assert.equal(pc.parseAudience({ scope: "everyone", platform: "any", includeBellOnly: true }).audience.includeBellOnly, true);
});

test("audience: the user filter for each scope", () => {
  const ctx = { meId: "admin1" };
  const where = (raw, extra = {}) => pc.audienceUserWhere(pc.parseAudience(raw).audience, { ...ctx, ...extra });
  const pushOn = { pushDevices: { some: { disabledAt: null } } };

  assert.deepEqual(where({ scope: "everyone" }), { AND: [{ role: { in: ["seller", "supplier", "logistics_partner"] } }, pushOn] }, "admins are never in everyone");
  assert.deepEqual(where({ scope: "everyone", includeBellOnly: true }), { role: { in: ["seller", "supplier", "logistics_partner"] } });
  assert.deepEqual(where({ scope: "me" }), { AND: [{ id: "admin1" }, pushOn] });
  assert.deepEqual(where({ scope: "roles", roles: ["supplier", "rider"], platform: "web" }), { AND: [{ role: { in: ["supplier"] } }, { pushDevices: { some: { disabledAt: null, provider: "webpush" } } }] });
  assert.equal(where({ scope: "roles", roles: ["rider"] }), null, "riders aren't accounts");
  assert.equal(where({ scope: "user", contact: "nobody@example.com" }, { userId: null }), null, "unknown person: nobody");
  assert.deepEqual(where({ scope: "user", contact: "ada@example.com" }, { userId: "u9" }).AND.slice(0, 1), [{ id: "u9" }]);

  const notLive = where({ scope: "sellers_not_live", platform: "app" });
  assert.deepEqual(notLive.AND[0], { role: "seller" });
  assert.deepEqual(notLive.AND[1], { NOT: { store: { is: pc.LIVE_STORE_WHERE } } }, "no store counts as not live too");
  assert.deepEqual(notLive.AND[2], { pushDevices: { some: { disabledAt: null, provider: "expo" } } });
  assert.equal(JSON.stringify(pc.LIVE_STORE_WHERE).includes('"LIVE"'), true, "same rule as storeIsLive");

  assert.deepEqual(where({ scope: "sellers_no_products" }).AND.slice(0, 2), [{ role: "seller" }, { storeProducts: { none: {} } }]);

  const city = where({ scope: "everyone", cities: ["Lagos"] });
  const or = city.AND[1].OR;
  assert.equal(or.length, 4, "account, store, supplier and delivery business city");
  assert.deepEqual(or[1], { store: { is: { city: { equals: "Lagos", mode: "insensitive" } } } });
});

test("audience: riders, platforms and the description", () => {
  const a = (raw) => pc.parseAudience(raw).audience;
  assert.equal(pc.audienceHasRiders(a({ scope: "roles", roles: ["rider"] })), true);
  assert.equal(pc.audienceHasRiders(a({ scope: "roles", roles: ["rider"], platform: "web" })), false, "riders only use the phone app");
  assert.equal(pc.audienceHasRiders(a({ scope: "roles", roles: ["rider"], cities: ["Lagos"] })), false, "riders have no city");
  assert.equal(pc.audienceHasRiders(a({ scope: "everyone" })), false);
  assert.deepEqual(pc.audienceRiderWhere(a({ scope: "roles", roles: ["rider"] })), { status: "active", riderTokenHash: { not: null }, pushDevices: { some: { disabledAt: null } } });
  assert.deepEqual(pc.pushPlatformsFor(a({ scope: "everyone", platform: "app" })), ["app"]);
  assert.equal(pc.pushPlatformsFor(a({ scope: "everyone" })), undefined);
  assert.equal(pc.describeAudience({ scope: "roles", roles: ["seller", "rider"], platform: "app", cities: ["Kano"] }), "Sellers, Riders · Phone app only · in Kano");
  assert.equal(pc.countsTowardsLimit(a({ scope: "me" })), false);
  assert.equal(pc.countsTowardsLimit(a({ scope: "user", contact: "x@y.co" })), true);
});

// ─── Links ────────────────────────────────────────────────────────────────────

test("links: every curated screen opens an app screen on the phone and a web page in a browser", () => {
  for (const item of pc.PUSH_LINKS) {
    const link = pc.resolvePushLink({ linkKey: item.key });
    assert.ok(link, item.key);
    assert.ok(pc.isSafeWebPath(link.link), `${item.key} web`);
    assert.ok(link.appRoute, `${item.key} resolves through appRouteFor`);
    assert.ok(n.appRouteFor(item.app), `${item.key} app link`);
  }
  const get = (key) => pc.resolvePushLink({ linkKey: key });
  assert.equal(get("orders").appRoute, "/orders");
  assert.equal(get("chats").appRoute, "/chats");
  assert.equal(get("find").appRoute, "/find");
  assert.equal(get("posts").appRoute, "/posts");
  assert.equal(get("wallet").appRoute, "/wallet");
  assert.equal(get("supplier-home").appRoute, "/supplier/home");
  assert.equal(get("partner-home").appRoute, "/logistics/home");
  assert.equal(get("rider-home").appRoute, "/rider");
  const rewards = get("rewards");
  assert.deepEqual([rewards.link, rewards.appLink, rewards.appRoute], ["/home/refer", "app:/rewards", "/rewards"], "app-only screen: its own app link");
  assert.equal(get("orders").appLink, null, "the web path is the app link");
  assert.equal(pc.resolvePushLink({ linkKey: "nope" }), null);
});

test("links: custom web paths are checked, and map to a screen when the app has one", () => {
  const custom = (customPath) => pc.resolvePushLink({ linkKey: pc.CUSTOM_LINK, customPath });
  assert.deepEqual(custom("/home/orders/abc123"), { linkKey: "custom", link: "/home/orders/abc123", appLink: null, appRoute: "/order/abc123" });
  assert.equal(custom("/home/marketing/campaigns").appRoute, "/marketing", "a screen the app has");
  assert.equal(custom("/home/brand-kit").appRoute, null, "else the app opens the website page");
  for (const bad of ["https://evil.example", "//evil.example/x", "javascript:alert(1)", "/a b", "", null, "/x\"><script>", `/${"a".repeat(400)}`]) assert.equal(custom(bad), null, String(bad));
  // The phone's push payload uses the app link when there is one (notify() appRoute).
  assert.match(read("src/lib/notifications/notify.server.ts"), /appRouteFor\(input\.appRoute \|\| url\)/);
});

// ─── Test first, daily limit, Lagos time ──────────────────────────────────────

test("a real send needs a test of exactly this message", () => {
  const hash = pc.contentHash({ title: "New", body: "Bank transfers", link: "/home", appLink: null });
  assert.equal(pc.contentHash({ title: " New ", body: "Bank transfers ", link: "/home" }), hash, "spaces at the ends don't matter");
  assert.notEqual(pc.contentHash({ title: "New!", body: "Bank transfers", link: "/home" }), hash);
  assert.notEqual(pc.contentHash({ title: "New", body: "Bank transfers", link: "/home/orders" }), hash, "a changed link needs a new test");
  assert.equal(pc.testMatches({ testedHash: hash }, hash), true);
  assert.equal(pc.testMatches({ testedHash: null }, hash), false);
  assert.equal(pc.testMatches({ testedHash: "other" }, hash), false);
  const server = read("src/lib/push-campaigns/campaigns.server.ts");
  assert.match(server, /if \(!testMatches\(row, hashOf\(row\)\)\) throw/);
});

test("Lagos time: typed times, days and the daily limit", () => {
  assert.equal(pc.lagosInputToDate("2026-11-30T09:15").toISOString(), "2026-11-30T08:15:00.000Z");
  assert.equal(pc.lagosInputToDate("2026-12-01T00:30").toISOString(), "2026-11-30T23:30:00.000Z");
  assert.equal(pc.lagosInputToDate("2026-02-31T10:00"), null);
  assert.equal(pc.lagosInputToDate("tomorrow"), null);
  assert.equal(pc.dateToLagosInput("2026-11-30T23:30:00.000Z"), "2026-12-01T00:30");
  assert.equal(pc.lagosDay("2026-11-30T23:30:00Z"), "2026-12-01");

  const at = new Date("2026-11-30T12:00:00Z");
  const sameDay = ["2026-11-30T07:00:00Z", "2026-11-30T15:00:00Z", "2026-11-29T23:10:00Z" /* 00:10 Lagos on the 30th */];
  assert.deepEqual(pc.dailyLimitCheck(sameDay.slice(0, 2), at), { used: 2, limit: 3, reached: false });
  assert.deepEqual(pc.dailyLimitCheck(sameDay, at), { used: 3, limit: 3, reached: true });
  assert.equal(pc.dailyLimitCheck(["2026-11-29T22:00:00Z"], at).used, 0, "23:00 Lagos the day before");

  const now = new Date("2026-11-30T12:00:00Z");
  assert.equal(pc.scheduleProblem(new Date(now.getTime() + 60_000), now), "Pick a time at least 5 minutes from now.");
  assert.equal(pc.scheduleProblem(new Date(now.getTime() + 3600_000), now), null);
  assert.equal(pc.scheduleProblem(new Date(now.getTime() + 61 * 86_400_000), now), "Schedule it within the next 60 days.");
});

// ─── Sending: the claim and the batches ───────────────────────────────────────

function memoryStore({ people = 250, status = "scheduled", scheduledAt = new Date("2026-11-30T08:00:00Z"), failFor = new Set() } = {}) {
  const campaign = { status, scheduledAt };
  const rows = [];
  const told = new Map(); // userId → times notify() really sent (dedupe key per campaign)
  const notified = new Set();
  let id = 0;
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const store = {
    told,
    rows,
    campaign,
    status: async () => campaign.status,
    claim: async (_id, now) => {
      await tick();
      // Compare-and-set, like UPDATE … WHERE status = 'scheduled' AND scheduledAt <= now.
      if (campaign.status !== "scheduled" || campaign.scheduledAt > now) return false;
      campaign.status = "sending";
      return true;
    },
    hasRecipients: async () => rows.length > 0,
    snapshot: async () => {
      let added = 0;
      for (let i = 0; i < people; i++) {
        const userId = `u${String(i).padStart(4, "0")}`;
        if (rows.some((row) => row.userId === userId)) continue; // unique (campaignId, userId)
        rows.push({ id: `r${id++}`, userId, riderId: null, status: "queued", claimedAt: null });
        added++;
      }
      return added;
    },
    claimBatch: async (_id, take) => {
      // FOR UPDATE SKIP LOCKED: synchronous here, so two runs never get the same rows.
      const batch = rows.filter((row) => row.status === "queued").slice(0, take);
      for (const row of batch) {
        row.status = "sending";
        row.claimedAt = Date.now();
      }
      await tick();
      return batch.map(({ id, userId, riderId }) => ({ id, userId, riderId }));
    },
    deliver: async (_id, recipient) => {
      await tick();
      if (failFor.has(recipient.userId)) throw new Error("Database hiccup");
      // notify() with dedupeKey "push-campaign:<id>": the second call returns the first notification.
      if (!notified.has(recipient.userId)) {
        notified.add(recipient.userId);
        told.set(recipient.userId, (told.get(recipient.userId) ?? 0) + 1);
      }
      return { notificationId: `n-${recipient.userId}` };
    },
    markSent: async (rowId, notificationId) => {
      const row = rows.find((r) => r.id === rowId);
      if (row.status === "sending") Object.assign(row, { status: "sent", notificationId });
    },
    markFailed: async (rowId, error) => {
      const row = rows.find((r) => r.id === rowId);
      if (row.status === "sending") Object.assign(row, { status: "failed", error });
    },
    requeueStale: async (_id, before) => {
      for (const row of rows) if (row.status === "sending" && row.claimedAt < before.getTime()) Object.assign(row, { status: "queued", claimedAt: null });
    },
    remaining: async () => rows.filter((row) => row.status === "queued" || row.status === "sending").length,
    finish: async () => {
      if (campaign.status === "sending") campaign.status = "sent";
    },
  };
  return store;
}

test("claim: two cron runs at once start a scheduled campaign exactly once", async () => {
  const store = memoryStore();
  const now = new Date("2026-11-30T08:05:00Z");
  const claims = await Promise.all([store.claim("c1", now), store.claim("c1", now), store.claim("c1", now)]);
  assert.deepEqual(claims.filter(Boolean).length, 1);
  assert.equal(store.campaign.status, "sending");
  assert.equal(await store.claim("c1", now), false, "already started");

  const early = memoryStore();
  assert.equal(await early.claim("c1", new Date("2026-11-30T07:59:00Z")), false, "not due yet");
  const cancelled = memoryStore({ status: "cancelled" });
  assert.equal(await cancelled.claim("c1", now), false, "cancelled never starts");
});

test("run: overlapping runs tell everyone once, then mark it sent", async () => {
  const store = memoryStore({ people: 250, status: "sending" });
  const deadline = Date.now() + 10_000;
  const [a, b] = await Promise.all([pc.runCampaign({ id: "c1", store, deadline, batchSize: 40 }), pc.runCampaign({ id: "c1", store, deadline, batchSize: 40 })]);
  assert.equal(store.told.size, 250);
  assert.ok([...store.told.values()].every((times) => times === 1), "nobody twice");
  assert.equal(a.delivered + b.delivered, 250, "each recipient row handled by one run");
  assert.equal(store.rows.length, 250, "the second snapshot added nobody");
  assert.equal(store.campaign.status, "sent");
  assert.equal(store.rows.every((row) => row.status === "sent"), true);

  // A finished campaign isn't run again.
  const again = await pc.runCampaign({ id: "c1", store, deadline });
  assert.deepEqual(again, { status: "sent", delivered: 0, failed: 0, remaining: 0 });
});

test("run: a run that died mid-batch is picked up, and nobody is told twice", async () => {
  const store = memoryStore({ people: 30, status: "sending" });
  await store.snapshot("c1");
  // A crashed run claimed 10 rows long ago and told 4 of them before dying.
  const stuck = await store.claimBatch("c1", 10);
  for (const row of store.rows.filter((r) => r.status === "sending")) row.claimedAt = Date.now() - pc.CAMPAIGN_STALE_MS - 1000;
  for (const recipient of stuck.slice(0, 4)) await store.deliver("c1", recipient);
  const progress = await pc.runCampaign({ id: "c1", store, deadline: Date.now() + 5000, batchSize: 8 });
  assert.equal(progress.status, "sent");
  assert.equal(store.told.size, 30);
  assert.ok([...store.told.values()].every((times) => times === 1));
});

test("run: failures are recorded, stop at the deadline, and a cancelled campaign stops", async () => {
  const failing = memoryStore({ people: 12, status: "sending", failFor: new Set(["u0003", "u0007"]) });
  const done = await pc.runCampaign({ id: "c1", store: failing, deadline: Date.now() + 5000, batchSize: 5 });
  assert.equal(done.failed, 2);
  assert.equal(done.delivered, 10);
  assert.equal(failing.rows.filter((row) => row.status === "failed").length, 2);
  assert.equal(failing.campaign.status, "sent", "failed rows don't hold it in sending");

  const slow = memoryStore({ people: 50, status: "sending" });
  let clock = 0;
  const partial = await pc.runCampaign({ id: "c1", store: slow, deadline: 2, now: () => clock++, batchSize: 10 });
  assert.equal(partial.status, "sending");
  assert.ok(partial.remaining > 0, "the cron carries on");

  const stopped = memoryStore({ people: 50, status: "sending" });
  const deliver = stopped.deliver;
  stopped.deliver = async (id, recipient) => {
    stopped.campaign.status = "cancelled";
    return deliver(id, recipient);
  };
  const result = await pc.runCampaign({ id: "c1", store: stopped, deadline: Date.now() + 5000, batchSize: 10 });
  assert.equal(result.delivered, 10, "stops after the batch in hand");
  assert.equal(stopped.campaign.status, "cancelled");
});

test("server: atomic claims in SQL and Prisma", () => {
  const server = read("src/lib/push-campaigns/campaigns.server.ts");
  assert.match(server, /updateMany\(\{ where: \{ id, status: "scheduled", scheduledAt: \{ lte: now \} \}, data: \{ status: "sending"/, "cron claim is a compare-and-set");
  assert.match(server, /updateMany\(\{ where: \{ id, status: "draft" \}, data: \{ \.\.\.base, status: "sending"/, "send now claims the draft");
  assert.match(server, /FOR UPDATE SKIP LOCKED/);
  assert.match(server, /dedupeKey: key/, "notify() dedupes per campaign");
  assert.match(server, /category: "announcements"/);
  assert.match(server, /audit\(id, "sent", admin/);
  const migration = read("docs/migrations/2026-11-30-push-center.sql");
  for (const table of ["PushCampaign", "PushCampaignRecipient", "PushCampaignEvent"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  assert.match(migration, /'push-campaigns'/);
  assert.match(migration, /vault\.decrypted_secrets where name = 'cron_secret'/);
  assert.doesNotMatch(migration, /DROP |ALTER TABLE "(Notification|PushDevice|User)" (DROP|ALTER)/, "additive only");
});

// ─── The category people can switch off ──────────────────────────────────────

test("Shopinbos news: its own switch, push and bell only, quiet hours apply", () => {
  assert.ok(n.NOTIFY_CATEGORY_KEYS.includes("announcements"));
  assert.equal(n.eventInfo("push.campaign").category, "announcements");
  assert.equal(n.eventInfo("push.campaign").urgent, undefined, "never urgent unless the admin ticks it");
  for (const role of ["seller", "supplier", "logistics_partner"]) assert.ok(n.categoriesFor(role).some((c) => c.key === "announcements"), `${role} can switch it off`);
  assert.equal(n.categoriesFor("admin").some((c) => c.key === "announcements"), false);

  const defaults = n.resolvePreferences([]);
  assert.deepEqual(defaults.announcements, { push: true, email: false, sms: false, whatsapp: false });
  const on = n.planDelivery({ category: "announcements", urgent: false, prefs: defaults, quiet: false, email: "notification" });
  assert.deepEqual(on, { push: "send", email: false, sms: false, whatsapp: false });

  // Switched off: no push (the bell still has it). Texts and email can't be switched on.
  const off = n.resolvePreferences([{ eventKey: "notify.announcements", push: false, email: true, sms: true, whatsapp: true }]);
  assert.deepEqual(off.announcements, { push: false, email: false, sms: false, whatsapp: false });
  assert.equal(n.planDelivery({ category: "announcements", urgent: true, prefs: off, quiet: false }).push, "off", "urgent doesn't override the switch");
  assert.equal(n.planDelivery({ category: "announcements", urgent: false, prefs: defaults, quiet: true }).push, "hold", "quiet hours hold it");
  assert.equal(n.planDelivery({ category: "announcements", urgent: true, prefs: defaults, quiet: true }).push, "send", "urgent (admin-ticked) goes through");
  assert.equal(n.planDelivery({ category: "announcements", urgent: false, prefs: defaults, quiet: false, email: "transactional" }).email, false);
  assert.equal(n.androidChannelFor("announcements"), "news");
  assert.equal(n.ANDROID_CHANNELS.find((c) => c.id === "news").name, "Shopinbos news");

  // Words in all five languages for the web and phone settings.
  for (const ns of ["notifications", "m_notifications"]) {
    for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
      assert.ok(CATALOGS[ns][locale]["category.announcements"], `${ns}/${locale} category`);
      assert.ok(CATALOGS[ns][locale]["help.announcements"], `${ns}/${locale} help`);
    }
  }
  // The settings API refuses email for it, and both settings screens list every category from the API.
  assert.match(read("src/app/api/notifications/settings/route.ts"), /if \(!channelAllowedFor\(key, "email"\)\) next\.email = false;/);
  assert.match(read("apps/mobile/src/app/notifications/settings.tsx"), /settings\.categories\.map/);
});

test("opens: the app and the browser report a tapped push", () => {
  assert.match(read("apps/mobile/src/components/PushManager.tsx"), /reportPushOpened\(data\.notificationId\)/);
  assert.match(read("apps/mobile/src/lib/notifications.ts"), /\/api\/notifications\/opened/);
  assert.match(read("public/sw-push.js"), /\/api\/notifications\/opened/);
  assert.match(read("src/app/api/notifications/opened/route.ts"), /withAuth/);
  assert.match(read("src/lib/push-campaigns/campaigns.server.ts"), /where: \{ notificationId, userId, openedAt: null \}/, "only the person's own tap counts, once");
});

// ─── Admin ────────────────────────────────────────────────────────────────────

test("admin: the Push center is in the nav, in the content section, translated, and its cron is registered", () => {
  const item = nav.NAV_BY_ROLE.admin.flatMap((group) => group.items).find((entry) => entry.id === "push");
  assert.deepEqual({ href: item.href, label: item.label }, { href: "/admin/push", label: "Push center" });
  assert.equal(team.sectionForPath("/admin/push"), "content");
  assert.equal(team.sectionForPath("/api/admin/push/campaigns/x/send"), "content");
  assert.equal(team.adminCanOpen("growth", "/admin/push"), true);
  assert.equal(team.adminCanOpen("support", "/admin/push"), false);
  assert.equal(team.adminCanOpen("finance", "/api/admin/push"), false);
  assert.ok(team.adminNavIds("growth").includes("push"));
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(CATALOGS.nav[locale]["admin.push"], `nav ${locale}`);
  assert.ok(lc.SCHEDULED_JOBS.some((job) => job.path === "/api/cron/push-campaigns" && job.qstash === "push-campaigns"));
  assert.match(read("scripts/qstash-schedules.mjs"), /id: "push-campaigns", path: "\/api\/cron\/push-campaigns", cron: "\*\/5 \* \* \* \*"/);
  // Admin-only and urgent kept to owners and admins.
  for (const route of ["route.ts", "campaigns/route.ts", "campaigns/[id]/send/route.ts", "campaigns/[id]/test/route.ts", "audience/route.ts"]) assert.match(read(`src/app/api/admin/push/${route}`), /withAdmin\(/, route);
  assert.match(read("src/lib/push-campaigns/campaigns.server.ts"), /canSendUrgent = \(adminRole: string \| null \| undefined\) => !adminRole \|\| adminRole === "owner" \|\| adminRole === "admin"/);
});
