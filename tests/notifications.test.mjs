// Notifications (shared/notifications.ts): preferences per category × channel, quiet hours and the urgent bypass,
// bursts ("5 new orders"), dedupe keys, where a tap goes in the app, Expo push batches, tickets and receipts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const n = await import("../shared/notifications.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Lagos is UTC+1 all year.
const lagos = (hh, mm = 0) => new Date(Date.UTC(2026, 9, 13, (hh + 23) % 24, mm));

test("preferences: defaults, saved rows, the older message setting, and no texts for marketing", () => {
  const defaults = n.resolvePreferences([]);
  assert.equal(defaults.orders.push, true);
  assert.equal(defaults.orders.email, true);
  assert.equal(defaults.messages.email, false);
  assert.equal(defaults.orders.sms, false);

  const saved = n.resolvePreferences([
    { eventKey: "notify.orders", push: false, email: false, sms: true, whatsapp: true },
    { eventKey: "notify.marketing", push: true, email: true, sms: true, whatsapp: true },
  ]);
  assert.deepEqual(saved.orders, { push: false, email: false, sms: true, whatsapp: true });
  assert.equal(saved.marketing.sms, false, "never texts for marketing");
  assert.equal(saved.marketing.whatsapp, false);

  const legacy = n.resolvePreferences([{ eventKey: "message_received", push: false, email: true, sms: true, whatsapp: false, inApp: true }]);
  assert.equal(legacy.messages.sms, true, "old message setting still counts");
  assert.equal(legacy.messages.email, true);
  const legacyOff = n.resolvePreferences([{ eventKey: "message_received", push: false, email: false, sms: false, whatsapp: false, inApp: false }]);
  assert.equal(legacyOff.messages.push, false);
  const overridden = n.resolvePreferences([
    { eventKey: "message_received", push: false, email: true, sms: true, whatsapp: false, inApp: true },
    { eventKey: "notify.messages", push: true, email: false, sms: false, whatsapp: false },
  ]);
  assert.equal(overridden.messages.sms, false, "the new setting wins once saved");
});

test("quiet hours: 22:00 to 07:00 Lagos, across midnight, off and broken values", () => {
  const quiet = n.DEFAULT_QUIET_HOURS;
  assert.equal(n.isQuietTime(lagos(23), quiet), true);
  assert.equal(n.isQuietTime(lagos(2, 30), quiet), true);
  assert.equal(n.isQuietTime(lagos(6, 59), quiet), true);
  assert.equal(n.isQuietTime(lagos(7), quiet), false);
  assert.equal(n.isQuietTime(lagos(12), quiet), false);
  assert.equal(n.isQuietTime(lagos(21, 59), quiet), false);
  assert.equal(n.isQuietTime(lagos(22), quiet), true);
  assert.equal(n.isQuietTime(lagos(23), { ...quiet, enabled: false }), false);
  assert.equal(n.isQuietTime(lagos(14), { ...quiet, start: "13:00", end: "15:00" }), true, "same-day window");
  assert.equal(n.isQuietTime(lagos(23), { ...quiet, start: "nope" }), false);
  assert.equal(n.isQuietTime(lagos(23), { ...quiet, start: "22:00", end: "22:00" }), false);
  assert.equal(n.parseClock("7:05"), 425);
  assert.equal(n.parseClock("24:00"), null);
});

test("delivery plan: category × channel × quiet hours × urgent bypass × email kind", () => {
  const prefs = n.resolvePreferences([{ eventKey: "notify.orders", push: true, email: true, sms: true, whatsapp: false }]);
  const day = n.planDelivery({ category: "orders", urgent: false, prefs, quiet: false, email: "notification" });
  assert.deepEqual(day, { push: "send", email: true, sms: true, whatsapp: false });

  const night = n.planDelivery({ category: "orders", urgent: false, prefs, quiet: true, email: "notification" });
  assert.equal(night.push, "hold", "waits for the morning summary");
  assert.equal(night.sms, false, "no texts at night");
  assert.equal(night.email, true, "email isn't noisy");

  const urgent = n.planDelivery({ category: "orders", urgent: true, prefs, quiet: true });
  assert.equal(urgent.push, "send", "an order waiting to be accepted still buzzes");
  assert.equal(urgent.sms, true);
  assert.equal(urgent.email, false, "no email unless the event has one");

  const off = n.resolvePreferences([{ eventKey: "notify.money", push: false, email: false, sms: false, whatsapp: false }]);
  assert.equal(n.planDelivery({ category: "money", urgent: false, prefs: off, quiet: false, email: "transactional" }).email, true, "billing email can't be switched off");
  assert.equal(n.planDelivery({ category: "money", urgent: false, prefs: off, quiet: false, email: "notification" }).email, false);
  assert.equal(n.planDelivery({ category: "money", urgent: false, prefs: off, quiet: false }).push, "off");
  assert.equal(n.planDelivery({ category: "orders", urgent: true, prefs, quiet: false, phoneHandled: true }).sms, false, "the caller already texted");

  for (const event of ["supplier_order.new", "supplier_order.reminder", "payin.reminder", "payin.overdue", "rider.job_assigned"]) {
    assert.equal(n.eventInfo(event)?.urgent, true, `${event} bypasses quiet hours`);
  }
  assert.equal(n.eventInfo("order.new")?.urgent, undefined);
  assert.equal(n.eventInfo("nope"), null);
  assert.equal(n.categoryForType("dropshipping"), "orders");
  assert.equal(n.categoryForType("payout"), "money");
  assert.equal(n.categoryForType("customers"), "messages");
  assert.equal(n.categoryForType("peggy"), "marketing");
});

