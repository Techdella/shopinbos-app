// Lifecycle email: the catalog renders for every role, rules fire in their windows, and the planner sends at most
// one email at a time, never twice, never a pile of nudges, and never floods existing accounts on rollout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lc = await import("../src/lib/lifecycle/catalog.ts");
const { DAY, HOUR, LIFECYCLE_RULES, planLifecycle, summaryWindow, anniversary, band, BASELINE_AFTER } = lc;

const APP = "https://app.example";
// Wednesday 2026-10-14 10:00 UTC (11:00 Lagos): not a summary day.
const NOW = Date.UTC(2026, 9, 14, 10);
// Monday 2026-10-19 09:00 UTC (10:00 Lagos): summaries due.
const MONDAY = Date.UTC(2026, 9, 19, 9);

function base(role, overrides = {}) {
  return { userId: "u1", role, firstName: "Ada", email: "ada@example.com", createdAt: NOW, lastActiveAt: NOW, appUrl: APP, ...overrides };
}

const sellerFacts = (seller = {}, overrides = {}) =>
  base("seller", {
    seller: {
      storeName: "Ada Styles",
      storeUrl: "https://ada.shopinbos.store",
      currency: "NGN",
      live: false,
      products: 0,
      payoutBank: false,
      paidOrders: 0,
      revenue: 0,
      lastPaidOrderAt: null,
      dropshipProducts: 0,
      deliveryBookings: 0,
      week: { orders: 0, revenue: 0, visits: 0, toFulfil: 0 },
      ...seller,
    },
    ...overrides,
  });

const supplierFacts = (supplier = {}, overrides = {}) =>
  base("supplier", {
    supplier: {
      businessName: "Kano Leather Co",
      verification: "unverified",
      products: 0,
      liveProducts: 0,
      dropshipProducts: 0,
      orders: 0,
      revenue: 0,
      payoutAccount: false,
      week: { orders: 0, revenue: 0, quotes: 0, toFulfil: 0 },
      ...supplier,
    },
    ...overrides,
  });

const logisticsFacts = (logistics = {}, overrides = {}) =>
  base("logistics_partner", {
    logistics: {
      companyName: "Swift Riders",
      verification: "unverified",
      coverageZones: 0,
      priced: false,
      bookings: 0,
      delivered: 0,
      riders: 0,
      payoutAccount: false,
      week: { bookings: 0, delivered: 0, earnings: 0, open: 0 },
      ...logistics,
    },
    ...overrides,
  });

const adminFacts = (overrides = {}) =>
  base("admin", { admin: { pendingSuppliers: 3, pendingLogistics: 1, week: { sellers: 12, suppliers: 2, logistics: 1, orders: 40, gmv: 1_250_000 } }, ...overrides });

const sent = (rule, at, extra = {}) => ({ key: rule, rule, status: "sent", attempts: 1, at, ...extra });
const ids = (plan) => plan.due.map((item) => item.key);

test("every rule is well formed: unique id, role prefix, journey, and the right kind of email", () => {
  const seen = new Set();
  const prefix = { seller: "seller.", supplier: "supplier.", logistics_partner: "logistics.", admin: "admin." };
  for (const rule of LIFECYCLE_RULES) {
    assert.ok(!seen.has(rule.id), `duplicate rule ${rule.id}`);
    seen.add(rule.id);
    assert.ok(rule.id.startsWith(prefix[rule.role]), `${rule.id} is prefixed with its role`);
    assert.ok(lc.JOURNEY_PRIORITY.includes(rule.journey), `${rule.id} has a known journey`);
    assert.ok(rule.summary.length > 5, `${rule.id} has a summary`);
    if (rule.kind === "notification") {
      // Account news (welcome, verification, store live) can't be switched off, so it carries no topic.
      assert.equal(rule.topic, null, `${rule.id}: notification mail has no preference topic`);
      assert.ok(["account", "welcome"].includes(rule.journey), `${rule.id}: only account news and welcomes skip preferences`);
    } else {
      assert.ok(["lifecycle", "weekly_summary"].includes(rule.topic), `${rule.id} falls under a preference topic`);
      assert.equal(rule.topic === "weekly_summary", rule.journey === "summary", `${rule.id}: summaries and only summaries use weekly_summary`);
    }
  }
  for (const role of ["seller", "supplier", "logistics_partner", "admin"]) {
    const roleRules = LIFECYCLE_RULES.filter((rule) => rule.role === role);
    assert.ok(roleRules.some((rule) => rule.journey === "welcome"), `${role} has a welcome`);
    assert.ok(roleRules.some((rule) => rule.journey === "summary"), `${role} has a weekly summary`);
  }
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    const journeys = new Set(LIFECYCLE_RULES.filter((rule) => rule.role === role).map((rule) => rule.journey));
    for (const journey of ["onboarding", "activation", "milestone", "retention", "loyalty"]) assert.ok(journeys.has(journey), `${role} has ${journey} email`);
  }
});

