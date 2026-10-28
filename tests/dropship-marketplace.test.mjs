// Dropshipper marketplace fixes (spec gap analysis Part C, WP-3): supplier price rises on 7 days' notice and pausing
// listings that would lose money (shared/price-notice.ts), sellers rating suppliers (shared/supplier-ratings.ts),
// one sample per product (shared/samples.ts), "N shops selling" (src/lib/marketplace/find.ts), "Near my customers"
// (shared/near-customers.ts) and the storefront trust lines (shared/storefront-trust.ts). Node strips the types.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const notice = await import("../shared/price-notice.ts");
const ratings = await import("../shared/supplier-ratings.ts");
const samples = await import("../shared/samples.ts");
const near = await import("../shared/near-customers.ts");
const trust = await import("../shared/storefront-trust.ts");
const find = await import("../src/lib/marketplace/find.ts");
const { dropshipTerms, listingProblem } = await import("../shared/dropship-checkout.ts");
const notifications = await import("../shared/notifications.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const NOW = new Date("2026-10-28T09:00:00Z");
const set = (wholesalePrice, extra = {}) => notice.priceSetOf({ priceMode: "same", wholesalePrice, dropshipPrice: null, pricingTiers: [], ...extra });

// ─── Price notice ─────────────────────────────────────────────────────────────

test("a price rise on a listed product waits 7 days; the old price stays live", () => {
  const plan = notice.planPriceChange({ current: set(6000), next: set(7000), listings: 3, now: NOW });
  assert.equal(plan.kind, "notice");
  assert.equal(plan.effectiveAt.toISOString(), "2026-11-04T09:00:00.000Z");
  assert.equal(plan.pending.wholesalePrice, 7000);
  assert.equal(notice.PRICE_NOTICE_DAYS, 7);
});

test("cuts, and changes to a product nobody lists, apply at once", () => {
  assert.deepEqual(notice.planPriceChange({ current: set(6000), next: set(5500), listings: 3, now: NOW }), { kind: "now", live: set(5500) });
  assert.equal(notice.planPriceChange({ current: set(6000), next: set(9000), listings: 0, now: NOW }).kind, "now");
  assert.equal(notice.planPriceChange({ current: set(6000), next: set(6000), listings: 3, now: NOW }).kind, "none");
});

test("editing back to the live price cancels a waiting rise; the same rise again keeps its date", () => {
  const waiting = set(7000);
  assert.deepEqual(notice.planPriceChange({ current: set(6000), next: set(6000), pending: waiting, listings: 3, now: NOW }), { kind: "now", live: set(6000) });
  assert.equal(notice.planPriceChange({ current: set(6000), next: set(7000), pending: waiting, listings: 3, now: NOW }).kind, "none");
  assert.equal(notice.planPriceChange({ current: set(6000), next: set(8000), pending: waiting, listings: 3, now: NOW }).kind, "notice", "a bigger rise starts a fresh 7 days");
});

test("a rise is any shop paying more: the dropship price, the base or a quantity break", () => {
  assert.equal(notice.priceRises(set(6000), set(6000, { priceMode: "per_channel", dropshipPrice: 6500 })), true);
  assert.equal(notice.priceRises(set(6000, { priceMode: "per_channel", dropshipPrice: 6500 }), set(6000, { priceMode: "per_channel", dropshipPrice: 6200 })), false);
  const tiers = (price) => set(6000, { priceMode: "per_channel", pricingTiers: [{ minQty: 10, price }] });
  assert.equal(notice.priceRises(tiers(5400), tiers(5800)), true);
  assert.equal(notice.priceRises(tiers(5400), tiers(5000)), false);
});

test("pending prices read back safely and fall due on the day", () => {
  assert.equal(notice.readPendingPrice(null), null);
  assert.equal(notice.readPendingPrice({ wholesalePrice: 0 }), null);
  assert.deepEqual(notice.readPendingPrice({ priceMode: "per_channel", wholesalePrice: 7000, dropshipPrice: 7500, pricingTiers: [] }), set(7000, { priceMode: "per_channel", dropshipPrice: 7500 }));
  assert.equal(notice.priceDue("2026-11-04T09:00:00Z", new Date("2026-11-04T08:59:00Z")), false);
  assert.equal(notice.priceDue("2026-11-04T09:00:00Z", new Date("2026-11-04T09:00:00Z")), true);
  assert.equal(notice.priceDue(null, NOW), false);
});

const termsAt = (wholesalePrice, extra = {}) => dropshipTerms({ product: { priceMode: "same", wholesalePrice, suggestedRetailPrice: 13000, ...extra }, supplier: {} });

test("after a rise, a listing that would lose money is paused with the one-tap fix that doesn't", () => {
  const before = termsAt(6000);
  assert.equal(notice.listingVerdict(before, { retailPrice: 8000, payer: "customer" }).loses, false);
  const after = termsAt(9000);
  const verdict = notice.listingVerdict(after, { retailPrice: 8000, payer: "customer" });
  assert.equal(verdict.loses, true);
  assert.equal(verdict.fixPrice, 9000);
  assert.equal(listingProblem(after, { retailPrice: verdict.fixPrice, payer: "customer" }), null, "the fix price sells without a loss");
  // Free delivery: the seller covers the dearest parcel too, so the fix price covers it.
  const free = notice.listingVerdict(after, { retailPrice: 12000, payer: "seller" });
  assert.equal(free.loses, true);
  assert.equal(free.fixPrice, 9000 + after.dearestDelivery);
  assert.equal(listingProblem(after, { retailPrice: free.fixPrice, payer: "seller" }), null);
  assert.equal(listingProblem(after, { retailPrice: free.fixPrice - 100, payer: "seller" }) !== null, true, "and it's the lowest nice price that does");
});

test("the fix rounds up to nice prices and respects the supplier's lowest price", () => {
  const terms = termsAt(9050, { minRetailPrice: 9800 });
  assert.equal(notice.breakEvenPrice(terms, { payer: "customer" }), 9800);
  assert.equal(notice.breakEvenPrice(termsAt(9050), { payer: "customer" }), 9100);
  assert.equal(notice.breakEvenPrice(termsAt(60_100), { payer: "customer" }), 60_500);
});

test("price notice is wired: supplier routes, daily job, schedule, events and migration", () => {
  for (const path of ["src/app/api/supplier/products/[id]/route.ts", "src/app/api/mobile/supplier/products/[id]/route.ts", "src/app/actions/supplier.ts"]) {
    const src = read(path);
    assert.match(src, /supplierPriceEdit\(/, path);
    assert.match(src, /notifyPriceNotice\(/, path);
  }
  assert.match(read("src/lib/launch-check/pure.ts"), /\{ path: "\/api\/cron\/price-notices", label: [^}]+qstash: "price-notices" \}/);
  assert.match(read("scripts/qstash-schedules.mjs"), /\{ id: "price-notices", path: "\/api\/cron\/price-notices", cron: "13 5 \* \* \*" \}/);
  const cron = read("src/app/api/cron/price-notices/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/);
  assert.match(cron, /applyDuePriceChanges\(new Date\(\)\)/);
  const server = read("src/lib/marketplace/price-notice.server.ts");
  // Each due price is claimed once, so two runs never apply it twice; losing listings go to draft, never sold.
  assert.match(server, /updateMany\(\{\s*where: \{ id: row\.id, pendingPriceAt: row\.pendingPriceAt \}/);
  assert.match(server, /status: "draft", pausedReason: PRICE_LOSS/);
  assert.ok(notifications.eventInfo("price_notice.scheduled"));
  assert.ok(notifications.eventInfo("listing.paused_price"));
  assert.deepEqual(notifications.appRouteFor("/marketplace/mine?fix=sp1"), { pathname: "/find/mine" });
  const migration = read("docs/migrations/2026-12-07-dropship-marketplace.sql");
  assert.match(migration, /ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "pendingPrice" JSONB;/);
  assert.match(migration, /ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "pausedReason" TEXT;/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleOrder_sampleKey_key"/);
  assert.doesNotMatch(migration, /DROP |ALTER COLUMN/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model SupplierProduct \{[\s\S]*pendingPriceAt\s+DateTime\?[\s\S]*@@index\(\[pendingPriceAt\]\)/);
  assert.match(schema, /model WholesaleOrder \{[\s\S]*sampleKey\s+String\?\s+@unique/);
});

// ─── Ratings ──────────────────────────────────────────────────────────────────

test("only the shop that placed it can rate, once, after it arrived", () => {
  const ok = { kind: "wholesale_order", status: "delivered", isBuyer: true, alreadyRated: false };
  assert.equal(ratings.ratingProblem(ok), null);
  assert.equal(ratings.ratingProblem({ ...ok, kind: "dropship_order" }), null);
  assert.match(ratings.ratingProblem({ ...ok, status: "shipped" }), /once the order has arrived/);
  assert.match(ratings.ratingProblem({ ...ok, isBuyer: false }), /Only the shop/);
  assert.match(ratings.ratingProblem({ ...ok, alreadyRated: true }), /already rated/);
  assert.equal(ratings.isRatingKind("delivery_booking"), false);
});

test("stars are 1–5 and the line is short; the average keeps one decimal", () => {
  assert.deepEqual(ratings.cleanRating({ rating: 5, text: "  Fast   and well packed " }), { ok: true, rating: 5, text: "Fast and well packed" });
  assert.equal(ratings.cleanRating({ rating: 0 }).ok, false);
  assert.equal(ratings.cleanRating({ rating: 4.5 }).ok, false);
  assert.equal(ratings.cleanRating({ rating: 3, text: "x".repeat(400) }).text.length, ratings.RATING_TEXT_MAX);
  assert.deepEqual(ratings.ratingSummary([5, 4, 4]), { rating: 4.3, count: 3 });
  assert.deepEqual(ratings.ratingSummary([]), { rating: 0, count: 0 });
  assert.equal(ratings.ratingWords(4.25, 1), "★ 4.3 · 1 rating");
  assert.equal(ratings.ratingWords(0, 0), null);
  const server = read("src/lib/marketplace/supplier-ratings.server.ts");
  assert.match(server, /targetRole: "supplier"/);
  assert.match(server, /refreshSupplierRating\(order\.supplierId\)/);
});

// ─── Samples ──────────────────────────────────────────────────────────────────

test("one sample per seller per product; a declined one can be ordered again", () => {
  const base = { sampleAvailable: true, stock: 5, previous: [] };
  assert.equal(samples.sampleProblem(base), null);
  assert.match(samples.sampleProblem({ ...base, sampleAvailable: false }), /doesn't send samples/);
  assert.match(samples.sampleProblem({ ...base, previous: [{ status: "pending" }] }), /already ordered a sample/);
  assert.match(samples.sampleProblem({ ...base, previous: [{ status: "delivered" }] }), /already ordered a sample/);
  assert.equal(samples.sampleProblem({ ...base, previous: [{ status: "cancelled" }, { status: "refunded" }] }), null);
  assert.match(samples.sampleProblem({ ...base, stock: 0 }), /out of stock/);
  assert.match(samples.sampleProblem({ ...base, ownProduct: true }), /your own product/);
  assert.equal(samples.sampleKey("u1", "sp1"), "u1:sp1");
  assert.equal(samples.SAMPLE_QUANTITY, 1);
});

test("the sample offer shows the dropship price and the live sample", () => {
  assert.equal(samples.sampleOfferFor({ sampleAvailable: false, price: 6000, previous: [] }), null);
  assert.deepEqual(samples.sampleOfferFor({ sampleAvailable: true, price: 6000, previous: [{ id: "w0", status: "cancelled" }] }), { price: 6000, ordered: null });
  assert.deepEqual(samples.sampleOfferFor({ sampleAvailable: true, price: 6000, previous: [{ id: "w1", status: "confirmed" }] }), { price: 6000, ordered: { id: "w1", status: "confirmed" } });
  const wholesale = read("src/lib/supplier-orders/wholesale.server.ts");
  assert.match(wholesale, /if \(sample\) return placeSampleOrder\(input, product\);/);
  assert.match(wholesale, /unitPrice = dropshipUnitPrice\(product\)/);
  assert.match(wholesale, /sample: true,\n\s+sampleKey: key,/);
});

// ─── Shops selling ────────────────────────────────────────────────────────────

test("N shops selling counts each live shop once and hides products nobody sells", () => {
  const counts = find.shopsSellingCounts([
    { supplierProductId: "a", storeId: "s1" },
    { supplierProductId: "a", storeId: "s1" },
    { supplierProductId: "a", storeId: "s2" },
    { supplierProductId: "b", storeId: "s3" },
    { supplierProductId: null, storeId: "s4" },
  ]);
  assert.deepEqual([...counts.entries()].sort(), [["a", 2], ["b", 1]]);
  assert.deepEqual(find.withShopsSelling([{ id: "a" }, { id: "c" }], counts), [{ id: "a", shopsSelling: 2 }, { id: "c", shopsSelling: 0 }]);
  assert.match(read("src/lib/marketplace/find-extras.server.ts"), /groupBy\(\{ by: \["supplierProductId", "storeId"\], where: \{ supplierProductId: \{ in: ids \}, status: "published" \} \}\)/);
});

// ─── Near my customers ────────────────────────────────────────────────────────

test("where the customers are: the busiest delivery states and areas, else the shop's state", () => {
  const places = near.customerPlacesFrom(
    [{ state: "Lagos", city: "Ikeja" }, { state: "Lagos", city: "Ikeja" }, { state: "Ogun", city: "Abeokuta" }, { city: "Port Harcourt" }, { nothing: true }, null],
    "Oyo",
  );
  assert.equal(places.basis, "orders");
  assert.deepEqual(places.states.slice(0, 2), ["Lagos", "Ogun"]);
  assert.equal(places.areas[0].area, "Ikeja");
  assert.deepEqual(near.customerPlacesFrom([], "Oyo"), { states: ["Oyo"], areas: [], basis: "store" });
  assert.deepEqual(near.customerPlacesFrom([], null), { states: [], areas: [], basis: "none" });
});

test("a supplier is near my customers in the same state or next-door states it delivers to", () => {
  const customers = near.customerPlacesFrom([{ state: "Lagos", city: "Ikeja" }], null);
  assert.equal(near.nearestCustomerZone({ origin: { state: "Lagos", area: "Ikeja" } }, customers), "same_city");
  assert.equal(near.nearestCustomerZone({ origin: { state: "Lagos", area: "Lekki" } }, customers), "same_state");
  assert.equal(near.nearMyCustomers({ origin: { state: "Oyo", area: "Ibadan" } }, customers), true, "South-West: next door");
  assert.equal(near.nearMyCustomers({ origin: { state: "Kano", area: "Kano" } }, customers), false);
  // Its own rate card leaves the next-door zone empty: it doesn't deliver there.
  const ownCard = { rateSource: "own", zoneRates: { same_city: { small: 1500 }, same_state: { small: 2500 }, nearby: {}, rest: {} } };
  assert.equal(near.nearMyCustomers({ origin: { state: "Oyo", area: "Ibadan" }, ...ownCard }, customers), false);
  assert.equal(near.nearMyCustomers({ origin: { state: null, area: null } }, customers), false);
  assert.equal(near.nearMyCustomers({ origin: { state: "Lagos", area: null } }, { states: [], areas: [], basis: "none" }), false);
});

test("the Find filter is on the web and the phone", () => {
  assert.match(read("src/app/marketplace/_components/ProductGrid.tsx"), /filters\.near !== "customers" \|\| product\.supplier\.nearCustomers === true/);
  assert.match(read("apps/mobile/src/lib/find-pure.ts"), /filters\.near !== "customers" \|\| product\.supplier\.nearCustomers === true/);
});

// ─── Storefront trust lines ───────────────────────────────────────────────────

test("trust lines show only what's true and never name the supplier", () => {
  const all = trust.storefrontTrust({ dropship: true, supplierVerificationStatus: "verified", partnerDelivery: true, onlinePayments: true });
  assert.deepEqual(trust.trustLines(all).map((line) => line.title), ["Verified supplier", "Verified delivery", "Paid-at-checkout protection"]);
  const own = trust.storefrontTrust({ dropship: false, supplierVerificationStatus: "verified", partnerDelivery: false, onlinePayments: false });
  assert.equal(trust.hasTrustLines(own), false);
  assert.deepEqual(trust.trustLines(trust.storefrontTrust({ dropship: true, supplierVerificationStatus: "pending", partnerDelivery: false, onlinePayments: true })).map((line) => line.key), ["paidAtCheckout"]);
  const page = read("src/lib/storefront/product-page.server.ts");
  assert.match(page, /storefrontTrust\(/);
  assert.doesNotMatch(page, /displayName|businessName/, "the supplier's name never reaches the product page");
});