test("bursts: first push goes, the rest within 3 minutes are held and sent as one summary", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  assert.equal(n.burstDecision({ now, lastSentAt: null }), "send");
  assert.equal(n.burstDecision({ now, lastSentAt: new Date(now.getTime() - 60_000) }), "hold");
  assert.equal(n.burstDecision({ now, lastSentAt: new Date(now.getTime() - n.BURST_WINDOW_MS) }), "send");
  assert.equal(n.burstFlushDue(new Date(now.getTime() - 2 * 60_000), now), false);
  assert.equal(n.burstFlushDue(new Date(now.getTime() - 3 * 60_000), now), true);
  const collapse = n.collapseByKey("order.new");
  assert.deepEqual(n.burstSummary(collapse, 5), { title: "5 new orders", body: "Tap to see them." });
  assert.equal(n.burstSummary(collapse, 1).title, "1 new order");
  assert.equal(n.collapseByKey("stock")?.many, "products need restocking");
  assert.equal(n.collapseByKey("nope"), null);
  // Card and pay-on-delivery payments share one burst.
  assert.equal(n.eventInfo("order.paid").collapse.key, n.eventInfo("order.cod_paid").collapse.key);

  const summary = n.quietSummary(["orders", "orders", "messages", "orders"], "seller");
  assert.equal(summary.title, "4 updates while you were away");
  assert.equal(summary.body, "Orders 3 · Messages 1. Tap to see them.");
  assert.equal(n.quietSummary(["orders"], "logistics_partner").body, "Jobs 1. Tap to see them.");
  assert.equal(n.quietSummary([]), null);
});

test("dedupe keys: stable, trimmed, and the automatic key catches repeats within two minutes", () => {
  assert.equal(n.dedupeKey("supplier_order.new", "abc"), "supplier_order.new:abc");
  assert.equal(n.dedupeKey("a", null, undefined, false, "", "b"), "a:b");
  assert.equal(n.dedupeKey("x".repeat(300)).length, 190);
  const input = { event: "order.new", title: "New order 1001", description: "Ada placed an order", link: "/home/orders/1" };
  const t = new Date("2026-10-13T12:00:10Z");
  assert.equal(n.autoDedupeKey(input, t), n.autoDedupeKey(input, new Date("2026-10-13T12:01:50Z")));
  assert.notEqual(n.autoDedupeKey(input, t), n.autoDedupeKey(input, new Date("2026-10-13T12:02:01Z")));
  assert.notEqual(n.autoDedupeKey(input, t), n.autoDedupeKey({ ...input, title: "New order 1002" }, t));
  assert.match(n.shortHash("hello"), /^[0-9a-f]{8}$/);
});