test("every email renders cleanly for its role: no undefined/NaN, escaped names, absolute links", () => {
  const ctx = { now: MONDAY, sentAt: () => MONDAY - 3 * DAY };
  const busy = {
    seller: sellerFacts({ live: true, products: 12, paidOrders: 64, revenue: 1_450_000, lastPaidOrderAt: MONDAY - 22 * DAY, storeName: "Ada <b>&</b> Co", week: { orders: 4, revenue: 82_000, visits: 310, toFulfil: 2 } }),
    supplier: supplierFacts({ verification: "verified", products: 9, liveProducts: 7, orders: 55, revenue: 2_000_000, week: { orders: 3, revenue: 150_000, quotes: 2, toFulfil: 1 } }),
    logistics_partner: logisticsFacts({ verification: "verified", coverageZones: 4, priced: true, bookings: 120, delivered: 110, riders: 3, week: { bookings: 9, delivered: 8, earnings: 36_000, open: 1 } }),
    admin: adminFacts(),
  };
  for (const rule of LIFECYCLE_RULES) {
    const facts = { ...busy[rule.role], createdAt: MONDAY - 400 * DAY };
    const content = rule.render(facts, ctx);
    for (const field of ["subject", "heading", "preheader", "eyebrow", "bodyHtml"]) {
      assert.equal(typeof content[field], "string", `${rule.id}.${field}`);
      assert.ok(content[field].length > 0, `${rule.id}.${field} is not empty`);
      assert.doesNotMatch(content[field], /undefined|NaN|\[object Object\]/, `${rule.id}.${field}: ${content[field].slice(0, 120)}`);
    }
    assert.ok(content.subject.length <= 90, `${rule.id} subject fits an inbox line: ${content.subject}`);
    assert.doesNotMatch(content.bodyHtml, /<b>&<\/b>/, `${rule.id} escapes the store name`);
    if (content.cta) assert.match(content.cta.url, /^https:\/\/(app\.example\/|ada\.shopinbos\.store)/, `${rule.id} links somewhere real: ${content.cta.url}`);
  }
});

test("a new seller gets the welcome straight away, then the setup checklist the next day", () => {
  const fresh = sellerFacts();
  const first = planLifecycle(fresh, [], NOW + 5 * 60 * 1000);
  assert.equal(first.baselined, false, "new accounts are never baselined");
  assert.equal(first.send?.rule.id, "seller.welcome");
  assert.equal(first.send?.rule.kind, "notification");

  const dayLater = planLifecycle(fresh, [sent("seller.welcome", NOW)], NOW + 30 * HOUR);
  assert.equal(dayLater.send?.rule.id, "seller.setup_checklist");
  assert.equal(dayLater.send?.key, "seller.setup_checklist");

  // Once sent, it never goes again.
  const again = planLifecycle(fresh, [sent("seller.welcome", NOW), sent("seller.setup_checklist", NOW + 30 * HOUR)], NOW + 54 * HOUR);
  assert.notEqual(again.send?.rule.id, "seller.setup_checklist");
});

