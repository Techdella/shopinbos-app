// The Expo app (apps/mobile): pure helpers for Find products and the inbox, and the web paths it opens as
// its own screens (Node strips the types natively).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const find = await import("../apps/mobile/src/lib/find-pure.ts");
const inbox = await import("../apps/mobile/src/lib/inbox-pure.ts");
const webFind = await import("../src/lib/marketplace/find.ts").catch(() => null);

test("Find products money matches the web's (cost, sell, you keep, stepper)", (t) => {
  if (!webFind) return t.skip("src/lib/marketplace/find.ts isn't there");
  for (const [price, cost] of [[13000, 6000], [2000, 900], [2500, 1000], [500000, 120000], [0, 100], [5000, 6000]]) {
    assert.deepEqual(find.saleBreakdown(price, cost), webFind.saleBreakdown(price, cost), `saleBreakdown(${price}, ${cost})`);
    assert.equal(find.clampSellingPrice(price, cost), webFind.clampSellingPrice(price, cost), `clampSellingPrice(${price}, ${cost})`);
    assert.equal(find.priceStep(price), webFind.priceStep(price));
  }
  const tiers = [{ minQty: 10, maxQty: 49, price: 5000 }, { minQty: 50, price: 4200 }];
  for (const quantity of [1, 10, 49, 50, 500]) assert.equal(find.tierPrice(tiers, quantity, 6000), webFind.tierPrice(tiers, quantity, 6000));
  for (const name of ["Electronics & Gadgets", "Women's Fashion", "Ankara fabrics", "", "Pets and supplies"]) assert.equal(find.shortCategory(name), webFind.shortCategory(name));
  for (const time of ["24 hours", "Same day in Lagos", "", null]) assert.equal(find.shipsLabel(time), webFind.shipsLabel(time));
  const raw = [{ minQty: 50, price: 4200 }, { minQty: 0, price: 1 }, { minQty: 10, maxQty: 49, price: 5000 }];
  assert.deepEqual(find.parsePricingTiers(raw), webFind.parsePricingTiers(raw));
});

test("each sale: the seller keeps price minus cost minus the card fee", () => {
  assert.deepEqual(find.saleBreakdown(13000, 6000), { shopperPays: 13000, supplierGets: 6000, fee: 295, keep: 6705, keepPct: 52 });
  assert.ok(find.saleBreakdown(5000, 6000).keep < 0);
  assert.equal(find.paymentFee(Number.NaN), 0);
  assert.deepEqual(find.sortCategories(["Toys", "Beauty", "Shoes", "Beauty", "Art"]), ["Shoes", "Beauty", "Art", "Toys"]);
});

const items = [
  { channel: "whatsapp", status: "open", unread: 2, name: "Ada", preview: "Do you have size 40?", sub: "+2348012345678" },
  { channel: "instagram", status: "snoozed", unread: 0, name: "tolu.styles", preview: "Thanks!", sub: null },
  { channel: "whatsapp", status: "closed", unread: 1, name: "Bayo", preview: "Delivered, thank you", sub: null },
  { channel: "partner", status: "open", unread: 0, name: "Aba Leatherworks", preview: "Restocked", sub: "Supplier" },
];

test("inbox views: open, unread (not done), snoozed, done; channel and search filters", () => {
  const names = (list) => list.map((item) => item.name);
  assert.deepEqual(names(inbox.filterInbox(items, { view: "open", channel: "" })), ["Ada", "Aba Leatherworks"]);
  assert.deepEqual(names(inbox.filterInbox(items, { view: "unread", channel: "" })), ["Ada"]);
  assert.deepEqual(names(inbox.filterInbox(items, { view: "snoozed", channel: "" })), ["tolu.styles"]);
  assert.deepEqual(names(inbox.filterInbox(items, { view: "closed", channel: "" })), ["Bayo"]);
  assert.deepEqual(names(inbox.filterInbox(items, { view: "open", channel: "partner" })), ["Aba Leatherworks"]);
  assert.deepEqual(names(inbox.filterInbox(items, { view: "open", channel: "", q: "size 40" })), ["Ada"]);
  assert.deepEqual(names(inbox.filterInbox(items, { view: "open", channel: "", q: "2348012" })), ["Ada"]);
});

test("inbox channel chips list the channels in use, busiest first, with the web's labels", () => {
  assert.deepEqual(inbox.channelsInUse(items), ["whatsapp", "instagram", "partner"]);
  assert.equal(inbox.channelLabel("livechat"), "Live chat");
  assert.equal(inbox.channelLabel("form"), "Contact form");
  assert.equal(inbox.channelLabel("something-new"), "Message");
  const webMeta = readFileSync(new URL("../src/lib/inbox/meta.ts", import.meta.url), "utf8");
  for (const key of ["email", "whatsapp", "sms", "messenger", "instagram", "telegram", "tiktok", "voice", "livechat", "form"]) {
    assert.match(webMeta, new RegExp(`${key}: \\{ key: "${key}", label: "${inbox.CHANNEL_LABELS[key]}"`), `${key} label matches the web`);
  }
});

test("inbox times are Lagos clock times today, weekdays this week, dates before", () => {
  const now = new Date("2026-10-12T15:00:00Z"); // Monday, 16:00 in Lagos
  assert.equal(inbox.shortTime("2026-10-12T08:05:00Z", now), "09:05");
  assert.equal(inbox.shortTime("2026-10-10T08:05:00Z", now), "Sat");
  assert.equal(inbox.shortTime("2026-09-30T08:05:00Z", now), "30 Sep");
  assert.equal(inbox.shortTime("not a date", now), "");
});

test("every web path the app opens as its own screen has a screen", () => {
  const web = readFileSync(new URL("../apps/mobile/src/lib/web.ts", import.meta.url), "utf8");
  const map = web.slice(web.indexOf("const APP_SCREENS"), web.indexOf("};", web.indexOf("const APP_SCREENS")));
  const targets = [...map.matchAll(/:\s*"(\/[^"]*)"/g)].map((match) => match[1]);
  assert.ok(targets.length >= 10);
  const tabs = new Set(["/home", "/orders", "/products", "/chats", "/more"]);
  for (const target of targets) {
    if (tabs.has(target)) continue;
    const base = new URL(`../apps/mobile/src/app${target}`, import.meta.url).pathname;
    assert.ok(existsSync(`${base}.tsx`) || existsSync(`${base}/index.tsx`), `${target} has a screen`);
  }
});
