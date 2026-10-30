// Resell (pilot "resell", shared/resell.ts): commission maths (product line after discounts, no delivery, whole
// naira), codes and links, the 7-day attribution window, which links an order is credited to, statuses (paid,
// delivered, void on cancel/refund) and totals; plus the wiring (migration, schema, routes, hooks, words).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rs = await import("../shared/resell.ts");
const access = await import("../src/lib/auth/route-access.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const DAY = 24 * 60 * 60 * 1000;

test("commission percent: 1–50, two decimals, anything else refused", () => {
  assert.equal(rs.cleanResellPct(10), 10);
  assert.equal(rs.cleanResellPct("12.5"), 12.5);
  assert.equal(rs.cleanResellPct("15%"), 15);
  assert.equal(rs.cleanResellPct(7.456), 7.46);
  assert.equal(rs.cleanResellPct(1), 1);
  assert.equal(rs.cleanResellPct(50), 50);
  assert.equal(rs.cleanResellPct(0.5), null);
  assert.equal(rs.cleanResellPct(50.01), null);
  assert.equal(rs.cleanResellPct(""), null);
  assert.equal(rs.cleanResellPct(null), null);
  assert.equal(rs.cleanResellPct("ten"), null);
});

test("commission is on the product's lines after the order's product discount, delivery excluded, whole naira", () => {
  const lines = [
    { productId: "p1", price: 10_000, quantity: 2 }, // 20,000
    { productId: "p1", price: 12_000, quantity: 1 }, // another version: 12,000
    { productId: "p2", price: 8_000, quantity: 1 }, // 8,000
  ];
  // No discount: p1 = 32,000.
  assert.deepEqual(rs.resellLineTotal(lines, "p1", 0), { quantity: 3, lineTotal: 32_000 });
  // ₦4,000 off the order (subtotal 40,000): p1 carries 32/40 of it → 3,200 off.
  assert.deepEqual(rs.resellLineTotal(lines, "p1", 4_000), { quantity: 3, lineTotal: 28_800 });
  assert.equal(rs.resellCommission(28_800, 10), 2_880);
  // Rounded to whole naira, half up.
  assert.equal(rs.resellCommission(1_005, 10), 101);
  assert.equal(rs.resellCommission(1_004, 10), 100);
  assert.equal(rs.resellCommission(333, 12.5), 42);
  // Uneven discount shares round the line total to whole naira.
  assert.deepEqual(rs.resellLineTotal([{ productId: "a", price: 100, quantity: 1 }, { productId: "b", price: 200, quantity: 1 }], "a", 100), { quantity: 1, lineTotal: 67 });
  // A discount bigger than the products never makes it negative.
  assert.deepEqual(rs.resellLineTotal(lines, "p2", 1_000_000), { quantity: 1, lineTotal: 0 });
  // Not in the order: nothing.
  assert.equal(rs.resellSaleFor(lines, "p9", 0, 10), null);
  assert.deepEqual(rs.resellSaleFor(lines, "p2", 0, 15), { quantity: 1, lineTotal: 8_000, commissionPct: 15, commissionAmount: 1_200 });
  // The rate is capped at the maximum even if a bad value slipped through.
  assert.equal(rs.resellCommission(1_000, 80), 500);
});

test("codes: short, readable, cleaned; links go to /rs/<code>, never /r/ (Refer & earn)", () => {
  const code = rs.resellCodeFrom(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253]));
  assert.equal(code.length, rs.RESELL_CODE_LENGTH);
  assert.match(code, /^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
  assert.equal(rs.cleanResellCode(` ${code.toUpperCase()} `), code);
  assert.equal(rs.cleanResellCode("ab"), null);
  assert.equal(rs.cleanResellCode("bad-code!"), null);
  assert.equal(rs.cleanResellCode(42), null);
  assert.equal(rs.resellLinkUrl("https://app.shopinbos.com/", "abc23456"), "https://app.shopinbos.com/rs/abc23456");
  assert.equal(rs.withResellParam("https://kemibags.mybos.store/product/p1", "abc23456"), "https://kemibags.mybos.store/product/p1?rs=abc23456");
  assert.equal(rs.withResellParam("https://app.shopinbos.com/s/kemi/product/p1?ref=whatsapp&rs=old", "abc23456"), "https://app.shopinbos.com/s/kemi/product/p1?ref=whatsapp&rs=abc23456");
});