test("seller onboarding follows the store: products, publish, Rex, and stops once live", () => {
  const at = (days, seller, history = []) => planLifecycle(sellerFacts(seller), [sent("seller.welcome", NOW), ...history], NOW + days * DAY);
  assert.equal(at(3.5, {}).send?.rule.id, "seller.first_product");
  assert.equal(at(6, { products: 3 }).send?.rule.id, "seller.publish_store");
  assert.equal(at(10, { products: 3 }, [sent("seller.publish_store", NOW + 6 * DAY)]).send?.rule.id, "seller.rex_help");
  assert.equal(at(20, {}).send, null, "nudges stop after two weeks");

  const live = at(6, { products: 3, live: true });
  assert.equal(live.send?.rule.id, "seller.store_live", "going live is announced first");
  assert.ok(!ids(live).includes("seller.publish_store"));
});

test("activation tips wait for the moment they're useful", () => {
  const history = [sent("seller.welcome", NOW - 30 * DAY), sent("seller.store_live", NOW - 8 * DAY)];
  const facts = sellerFacts({ live: true, products: 6, payoutBank: true }, { createdAt: NOW - 30 * DAY });
  assert.equal(planLifecycle(facts, history, NOW).send?.rule.id, "seller.first_sale_tips");

  const noBank = sellerFacts({ live: true, products: 6, payoutBank: false }, { createdAt: NOW - 30 * DAY });
  assert.equal(planLifecycle(noBank, history, NOW).send?.rule.id, "seller.payout_setup", "payouts before tips");
  const justLaunched = [sent("seller.welcome", NOW - 30 * DAY), sent("seller.store_live", NOW - 2 * HOUR)];
  assert.ok(!ids(planLifecycle(noBank, justLaunched, NOW)).includes("seller.payout_setup"), "not on launch day");

  const selling = sellerFacts({ live: true, products: 6, payoutBank: true, paidOrders: 2, revenue: 20_000, lastPaidOrderAt: NOW - DAY }, { createdAt: NOW - 30 * DAY });
  const afterFirstSale = [...history, sent("seller.first_sale", NOW - 3 * DAY)];
  assert.equal(planLifecycle(selling, afterFirstSale, NOW).send?.rule.id, "seller.delivery_intro");
});

test("milestones celebrate the band reached, once, and jumping past one celebrates only the latest", () => {
  assert.equal(band(9, [10, 50, 100]), null);
  assert.equal(band(10, [10, 50, 100]), 10);
  assert.equal(band(60, [10, 50, 100]), 50);

  const history = [sent("seller.welcome", NOW - 60 * DAY), sent("seller.store_live", NOW - 50 * DAY), sent("seller.first_sale", NOW - 40 * DAY)];
  const facts = sellerFacts({ live: true, products: 9, payoutBank: true, paidOrders: 60, revenue: 400_000, lastPaidOrderAt: NOW - DAY, deliveryBookings: 2 }, { createdAt: NOW - 60 * DAY });
  const plan = planLifecycle(facts, history, NOW);
  assert.ok(ids(plan).includes("seller.orders_50"));
  assert.ok(!ids(plan).includes("seller.orders_10"));
  assert.ok(ids(plan).includes("seller.revenue_100000"));
  assert.equal(plan.send?.rule.journey, "milestone");

  // Revenue milestones are naira amounts: other currencies don't get them.
  const ghana = sellerFacts({ live: true, currency: "GHS", paidOrders: 60, revenue: 400_000 }, { createdAt: NOW - 60 * DAY });
  assert.ok(!ids(planLifecycle(ghana, history, NOW)).some((key) => key.startsWith("seller.revenue_")));
});

test("nudges are spaced out, but milestones and account news aren't held back", () => {
  const facts = sellerFacts({ products: 0 }, { createdAt: NOW - 4 * DAY });
  const recent = [sent("seller.welcome", NOW - 4 * DAY), sent("seller.setup_checklist", NOW - 3 * HOUR)];
  assert.equal(planLifecycle(facts, recent, NOW).send, null, "first_product waits for the gap");
  assert.equal(planLifecycle(facts, recent, NOW + 18 * HOUR).send?.rule.id, "seller.first_product");

  const sold = sellerFacts({ products: 1, paidOrders: 1, revenue: 5000, lastPaidOrderAt: NOW }, { createdAt: NOW - 4 * DAY });
  assert.equal(planLifecycle(sold, recent, NOW).send?.rule.id, "seller.first_sale", "the first sale isn't delayed by a nudge");
});

