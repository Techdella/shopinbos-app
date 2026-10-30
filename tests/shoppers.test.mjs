import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Phone-keyed customer records for the customer app (shared/shoppers.ts, src/lib/shoppers.server.ts).
const shoppers = await import("../shared/shoppers.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("phone numbers become E.164, Nigeria by default, the store's country from its currency", () => {
  assert.equal(shoppers.shopperPhone("0803 412 7790"), "+2348034127790");
  assert.equal(shoppers.shopperPhone("+234 803-412-7790"), "+2348034127790");
  assert.equal(shoppers.shopperPhone("2348034127790"), "+2348034127790");
  assert.equal(shoppers.shopperPhone("0244 123 456", "GHS"), "+233244123456");
  assert.equal(shoppers.shopperPhone("0712 345 678", "KES"), "+254712345678");
  assert.equal(shoppers.shopperPhone("12345"), null);
  assert.equal(shoppers.shopperPhone(""), null);
  assert.equal(shoppers.shopperPhone(null), null);
});

test("the area comes from a known place in the address, else the city the customer typed", () => {
  assert.deepEqual(shoppers.shopperPlace({ street: "12 Admiralty Way, Lekki Phase 1", city: "Lagos", state: "Lagos" }), { area: "Lekki Phase 1", state: "Lagos" });
  assert.deepEqual(shoppers.shopperPlace({ street: "4 Allen Avenue", city: "Ikeja" }), { area: "Ikeja", state: null });
  assert.deepEqual(shoppers.shopperPlace({ street: "5 Market Road", city: "  Nsukka  " }), { area: "Nsukka", state: null });
  assert.deepEqual(shoppers.shopperPlace({}), { area: null, state: null });
  assert.deepEqual(shoppers.shopperPlace(null), { area: null, state: null });
  assert.deepEqual(shoppers.shopperPlace(["Lagos"]), { area: null, state: null });
});

test("orders without a usable phone are skipped; facts are cleaned", () => {
  assert.equal(shoppers.shopperFactsFromOrder({ buyerPhone: null, buyerName: "Ada" }), null);
  assert.equal(shoppers.shopperFactsFromOrder({ buyerPhone: "  ", buyerName: "Ada" }), null);
  const at = new Date("2026-10-01T10:00:00Z");
  const facts = shoppers.shopperFactsFromOrder({ buyerPhone: "08034127790", buyerName: "  Ada   Obi ", buyerEmail: "ADA@Mail.com", deliveryAddress: { street: "1 Road", city: "Yaba" }, total: "15000", createdAt: at });
  assert.deepEqual(facts, { phone: "+2348034127790", name: "Ada Obi", email: "ada@mail.com", area: "Yaba", state: null, at, total: 15000 });
  // Recorded sales store "" for no email; a bad email or total is dropped.
  const blank = shoppers.shopperFactsFromOrder({ buyerPhone: "08034127790", buyerName: "", buyerEmail: "not-an-email", total: "x", createdAt: at });
  assert.equal(blank.name, null);
  assert.equal(blank.email, null);
  assert.equal(blank.total, 0);
});

test("merging: the newest non-empty name wins, an email is kept once given", () => {
  const day = (n) => new Date(Date.UTC(2026, 9, n));
  const facts = (n, extra) => ({ phone: "+2348034127790", name: null, email: null, area: null, state: null, at: day(n), total: 1000, ...extra });
  let details = shoppers.mergeShopper(null, facts(1, { name: "Ada", email: "ada@mail.com", area: "Yaba" }));
  assert.deepEqual(details, { name: "Ada", email: "ada@mail.com", area: "Yaba", state: null, firstSeenAt: day(1), lastSeenAt: day(1) });
  details = shoppers.mergeShopper(details, facts(3, { name: "Ada Obi", area: "Lekki" }));
  assert.equal(details.name, "Ada Obi");
  assert.equal(details.email, "ada@mail.com"); // no email on this order: kept
  assert.equal(details.area, "Lekki");
  assert.equal(details.lastSeenAt.getTime(), day(3).getTime());
  details = shoppers.mergeShopper(details, facts(4, { name: "" }));
  assert.equal(details.name, "Ada Obi"); // an empty name never wipes it
  // An older order arriving late (backfill) only fills gaps.
  details = shoppers.mergeShopper(details, facts(0, { name: "Adaeze", state: "Lagos" }));
  assert.equal(details.name, "Ada Obi");
  assert.equal(details.state, "Lagos");
  assert.equal(details.firstSeenAt.getTime(), day(0).getTime());
  assert.equal(details.lastSeenAt.getTime(), day(4).getTime());
  // A newer email replaces the old one.
  assert.equal(shoppers.mergeShopper(details, facts(5, { email: "new@mail.com" })).email, "new@mail.com");
});

test("folding orders gives the same result in any order", () => {
  const list = [
    { phone: "+2348034127790", name: "B", email: null, area: "Ikeja", state: null, at: new Date("2026-10-02"), total: 1 },
    { phone: "+2348034127790", name: "A", email: "a@x.co", area: null, state: "Lagos", at: new Date("2026-10-01"), total: 1 },
  ];
  assert.deepEqual(shoppers.shopperFromOrders(list), shoppers.shopperFromOrders([...list].reverse()));
  assert.equal(shoppers.shopperFromOrders(list).name, "B");
  assert.equal(shoppers.shopperFromOrders([]), null);
});

test("every place a seller's order is created records the shopper, without failing the order", () => {
  const server = read("src/lib/shoppers.server.ts");
  assert.match(server, /catch \(error\) \{\n\s+console\.error\(`\[shoppers\]/);
  assert.match(server, /lastOrderId: \{ not: order\.id \}/);
  assert.match(read("src/lib/orders/record-sale.ts"), /await recordShopperOrder\(order\)/);
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /await recordShopperOrder\(order\)/);
  // The migration is additive and the backfill only writes with --apply.
  const sql = read("docs/migrations/2026-12-13-shoppers.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "Shopper"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "ShopperStore_shopperId_storeId_key"/);
  assert.doesNotMatch(sql, /DROP|ALTER TABLE "RetailOrder"/);
  assert.match(read("scripts/backfill-shoppers.mjs"), /const APPLY = process\.argv\.includes\("--apply"\)/);
});

test("sellers never see shopper records across stores", () => {
  for (const path of ["src/app/home/customers/page.tsx"]) assert.doesNotMatch(read(path), /shopperStore|db\.shopper\b/);
});
