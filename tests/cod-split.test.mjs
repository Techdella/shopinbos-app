// Pay-when-it-arrives orders sent in several parcels: each rider collects only that parcel's share, and the
// shares add up to the order total exactly (shared/cod-split.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = await import("../shared/cod-split.ts");

const items = [
  { productId: "own-1", name: "Tote", price: 12000, quantity: 1 },
  { productId: "sup-a", variant: "Size 41", name: "Slides", price: 9500, quantity: 2 },
  { productId: "sup-b", name: "Scarf", price: 3000, quantity: 1 },
];
const total = 36500; // 34,000 of goods + 2,500 delivery
const partA = [{ storeProductId: "sup-a", variant: "Size 41", quantity: 2 }];
const partB = [{ storeProductId: "sup-b", variant: null, quantity: 1 }];

test("line shares follow line value and add up to the total exactly", () => {
  const shares = s.lineShares(items, total);
  assert.equal(shares.length, 3);
  assert.equal(Math.round(shares.reduce((a, b) => a + b, 0) * 100), total * 100);
  assert.ok(shares[1] > shares[0] && shares[0] > shares[2]);
});

test("the parcels of a mixed order together collect the total once, never more", () => {
  const a = s.supplierPartCollect(items, total, partA);
  const b = s.supplierPartCollect(items, total, partB);
  const own = s.ownPartCollect(items, total, [partA, partB]);
  assert.equal(Math.round((a + b + own) * 100), total * 100);
  for (const share of [a, b, own]) assert.ok(share > 0 && share < total);
});

test("an order with no supplier lines collects the whole total from the seller's parcel", () => {
  assert.equal(s.ownPartCollect(items, total, []), total);
  assert.equal(s.ownPartCollect([], 5000, []), 5000);
});

test("a replacement supplier carrying the same lines collects the same as the one it replaced", () => {
  const replacement = [{ storeProductId: "sup-a", variant: "size 41", quantity: 2 }];
  assert.equal(s.supplierPartCollect(items, total, replacement), s.supplierPartCollect(items, total, partA));
});

test("a size or colour that doesn't match claims nothing; the same product twice is shared once each", () => {
  assert.equal(s.supplierPartCollect(items, total, [{ storeProductId: "sup-a", variant: "Size 42" }]), 0);
  const twice = [
    { productId: "p", variant: "Red", price: 1000, quantity: 1 },
    { productId: "p", variant: "Red", price: 1000, quantity: 1 },
  ];
  const one = s.supplierPartCollect(twice, 2000, [{ storeProductId: "p", variant: "Red" }]);
  assert.equal(one, 1000);
  assert.equal(s.ownPartCollect(twice, 2000, [[{ storeProductId: "p", variant: "Red" }]]), 1000);
});

test("odd kobo never goes missing, and missing prices share by quantity", () => {
  const thirds = [{ productId: "a", price: 1, quantity: 1 }, { productId: "b", price: 1, quantity: 1 }, { productId: "c", price: 1, quantity: 1 }];
  const shares = s.lineShares(thirds, 100);
  assert.equal(Math.round(shares.reduce((x, y) => x + y, 0) * 100), 10000);
  const noPrices = [{ productId: "a", quantity: 3 }, { productId: "b", quantity: 1 }];
  assert.deepEqual(s.lineShares(noPrices, 4000), [3000, 1000]);
});

test("supplier pickups and the seller's own booking use the split, not the whole total", () => {
  assert.match(readFileSync("src/lib/supplier-orders/pickup.server.ts", "utf8"), /supplierPartCollect\(/);
  const route = readFileSync("src/app/api/app/logistics/bookings/route.ts", "utf8");
  assert.match(route, /ownPartCollect\(/);
  assert.doesNotMatch(route, /\? order\.total : undefined/);
});
