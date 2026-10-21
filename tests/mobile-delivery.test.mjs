// The phone's seller screens of the 2026 "Seller app" prototype: Orders groups, the order timeline, the payout line on
// Home and the Delivery hub's words (apps/mobile/src/lib/delivery-pure.ts), and the hub's screens.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pure = await import("../apps/mobile/src/lib/delivery-pure.ts");
const { CATALOGS, NAMESPACES } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const say = { dynamic: (key, fallback, vars) => (fallback ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? "")) };

test("Orders: Needs action, On the way, Done (a partner problem needs the seller)", () => {
  assert.equal(pure.orderGroup("awaiting_payment"), "need");
  assert.equal(pure.orderGroup("paid"), "need");
  assert.equal(pure.orderGroup("shipped"), "way");
  assert.equal(pure.orderGroup("shipped", true), "need");
  assert.equal(pure.orderGroup("delivered"), "done");
  assert.equal(pure.orderGroup("cancelled"), "done");
});

test("timeline: done steps, then the current one, then the rest", () => {
  const steps = pure.timelineStates([{ done: true }, { done: true }, { done: false }, { done: false }]);
  assert.deepEqual(steps.map((step) => step.state), ["done", "done", "now", "todo"]);
  assert.deepEqual(pure.ownTimeline({ status: "shipped", createdAt: "2026-10-12T08:00:00Z" }).map((step) => step.done), [true, true, true, false]);
  assert.equal(pure.timelineWordKey("delivered", "pickup_point", "pickup_point"), "timeline.collected");
  assert.equal(pure.timelineWordKey("ready", "self_pickup", null), "timeline.readyForPickup");
});

test("Home: money on its way to the bank from settlements not paid out yet", () => {
  assert.equal(pure.upcomingPayout([]), null);
  assert.equal(pure.upcomingPayout([{ status: "success", amountKobo: 500000, date: "2026-10-16" }]), null);
  assert.deepEqual(pure.upcomingPayout([{ status: "pending", amountKobo: 15240000, date: "2026-10-23" }, { status: "processing", amountKobo: 100, date: "2026-10-22" }]), { amount: 152401, date: "2026-10-22" });
});

test("Delivery words: where I sell, routes, the public price a private rate replaces, timeframes", () => {
  assert.equal(pure.whereWords({ sellArea: "nationwide", sellStates: [] }, say), "All of Nigeria");
  assert.equal(pure.whereWords({ sellArea: "selected", sellStates: ["Lagos", "FCT"] }, say), "Lagos, Abuja (FCT)");
  assert.equal(pure.routeWords({ from: "Lagos: Yaba", to: "FCT" }), "Yaba, Lagos → Abuja (FCT)");
  const row = { from: "Lagos", to: "FCT", service: "doorstep", sizeBand: "small" };
  assert.equal(pure.publicPriceFor(row, [{ ...row, price: 4000 }]), 4000);
  assert.equal(pure.publicPriceFor({ ...row, sizeBand: "medium" }, [{ ...row, price: 4000 }]), null);
  assert.equal(pure.timeframeWords("1–4 days", say), "1–4 days");
  assert.equal(pure.timeframeWords("Same day", say), "Same day");
  assert.equal(pure.whatsappNumber("0803 555 0141"), "2348035550141");
});

test("the Delivery hub's screens exist, use m_delivery, and the old delivery prices stay reachable", () => {
  for (const file of ["index", "where", "find", "zones", "partner/[slug]", "connection/[id]", "rate/[id]"]) assert.ok(existsSync(new URL(`../apps/mobile/src/app/delivery/${file}.tsx`, import.meta.url)), file);
  const hub = read("apps/mobile/src/app/delivery/index.tsx");
  assert.match(hub, /router\.push\("\/delivery\/zones"\)/);
  assert.match(hub, /data\?\.role !== "supplier"/, "suppliers don't see the shop's checkout options");
  const connection = read("apps/mobile/src/app/delivery/connection/[id].tsx");
  assert.match(connection, /acceptPodDisclaimer: true/);
  assert.match(connection, /t\("pod\.disclaimer"\)/, "the legal pay-on-delivery note from the delivery catalog");
  assert.ok(NAMESPACES.includes("m_delivery"));
  for (const lang of ["pcm", "yo", "ha", "ig"]) for (const key of Object.keys(CATALOGS.m_delivery.en)) assert.ok(CATALOGS.m_delivery[lang][key], `m_delivery ${lang} ${key}`);
});