test("deep links: a tap opens the order, chat, job, quote or payout screen", () => {
  assert.deepEqual(n.appRouteFor("/home/orders/ord_1"), { pathname: "/order/[id]", params: { id: "ord_1" } });
  assert.deepEqual(n.appRouteFor("/home/orders/ord_1#supplier-orders"), { pathname: "/order/[id]", params: { id: "ord_1" } });
  assert.deepEqual(n.appRouteFor("https://app.shopinbos.com/home/orders/ord_1"), { pathname: "/order/[id]", params: { id: "ord_1" } });
  assert.deepEqual(n.appRouteFor("/home/orders"), { pathname: "/orders" });
  assert.deepEqual(n.appRouteFor("/home/messages?c=conv_9"), { pathname: "/inbox/[id]", params: { id: "conv_9" } });
  assert.deepEqual(n.appRouteFor("/home/messages/partners?c=conv_2"), { pathname: "/partners/[id]", params: { id: "conv_2" } });
  assert.deepEqual(n.appRouteFor("/supplier/inbox?c=c3"), { pathname: "/supplier/chat/[id]", params: { id: "c3" } });
  assert.deepEqual(n.appRouteFor("/logistics/inbox?c=c4"), { pathname: "/logistics/chat/[id]", params: { id: "c4" } });
  assert.deepEqual(n.appRouteFor("/supplier/orders/so_1"), { pathname: "/supplier/order/[id]", params: { id: "so_1" } });
  assert.deepEqual(n.appRouteFor("/supplier/orders/wo_1?kind=wholesale"), { pathname: "/supplier/order/[id]", params: { id: "wo_1", kind: "wholesale" } });
  assert.deepEqual(n.appRouteFor("/supplier/quotes?quote=q1"), { pathname: "/supplier/quote/[id]", params: { id: "q1" } });
  assert.deepEqual(n.appRouteFor("/supplier/quotes"), { pathname: "/supplier/quotes" });
  assert.deepEqual(n.appRouteFor("/supplier/payouts"), { pathname: "/supplier/money" });
  assert.deepEqual(n.appRouteFor("/logistics/bookings?job=b1"), { pathname: "/logistics/job/[id]", params: { id: "b1" } });
  assert.deepEqual(n.appRouteFor("/logistics/cash"), { pathname: "/logistics/earnings" });
  assert.deepEqual(n.appRouteFor("/rider/drop/d1"), { pathname: "/rider/drop/[id]", params: { id: "d1" } });
  assert.deepEqual(n.appRouteFor("/home/reviews"), { pathname: "/reviews" });
  assert.equal(n.appRouteFor("/admin/supplier-products"), null, "no app screen: opens the website");
  assert.equal(n.appRouteFor("/home/orders/new"), null);
  assert.equal(n.appRouteFor("javascript:alert(1)"), null);
  assert.equal(n.appRouteFor(null), null);
  assert.equal(n.routeHref({ pathname: "/order/[id]", params: { id: "a b" } }), "/order/a%20b");
  assert.equal(n.routeHref({ pathname: "/supplier/order/[id]", params: { id: "x", kind: "wholesale" } }), "/supplier/order/x?kind=wholesale");
  assert.equal(n.androidChannelFor("stock"), "orders");
  assert.equal(n.androidChannelFor("money"), "money");
  assert.deepEqual(n.ANDROID_CHANNELS.map((channel) => channel.id), ["orders", "messages", "money", "deliveries", "marketing"]);
});