test("attribution: 7 days, newest first, each code once, at most 10", () => {
  const now = Date.UTC(2026, 11, 14, 12);
  let list = rs.rememberResellCode([], "aaaaaa11", now - 8 * DAY); // already too old
  assert.deepEqual(rs.liveResellCodes(list, now), []);
  list = rs.rememberResellCode(list, "bbbbbb22", now - 2 * DAY);
  list = rs.rememberResellCode(list, "cccccc33", now - DAY);
  list = rs.rememberResellCode(list, "bbbbbb22", now); // opened again: moves to the front
  assert.deepEqual(rs.liveResellCodes(list, now), ["bbbbbb22", "cccccc33"]);
  assert.deepEqual(rs.liveResellCodes(list, now + 6 * DAY + 23 * 60 * 60 * 1000), ["bbbbbb22"]);
  assert.deepEqual(rs.liveResellCodes(list, now + 7 * DAY), []);
  for (let i = 0; i < 15; i++) list = rs.rememberResellCode(list, `code${String(i).padStart(4, "0")}`, now + i);
  assert.equal(list.length, rs.RESELL_CODES_KEPT);
  assert.deepEqual(rs.readRememberedCodes([{ code: "GOODCODE", at: 5 }, { code: "x", at: 5 }, null, { code: "okcode12", at: "no" }]), [{ code: "goodcode", at: 5 }]);
  assert.deepEqual(rs.readRememberedCodes("nonsense"), []);
});

test("an order is credited per product to the newest link for that product; the shop's own links never count", () => {
  const links = [
    { id: "l1", code: "aaaaaa11", productId: "p1", resellerUserId: "u1" },
    { id: "l2", code: "bbbbbb22", productId: "p1", resellerUserId: "u2" },
    { id: "l3", code: "cccccc33", productId: "p2", resellerUserId: "u3" },
    { id: "l4", code: "dddddd44", productId: "p3", resellerUserId: "owner" },
  ];
  const picked = rs.pickResellLinks(["bbbbbb22", "aaaaaa11", "cccccc33", "dddddd44", "zzzzzz99"], links, ["p1", "p3"], "owner");
  assert.deepEqual(picked.map((link) => link.id), ["l2"]);
  assert.deepEqual(rs.pickResellLinks(["aaaaaa11", "cccccc33"], links, ["p1", "p2"]).map((link) => link.id), ["l1", "l3"]);
  assert.deepEqual(rs.pickResellLinks([], links, ["p1"]), []);
});

test("statuses: paid counts, delivered is owed, cancel/refund/return voids unless already paid out", () => {
  assert.equal(rs.statusAfterPaid("awaiting_payment"), "pending");
  assert.equal(rs.statusAfterPaid("void"), "void");
  assert.equal(rs.statusAfterPaid("paid"), "paid");
  assert.equal(rs.statusAfterDelivered("pending"), "approved");
  assert.equal(rs.statusAfterDelivered("awaiting_payment"), "approved"); // pay on delivery: delivered = paid
  assert.equal(rs.statusAfterDelivered("paid"), "paid");
  for (const orderStatus of ["cancelled", "refunded", "returned"]) {
    assert.equal(rs.effectiveResellStatus("pending", orderStatus), "void", orderStatus);
    assert.equal(rs.effectiveResellStatus("approved", orderStatus), "void", orderStatus);
    assert.equal(rs.effectiveResellStatus("paid", orderStatus), "paid", orderStatus);
  }
  assert.equal(rs.effectiveResellStatus("pending", "delivered"), "approved");
  assert.equal(rs.effectiveResellStatus("pending", "shipped"), "pending");
  assert.equal(rs.canVoidResellSale("paid"), false);
  assert.equal(rs.visibleResellSale("awaiting_payment"), false);
  assert.ok(rs.isResellStatus("approved"));
  assert.ok(!rs.isResellStatus("owed"));
});

