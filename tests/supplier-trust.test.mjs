// Dropship safety: suppliers near the seller show first (far ones marked), every supplier shows its verification and a risk
// score with the reasons, and listing a supplier's products needs the call, the stock check and both sides'
// Dropship agreement, on every way of adding a product.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const trust = await import("../shared/supplier-trust.ts");
const owed = await import("../shared/money-owed.ts");

test("nearby: areas we know are measured; Ikeja and Yaba are near, Lagos and Abuja are not", () => {
  const ikeja = { city: "Lagos", address: "12 Allen Avenue, Ikeja" };
  const near = trust.nearness(ikeja, { city: "Yaba, Lagos", address: null });
  assert.equal(near.near, true);
  assert.ok(near.km > 5 && near.km < 15, `Ikeja to Yaba is about 10 km, got ${near.km}`);
  assert.equal(near.area, "Yaba");
  const far = trust.nearness(ikeja, { city: "Abuja", address: "Wuse 2" });
  assert.equal(far.near, false);
  assert.ok(far.km > 400);
  assert.equal(trust.nearness({ city: "Lagos" }, { city: "Ibadan" }).near, false, "Ibadan is over 50 km from Lagos");
});

test("nearby: unknown places fall back to the same city by name; no city means nothing is near", () => {
  assert.equal(trust.nearness({ city: "Warri" }, { city: "warri " }).near, true);
  assert.equal(trust.nearness({ city: "Warri" }, { city: "Sapele" }).near, false);
  assert.equal(trust.nearness({ city: "" }, { city: "Lagos" }).near, false);
  assert.equal(trust.sellerHasPlace({ city: "  " }), false);
  assert.equal(trust.sellerHasPlace({ city: "Ikeja" }), true);
});

test("risk: a new unverified supplier with no orders is high risk, and says why", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const risk = trust.supplierRisk({ verificationStatus: "unverified", createdAt: "2026-11-01T00:00:00Z", ordersSent: 0, rating: 0, ratingCount: 0, missedOrders: 0, notSent: 0, overdueKobo: 0, hasReturnPolicy: false, walletActive: false, now });
  assert.equal(risk.level, "high");
  assert.equal(risk.reasons[0], "not_verified", "the biggest reason first");
  assert.deepEqual([...risk.reasons].sort(), ["new_account", "no_orders_yet", "no_return_policy", "no_wallet", "not_verified"]);
  assert.ok(risk.score >= 55 && risk.score <= 100);
});

test("risk: an established verified supplier is low risk; owing money or not sending orders raises it", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const base = { verificationStatus: "verified", createdAt: "2026-01-01T00:00:00Z", ordersSent: 40, rating: 4.6, ratingCount: 20, missedOrders: 0, notSent: 0, overdueKobo: 0, hasReturnPolicy: true, walletActive: true, now };
  const good = trust.supplierRisk(base);
  assert.deepEqual(good, { score: 0, level: "low", reasons: [] });
  const owing = trust.supplierRisk({ ...base, overdueKobo: 500_000, notSent: 3 });
  assert.equal(owing.level, "medium");
  assert.deepEqual(owing.reasons, ["owes_money", "orders_not_sent"]);
  assert.equal(trust.supplierRisk({ ...base, verificationStatus: "pending" }).reasons[0], "verification_pending");
});

test("the agreement: the steps the seller sees, and only an active agreement lets them list", () => {
  assert.equal(trust.listingStep(null), "agree");
  assert.equal(trust.listingStep({ status: "requested" }), "waiting");
  assert.equal(trust.listingStep({ status: "declined" }), "declined");
  assert.equal(trust.listingStep({ status: "active" }), "ready");
  assert.equal(trust.isStockCheck("visit"), true);
  assert.equal(trust.isStockCheck("photos"), false);
});

test("every agreement point and risk reason has words in every language file", () => {
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const text = read(`shared/i18n/messages/marketplace/${locale}.ts`);
    for (let index = 0; index < trust.AGREEMENT_POINTS; index += 1) assert.match(text, new RegExp(`"trust\\.point\\.${index}"`), `${locale} point ${index}`);
    for (const reason of ["not_verified", "verification_pending", "new_account", "no_orders_yet", "few_orders", "low_rating", "missed_orders", "orders_not_sent", "owes_money", "no_return_policy", "no_wallet"]) {
      assert.match(text, new RegExp(`"trust\\.reason\\.${reason}"`), `${locale} reason ${reason}`);
    }
  }
});

test("wired in: every add-to-store path checks the agreement, and switches only go to agreed suppliers", () => {
  for (const path of ["src/app/actions/sourcing.ts", "src/app/api/app/store-products/add-from-supplier/route.ts", "src/app/api/app/dropship/start/route.ts", "src/app/api/mobile/marketplace/route.ts"]) {
    assert.match(read(path), /listingCheck\(user\.id, [a-zA-Z.]+supplierId\)/, path);
  }
  assert.match(read("src/lib/supplier-orders/switch.server.ts"), /agreements: \{ some: \{ sellerId: expired\.sellerId, status: "active" \} \}/);
  const visible = read("src/lib/marketplace/agreements.server.ts");
  assert.match(visible, /verificationStatus: \{ notIn: \["rejected", "suspended"\] \}/, "unverified suppliers show, rejected or suspended ones never");
  assert.match(visible, /user: \{ debtPausedAt: null \}/, "suppliers paused for money long overdue don't show");
  assert.match(read("src/app/marketplace/page.tsx"), /nearbyForSeller\(/);
  assert.match(read("src/app/api/mobile/marketplace/products/route.ts"), /nearbyForSeller\(/);
});

test("pausing for money long overdue: suppliers and partners only, 7 days after the due date; never a seller", () => {
  const due = new Date("2026-11-01T12:00:00Z");
  assert.equal(owed.pausesAt(due).toISOString(), "2026-11-08T12:00:00.000Z");
  const debt = { status: "open", dueAt: due, amountKobo: 100_000, paidKobo: 0 };
  assert.equal(owed.debtPauses(debt, new Date("2026-11-07T12:00:00Z")), false);
  assert.equal(owed.debtPauses(debt, new Date("2026-11-08T12:00:00Z")), true);
  assert.equal(owed.debtPauses({ ...debt, paidKobo: 100_000 }, new Date("2026-11-09T12:00:00Z")), false);
  assert.equal(owed.debtPauses({ ...debt, status: "disputed" }, new Date("2026-11-09T12:00:00Z")), false);
  const server = read("src/lib/money-owed/money-owed.server.ts");
  assert.match(server, /export async function refreshDebtPause/);
  assert.equal((server.match(/await refreshDebtPause\(/g) ?? []).length >= 5, true, "payments, cancels, waivers and more time all lift the pause straight away");
  // A shop is the seller's business: Shopinbos never pauses a seller (wholesale orders and listings aren't blocked).
  assert.match(server, /user\.role === "seller" \? \[\]/);
  assert.doesNotMatch(read("src/lib/supplier-orders/wholesale.server.ts"), /buyer\?\.debtPausedAt/);
  assert.doesNotMatch(read("src/lib/marketplace/agreements.server.ts"), /code: "PAUSED"/);
});