test("existing accounts are baselined on first sight, so switching this on doesn't flood them", () => {
  const veteran = sellerFacts(
    { live: true, products: 40, payoutBank: true, paidOrders: 300, revenue: 5_000_000, lastPaidOrderAt: NOW - DAY, deliveryBookings: 20, dropshipProducts: 3 },
    { createdAt: NOW - 200 * DAY },
  );
  const plan = planLifecycle(veteran, [], NOW);
  assert.equal(plan.baselined, true);
  assert.equal(plan.send, null);
  const keys = plan.baseline.map((item) => item.key);
  for (const key of ["seller.store_live", "seller.first_sale", "seller.orders_250", "seller.revenue_1000000"]) assert.ok(keys.includes(key), `${key} recorded, not sent`);

  // After the baseline pass, the next milestone still goes.
  const history = [{ key: lc.BASELINE_KEY, rule: lc.BASELINE_KEY, status: "baseline", attempts: 1, at: NOW }, ...plan.baseline.map(({ rule, key }) => ({ key, rule: rule.id, status: "baseline", attempts: 1, at: NOW }))];
  assert.equal(planLifecycle(veteran, history, NOW + HOUR).send, null);
  const grown = { ...veteran, seller: { ...veteran.seller, paidOrders: 500 } };
  assert.equal(planLifecycle(grown, history, NOW + DAY).send?.rule.id, "seller.orders_500");

  // Accounts younger than the cut-off are treated as new.
  assert.equal(planLifecycle(sellerFacts({}, { createdAt: NOW - BASELINE_AFTER + HOUR }), [], NOW).baselined, false);
});

test("failed sends retry an hour later, at most three times in all", () => {
  const facts = sellerFacts();
  const failed = (attempts, ago) => [{ key: "seller.welcome", rule: "seller.welcome", status: "failed", attempts, at: NOW + 10 * 60 * 1000 - ago }];
  const soon = planLifecycle(facts, failed(1, 10 * 60 * 1000), NOW + 10 * 60 * 1000);
  assert.notEqual(soon.send?.rule.id, "seller.welcome", "not straight away");
  const later = planLifecycle(facts, failed(1, 2 * HOUR), NOW + 10 * 60 * 1000);
  assert.equal(later.send?.rule.id, "seller.welcome");
  assert.equal(later.send?.retry, true);
  assert.notEqual(planLifecycle(facts, failed(3, 2 * HOUR), NOW + 10 * 60 * 1000).send?.rule.id, "seller.welcome", "gives up after three");
});

test("win-backs fire per quiet spell, keyed by the day they were last seen", () => {
  const lastSeen = NOW - 15 * DAY;
  const facts = sellerFacts({ live: true, products: 5, payoutBank: true }, { createdAt: NOW - 90 * DAY, lastActiveAt: lastSeen });
  const history = [sent("seller.welcome", NOW - 90 * DAY), sent("seller.store_live", NOW - 80 * DAY)];
  const plan = planLifecycle(facts, history, NOW);
  assert.equal(plan.send?.rule.id, "seller.winback_14");
  assert.equal(plan.send?.key, `seller.winback_14:${lc.lagosDay(lastSeen)}`);

  // They came back, then went quiet again: a new spell, a new key.
  const later = NOW + 60 * DAY;
  const again = planLifecycle({ ...facts, lastActiveAt: later - 15 * DAY }, [...history, sent(plan.send.key, NOW)], later);
  assert.equal(again.send?.rule.id, "seller.winback_14");
  assert.notEqual(again.send?.key, plan.send.key);

  // Active people never get one.
  assert.ok(!ids(planLifecycle({ ...facts, lastActiveAt: NOW - DAY }, history, NOW)).some((key) => key.includes("winback")));
});