test("totals: owed = pending + approved, ready = approved, paid apart; void and unpaid orders don't count", () => {
  const totals = rs.resellTotals([
    { status: "pending", lineTotal: 10_000, commissionAmount: 1_000 },
    { status: "approved", lineTotal: 20_000, commissionAmount: 2_000 },
    { status: "paid", lineTotal: 5_000, commissionAmount: 500 },
    { status: "void", lineTotal: 9_000, commissionAmount: 900 },
    { status: "awaiting_payment", lineTotal: 7_000, commissionAmount: 700 },
  ]);
  assert.deepEqual(totals, { owed: 3_000, ready: 2_000, paid: 500, count: 3, value: 35_000 });
});

test("wiring: migration, schema, link route, checkout and order hooks, pages, words", () => {
  const sql = read("docs/migrations/2026-12-14-resell.sql");
  for (const table of ["ResellSetting", "ResellLink", "ResellSale"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /"ResellSale_orderId_linkId_key" ON "ResellSale" \("orderId", "linkId"\)/);
  assert.match(sql, /"ResellSetting_productId_key"/);
  assert.match(sql, /NUMERIC\(5,2\)/);
  assert.doesNotMatch(sql, /DROP |ALTER TABLE "(RetailOrder|StoreProduct|Store)"/, "additive only, existing tables untouched");
  const schema = read("prisma/schema.prisma");
  for (const model of ["ResellSetting", "ResellLink", "ResellSale"]) assert.match(schema, new RegExp(`model ${model} \\{`));

  // The short link is public, only redirects, and isn't Refer & earn's /r/.
  assert.ok(existsSync(new URL("../src/app/rs/[code]/route.ts", import.meta.url)));
  assert.equal(access.rolesForPath("/rs/abc23456"), null);
  assert.deepEqual(access.rolesForPath("/resell"), ["seller", "supplier", "logistics_partner", "admin"]);
  assert.match(read("src/app/r/[code]/route.ts"), /REFERRAL_COOKIE/);

  // Checkout attaches the codes; every paid / delivered / cancelled / refunded path updates the sales.
  assert.match(read("src/hooks/useCampaignAttribution.ts"), /rememberResell\(storeSlug, params\)/);
  assert.match(read("src/app/s/[slug]/checkout/CheckoutClient.tsx"), /resellCodes: preview \? undefined : readResellCodes\(store\.slug\)/);
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /attachResellToOrder\(/);
  assert.match(read("src/lib/commerce/order-paid.server.ts"), /await syncResellSales\(orderId\)/);
  assert.match(read("src/app/actions/payments.ts"), /await syncResellSales\(orderId\)/);
  assert.match(read("src/lib/orders/update-status.ts"), /syncResellSales\(order\.id\)/);
  assert.match(read("src/lib/commerce/order-expiry.server.ts"), /syncResellSales\(order\.id\)/);
  assert.match(read("src/lib/commerce/refunds.server.ts"), /voidResellSales\(orderId\)/);

  // The shop's switch and lists only show while the pilot feature is on.
  assert.match(read("src/app/products/[id]/page.tsx"), /featureOn\(user\.id, RESELL_FEATURE\)/);
  assert.match(read("src/app/home/resell-sales/page.tsx"), /featureOn\(user\.id, RESELL_FEATURE\)\)\) notFound\(\)/);
  assert.match(read("src/app/resell/page.tsx"), /featureOn\(user\.id, RESELL_FEATURE\)\)\) notFound\(\)/);
  assert.match(read("apps/mobile/src/components/ResellCard.tsx"), /useFeature\("resell"\)/);
  assert.match(read("src/lib/resell/service.server.ts"), /checkRateLimitShared\(rateLimitKey\("resell-link"/);

  // Shopinbos never moves the money: no payout or transfer calls in the resell code.
  assert.doesNotMatch(read("src/lib/resell/service.server.ts"), /paystack|korapay|transfer\(/i);

  // Words in every language.
  assert.ok(CATALOGS.resell, "resell namespace registered");
  for (const locale of ["pcm", "yo", "ha", "ig"]) {
    const missing = Object.keys(CATALOGS.resell.en).filter((key) => !(key in CATALOGS.resell[locale]));
    assert.deepEqual(missing, [], locale);
  }
});