test("Expo: batches of 100, tickets, and receipts that switch off dead phones", () => {
  const tokens = Array.from({ length: 250 }, (_, i) => i);
  assert.deepEqual(n.chunk(tokens, n.EXPO_BATCH_SIZE).map((batch) => batch.length), [100, 100, 50]);
  assert.deepEqual(n.chunk([], 100), []);
  assert.equal(n.isExpoPushToken("ExponentPushToken[abcdefghijklmnop]"), true);
  assert.equal(n.isExpoPushToken("hello"), false);

  const tickets = n.readTickets(["d1", "d2", "d3"], [
    { status: "ok", id: "t1" },
    { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
    { status: "error", message: "too big", details: { error: "MessageTooBig" } },
  ]);
  assert.deepEqual(tickets.map((t) => [t.status, t.ticketId, t.dead]), [["sent", "t1", false], ["error", null, true], ["error", null, false]]);
  assert.equal(n.readTickets(["d1"], null)[0].status, "error", "request failed: nothing sent");

  const rows = [
    { id: "r1", ticketId: "t1", deviceId: "d1" },
    { id: "r2", ticketId: "t2", deviceId: "d2" },
    { id: "r3", ticketId: "t3", deviceId: "d3" },
    { id: "r4", ticketId: "t4", deviceId: "d2" },
  ];
  const outcome = n.readReceipts(rows, {
    t1: { status: "ok" },
    t2: { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
    t3: { status: "error", message: "rate", details: { error: "MessageRateExceeded" } },
  });
  assert.deepEqual(outcome.ok, ["r1"]);
  assert.deepEqual(outcome.failed.map((f) => f.id), ["r2", "r3"]);
  assert.deepEqual(outcome.deadDevices, ["d2"]);
  assert.deepEqual(outcome.pending, ["r4"]);

  assert.equal(n.isDeadWebPushStatus(410), true);
  assert.equal(n.isDeadWebPushStatus(404), true);
  assert.equal(n.isDeadWebPushStatus(500), false);
  assert.equal(n.isAllowedWebPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(n.isAllowedWebPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(n.isAllowedWebPushEndpoint("https://web.push.apple.com/Q"), true);
  assert.equal(n.isAllowedWebPushEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(n.isAllowedWebPushEndpoint("https://169.254.169.254/latest"), false, "never an internal address");
  assert.equal(n.isAllowedWebPushEndpoint("https://evilfcm.googleapis.com.attacker.io/x"), false);
});

test("list helpers: Today / Yesterday / Earlier and short times", () => {
  const now = new Date(2026, 9, 13, 15, 0);
  const groups = n.groupByDay([
    { id: 1, createdAt: new Date(2026, 9, 13, 9, 0) },
    { id: 2, createdAt: new Date(2026, 9, 12, 23, 0) },
    { id: 3, createdAt: new Date(2026, 9, 1, 9, 0) },
    { id: 4, createdAt: new Date(2026, 9, 13, 0, 1).toISOString() },
  ], now);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((i) => i.id)]), [["Today", [1, 4]], ["Yesterday", [2]], ["Earlier", [3]]]);
  assert.equal(n.timeAgo(new Date(now.getTime() - 30_000), now), "Just now");
  assert.equal(n.timeAgo(new Date(now.getTime() - 5 * 60_000), now), "5m ago");
  assert.equal(n.categoryLabel("orders", "logistics_partner"), "Jobs");
  assert.deepEqual(n.categoriesFor("logistics_partner").map((c) => c.key), ["orders", "money", "messages", "deliveries", "account"]);
});

test("wiring: one notify() path, every role's key events, cron and push plumbing", () => {
  const create = read("src/lib/notifications/create.ts");
  assert.match(create, /from "\.\/notify\.server"/, "createNotification goes through notify()");
  assert.doesNotMatch(create, /db\.notification\.create/);
  const notify = read("src/lib/notifications/notify.server.ts");
  assert.match(notify, /planDelivery/);
  assert.match(notify, /sendPlatformEmail/, "email compliance kept");
  assert.match(notify, /held_quiet/);
  assert.match(notify, /held_burst/);

  const events = read("src/lib/notifications/events.server.ts");
  for (const name of ["notifyNewOrder", "notifyOrderPaid", "notifyStockAfterSale", "notifyReviewsSaved", "notifyCampaignFinished", "notifySupplierQuoteAnswered", "notifyJobMoved", "notifyRiderAssigned", "notifyJobOffered", "notifySupplierQuoteRequested", "notifyProductDecision", "notifyVerificationDecision", "notifyAdminsToReview"]) {
    assert.match(events, new RegExp(`export function ${name}\\(`), name);
  }
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /notifyNewOrder\(/);
  assert.doesNotMatch(read("src/app/api/public/store/[slug]/checkout/route.ts"), /db\.notification\.create/);
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /afterRetailOrderPaid\(ref/);
  assert.match(read("src/lib/commerce/order-paid.server.ts"), /notifyOrderPaid\(orderId\)/);
  assert.match(read("src/lib/logistics/jobs.ts"), /notifyJobMoved\(/);
  assert.match(read("src/lib/logistics/jobs.ts"), /notifyRiderAssigned\(/);
  assert.match(read("src/lib/supplier-orders/service.server.ts"), /event: "supplier_order\.new"/);
  assert.match(read("src/lib/supplier-orders/acceptance.server.ts"), /event: "supplier_order\.reminder"/);
  assert.match(read("src/lib/logistics/payin-standing.server.ts"), /payin\.reminder/);

  const cron = read("src/app/api/cron/push-receipts/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/, "the cron secret or a signed QStash call");
  assert.match(cron, /runPushMaintenance/);
  assert.match(read("scripts/qstash-schedules.mjs"), /\{ id: "push-receipts", path: "\/api\/cron\/push-receipts", cron: "\*\/5 \* \* \* \*" \}/);
  const devices = read("src/app/api/notifications/devices/route.ts");
  assert.match(devices, /checkRateLimitShared/);
  assert.match(devices, /isAllowedWebPushEndpoint/);
  assert.match(devices, /x-rider-token/i);
  assert.match(read("public/sw-push.js"), /notificationclick/);
  const migration = read("docs/migrations/2026-10-20-push-notifications.sql");
  for (const table of ["PushDevice", "NotificationDelivery", "NotificationSetting"]) assert.match(migration, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  assert.match(migration, /cron\.schedule/);

  const app = JSON.parse(read("apps/mobile/app.json"));
  assert.ok(app.expo.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications"));
  assert.match(read("apps/mobile/package.json"), /"expo-notifications": "~57\./);
  assert.match(read("apps/mobile/src/lib/push.ts"), /getExpoPushTokenAsync/);
  assert.doesNotMatch(read("apps/mobile/src/components/PushManager.tsx"), /requestPermissionsAsync/, "never asks at launch");
});