test("weekly summaries go out Monday 8am Lagos to Wednesday, once per week, only to engaged accounts", () => {
  const monday = summaryWindow(MONDAY);
  assert.equal(monday.due, true);
  assert.equal(monday.key, "2026-W43");
  assert.equal(monday.end, Date.UTC(2026, 9, 18, 23), "Monday 00:00 Lagos");
  assert.equal(monday.end - monday.start, 7 * DAY);
  assert.equal(summaryWindow(Date.UTC(2026, 9, 19, 6)).due, false, "07:00 Lagos is too early");
  assert.equal(summaryWindow(Date.UTC(2026, 9, 21, 20)).due, true, "Wednesday evening still catches up");
  assert.equal(summaryWindow(Date.UTC(2026, 9, 22, 12)).due, false, "Thursday is too late");
  assert.equal(summaryWindow(Date.UTC(2026, 11, 28, 10)).key, "2026-W53");
  assert.equal(summaryWindow(Date.UTC(2027, 0, 4, 10)).key, "2027-W01");

  const history = [sent("seller.welcome", MONDAY - 90 * DAY), sent("seller.store_live", MONDAY - 80 * DAY)];
  const busy = sellerFacts({ live: true, products: 5, payoutBank: true, week: { orders: 3, revenue: 45_000, visits: 120, toFulfil: 1 } }, { createdAt: MONDAY - 90 * DAY, lastActiveAt: MONDAY - DAY });
  const plan = planLifecycle(busy, history, MONDAY);
  assert.equal(plan.send?.rule.id, "seller.weekly_summary");
  assert.equal(plan.send?.key, "seller.weekly_summary:2026-W43");
  assert.equal(plan.send?.rule.topic, "weekly_summary");
  assert.match(plan.send.rule.render(busy, plan.ctx).subject, /3 orders/);

  const dormant = sellerFacts({ live: true, products: 5, payoutBank: true }, { createdAt: MONDAY - 90 * DAY, lastActiveAt: MONDAY - 50 * DAY });
  assert.ok(!ids(planLifecycle(dormant, history, MONDAY)).some((key) => key.startsWith("seller.weekly_summary")), "no weekly zeros for dormant stores");

  assert.equal(planLifecycle(adminFacts({ createdAt: MONDAY - 90 * DAY }), [sent("admin.welcome", MONDAY - 90 * DAY)], MONDAY).send?.rule.id, "admin.weekly_summary");
});

test("anniversaries land in the week after the sign-up date", () => {
  const joined = Date.UTC(2025, 9, 10, 12);
  assert.equal(anniversary(joined, Date.UTC(2026, 9, 9, 12)), null, "the day before");
  assert.equal(anniversary(joined, Date.UTC(2026, 9, 10, 13)), 1);
  assert.equal(anniversary(joined, Date.UTC(2026, 9, 16, 12)), 1);
  assert.equal(anniversary(joined, Date.UTC(2026, 9, 18, 12)), null, "more than a week late");
  assert.equal(anniversary(joined, Date.UTC(2025, 11, 1)), null, "not a year yet");
  assert.equal(anniversary(joined, Date.UTC(2027, 9, 11, 12)), 2);
});

test("suppliers and delivery partners: verification news, first order, payouts and setup", () => {
  const supplierHistory = [sent("supplier.welcome", NOW - 10 * DAY)];
  const verified = supplierFacts({ verification: "verified", products: 2 }, { createdAt: NOW - 10 * DAY });
  const plan = planLifecycle(verified, supplierHistory, NOW);
  assert.equal(plan.send?.rule.id, "supplier.verified");
  assert.match(plan.send.rule.render(verified, plan.ctx).cta.url, /\/supplier\/products\/new$/, "no live products: point at adding one");

  const rejected = supplierFacts({ verification: "rejected" }, { createdAt: NOW - 10 * DAY });
  assert.equal(planLifecycle(rejected, supplierHistory, NOW).send?.rule.id, "supplier.verification_rejected");

  const ordered = supplierFacts({ verification: "verified", products: 4, liveProducts: 4, dropshipProducts: 4, orders: 1, revenue: 30_000 }, { createdAt: NOW - 10 * DAY });
  const afterVerified = [...supplierHistory, sent("supplier.verified", NOW - 5 * DAY)];
  assert.equal(planLifecycle(ordered, afterVerified, NOW).send?.rule.id, "supplier.first_order");
  assert.equal(planLifecycle(ordered, [...afterVerified, sent("supplier.first_order", NOW - 2 * DAY)], NOW).send?.rule.id, "supplier.payout_setup");

  const partnerHistory = [sent("logistics.welcome", NOW - 2 * DAY)];
  const noCoverage = logisticsFacts({}, { createdAt: NOW - 2 * DAY });
  assert.equal(planLifecycle(noCoverage, partnerHistory, NOW).send?.rule.id, "logistics.coverage");
  const booked = logisticsFacts({ verification: "verified", coverageZones: 3, priced: true, bookings: 1 }, { createdAt: NOW - 20 * DAY });
  const afterFirst = [...partnerHistory, sent("logistics.verified", NOW - 10 * DAY), sent("logistics.first_booking", NOW - 2 * DAY)];
  assert.equal(planLifecycle(booked, afterFirst, NOW).send?.rule.id, "logistics.add_riders");
  const plan2 = planLifecycle(booked, afterFirst, NOW);
  assert.match(plan2.send.rule.render(booked, plan2.ctx).cta.url, /^https:\/\/app\.example\/logistics\/couriers$/);
});

test("nothing goes to accounts without an email address or without their profile", () => {
  assert.equal(planLifecycle(sellerFacts({}, { email: null }), [], NOW).send, null);
  assert.equal(planLifecycle(base("supplier"), [], NOW).send, null);
  assert.equal(planLifecycle(base("admin"), [], NOW).send, null, "admin facts are loaded by the sweep");
});

test("the sender claims each email before sending and honours preferences and the email shell", () => {
  const run = readFileSync(new URL("../src/lib/lifecycle/run.server.ts", import.meta.url), "utf8");
  assert.match(run, /sendPlatformEmail\(\{[\s\S]*kind: rule\.kind,[\s\S]*topic: rule\.topic/, "kind and topic go to the shared sender (unsubscribe + preferences)");
  assert.match(run, /platformEmailAllowed\(userId, rule\.topic\)/, "opted-out topics are settled without sending");
  assert.match(run, /isUniqueViolation\(error\)\) return false/, "a lost race on the unique key means someone else is sending it");
  assert.ok(run.indexOf("lifecycleEmail.create({ data: { userId, key, rule: rule.id, status: \"sending\" }") < run.indexOf("await sendPlatformEmail"), "claim before send");

  const migration = readFileSync(new URL("../docs/migrations/2026-10-16-lifecycle-emails.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleEmail_userId_key_key" ON "LifecycleEmail"\("userId", "key"\)/);
  assert.match(migration, /^-- select cron\.schedule\(/m, "the schedule ships commented out");

  for (const [file, pattern] of [
    ["src/lib/auth/app-user.ts", /if \(!existingUser\) queueLifecycle\(user\.id\)/],
    ["src/app/api/webhooks/paystack/route.ts", /queueLifecycleFor\(\{ retailOrderId: ref \}\)/],
    ["src/lib/store-publishing.ts", /queueLifecycleFor\(\{ storeId: store\.id \}\)/],
    ["src/lib/supplier-orders/service.server.ts", /queueLifecycle\(supplier\.userId\)/],
    ["src/lib/supplier-orders/wholesale.server.ts", /queueLifecycle\(product\.supplier\.userId\)/],
    ["src/app/api/app/logistics/bookings/route.ts", /queueLifecycleFor\(\{ logisticsPartnerId: partner\.id \}\)/],
    ["src/app/api/admin/suppliers/[id]/status/route.ts", /queueLifecycleFor\(\{ supplierId: supplier\.id \}\)/],
    ["src/app/api/admin/logistics-partners/[id]/status/route.ts", /queueLifecycleFor\(\{ logisticsPartnerId: partner\.id \}\)/],
  ]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), pattern, `${file} re-evaluates the account after its event`);
  }
});
