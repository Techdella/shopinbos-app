// Shop orders sent in more than one parcel, and sending a supplier's part to another supplier when they don't accept
// in time (build spec 7.2). The rules live in shared/order-parts.ts (pure, loaded directly; Node strips the types).
// The wiring is checked by reading the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const op = await import("../shared/order-parts.ts");
const so = await import("../src/lib/supplier-orders/pure.ts");

// ─── Status from the parts ───────────────────────────────────────────────────

const SUPPLIER_STATUSES = ["pending", "accepted", "shipped", "delivered", "rejected", "cancelled", "expired"];
const OWN = [null, "waiting", "sent", "delivered"];
const RETAIL = ["paid", "processing", "shipped", "delivered", "cancelled"];

function summary(statuses, own) {
  return op.orderParts({
    supplierOrders: statuses.map((status, index) => ({ id: `so${index}`, status, supplierName: `Supplier ${index}` })),
    ownLines: own ? 1 : 0,
    ownShippedAt: own === "sent" || own === "delivered" ? "2026-10-12T10:00:00Z" : null,
    ownDeliveredAt: own === "delivered" ? "2026-10-12T12:00:00Z" : null,
  });
}

test("status aggregation: every combination of two supplier parcels, the seller's own part and the order's status", () => {
  let checked = 0;
  for (const a of SUPPLIER_STATUSES) {
    for (const b of SUPPLIER_STATUSES) {
      for (const own of OWN) {
        const s = summary([a, b], own);
        const live = [a, b].filter((status) => status !== "cancelled");
        const states = [...live.map((status) => op.supplierPartState(status)), ...(own ? [own === "waiting" ? "waiting" : own] : [])];
        assert.equal(s.total, states.length);
        const sent = states.filter((state) => state === "sent" || state === "delivered").length;
        const delivered = states.filter((state) => state === "delivered").length;
        const problems = states.filter((state) => state === "problem").length;
        assert.equal(s.sent, sent);
        assert.equal(s.delivered, delivered);
        assert.equal(s.problems, problems);
        assert.equal(s.partial, sent > 0 && sent < states.length, `${a}/${b}/${own}: partial`);
        for (const retail of RETAIL) {
          const target = op.retailStatusFromParts(retail, s);
          const label = `${retail} with ${a}, ${b}, own ${own}`;
          if (target === "shipped") assert.ok(problems === 0 && sent === states.length && delivered < states.length, `${label}: shipped only when every parcel has left`);
          if (target === "delivered") assert.ok(problems === 0 && delivered === states.length, `${label}: delivered only when every parcel arrived`);
          if (sent > 0 && sent < states.length) assert.ok(target !== "shipped" && target !== "delivered", `${label}: partly sent never says shipped`);
          if (["shipped", "delivered", "cancelled"].includes(retail)) {
            if (retail === "shipped") assert.ok(target === null || target === "delivered", `${label}: only forward`);
            else assert.equal(target, null, `${label}: never moves a finished or cancelled order`);
          }
          if (states.length === 0) assert.equal(target, null);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 900, `${checked} combinations`);
});

test("status aggregation: the plain cases", () => {
  const to = (retail, statuses, own = null) => op.retailStatusFromParts(retail, summary(statuses, own));
  assert.equal(to("paid", ["shipped", "accepted"]), "processing", "one of two picked up stays processing");
  assert.equal(to("processing", ["shipped", "shipped"]), "shipped", "both picked up: shipped");
  assert.equal(to("processing", ["delivered", "shipped"]), "shipped");
  assert.equal(to("shipped", ["delivered", "delivered"]), "delivered");
  assert.equal(to("paid", ["shipped"], "waiting"), "processing", "the seller's own part still to send");
  assert.equal(to("processing", ["shipped"], "waiting"), null, "stays processing");
  assert.equal(to("processing", ["shipped"], "sent"), "shipped", "the seller sent theirs too");
  assert.equal(to("shipped", ["delivered"], "sent"), null, "own part not delivered yet");
  assert.equal(to("shipped", ["delivered"], "delivered"), "delivered");
  assert.equal(to("paid", ["shipped", "expired"]), "processing", "a part nobody accepted waits for the seller");
  assert.equal(to("paid", ["pending", "pending"]), null);
  assert.equal(to("paid", ["pending"], "sent"), "processing", "the seller's own parcel left first");
  assert.equal(to("paid", ["shipped", "cancelled"]), "shipped", "a cancelled part isn't a parcel");
  assert.equal(to("pending", ["accepted"]), "processing", "pay on delivery");

  const s = summary(["shipped", "accepted"], "sent");
  assert.equal(s.line, "2 of 3 parcels sent");
  assert.deepEqual(s.parts.map((part) => part.label), ["On the way", "Supplier 1 is packing it", "You sent it"]);
  assert.equal(summary(["shipped", "shipped"]).line, "All 2 parcels sent");
  assert.equal(summary(["delivered", "shipped"]).line, "1 of 2 parcels delivered");
  assert.equal(summary(["delivered", "delivered"], "delivered").line, "All 3 parcels delivered");
  assert.equal(summary(["shipped"]).line, null, "one parcel: no count");
  assert.equal(summary(["expired"]).parts[0].label, "Supplier 0 didn't accept in time");
  assert.equal(summary(["pending"]).parts[0].label, "Waiting for Supplier 0 to accept");

  // The customer's words while part of it is on the way.
  assert.equal(op.customerProgress({ status: "processing", partlySentAt: "2026-10-12T10:00:00Z" }), "Part of your order is on its way");
  assert.equal(op.customerProgress({ status: "shipped", partlySentAt: "2026-10-12T10:00:00Z" }), null, "all on the way: the normal words");
  assert.equal(op.customerProgress({ status: "processing", partlySentAt: null }), null);
});

test("the seller's stage while suppliers send it: never 'Needs a rider' when there's nothing to send", () => {
  const stage = (retail, statuses, own = null) => op.stageFromParts(retail, summary(statuses, own))?.label ?? null;
  assert.equal(stage("paid", ["pending"]), "Waiting for the supplier");
  assert.equal(stage("processing", ["accepted", "pending"]), "Supplier is packing it");
  assert.equal(stage("processing", ["shipped", "accepted"]), "1 of 2 parcels sent");
  assert.equal(stage("processing", ["shipped", "expired"]), "Needs you");
  assert.equal(stage("processing", ["shipped"], "waiting"), null, "the seller still sends their part: the usual stage");
  assert.equal(stage("processing", ["expired"], "waiting"), "Needs you");
  assert.equal(stage("shipped", ["shipped"]), null);
  assert.equal(stage("pending", ["pending"]), null, "unpaid: the usual 'Waiting for payment'");
});

test("status aggregation: an expired part that went to another supplier is replaced by the new supplier's parcel", () => {
  const rows = [
    { id: "a", status: "expired", supplierName: "Adaeze Fabrics" },
    { id: "b", status: "pending", replacesId: "a", supplierName: "Lagos Textiles" },
    { id: "c", status: "shipped", supplierName: "Naija Naturals" },
  ];
  let s = op.orderParts({ supplierOrders: rows, ownLines: 0 });
  assert.equal(s.total, 2, "the expired one isn't a parcel any more");
  assert.equal(s.problems, 0);
  assert.equal(s.line, "1 of 2 parcels sent");
  assert.equal(op.retailStatusFromParts("processing", s), null);
  rows[1].status = "shipped";
  s = op.orderParts({ supplierOrders: rows, ownLines: 0 });
  assert.equal(op.retailStatusFromParts("processing", s), "shipped");
  // Undone: the replacement is cancelled and the expired part is back for the seller to decide.
  rows[1].status = "cancelled";
  s = op.orderParts({ supplierOrders: rows, ownLines: 0 });
  assert.equal(s.problems, 1);
  assert.equal(op.retailStatusFromParts("processing", s), null);
  // A chain: the replacement expired too and went to a third supplier.
  const chain = [
    { id: "a", status: "expired" },
    { id: "b", status: "expired", replacesId: "a" },
    { id: "d", status: "accepted", replacesId: "b" },
  ];
  const c = op.orderParts({ supplierOrders: chain, ownLines: 0 });
  assert.deepEqual(c.parts.map((part) => part.key), ["d"]);
  assert.equal(op.activeReplacement(chain, "a").id, "b");
  assert.equal(op.activeReplacement(chain, "b").id, "d");
  assert.equal(op.activeReplacement(chain, "d"), null);
});

test("the old supplier-only rule still agrees where it applies", () => {
  for (const statuses of [["accepted"], ["shipped"], ["shipped", "accepted"], ["shipped", "shipped"], ["delivered"], ["shipped", "rejected"], ["pending"]]) {
    for (const retail of ["paid", "processing", "shipped"]) {
      assert.equal(op.retailStatusFromParts(retail, summary(statuses, null)), so.retailStatusAfterSupplierUpdate({ retailStatus: retail, supplierStatuses: statuses, sellerLines: 0 }), `${retail} ${statuses}`);
    }
  }
});

// ─── Matching another supplier ────────────────────────────────────────────────

const original = { id: "sp-adaeze", name: "Classic Dashiki Shirt — Assorted Sizes & Colours", categoryId: "fashion", familyKey: "dashiki-classic" };
const line = { storeProductId: "store-1", supplierProductId: "sp-adaeze", name: "Classic Dashiki Shirt", variant: "Red / M", quantity: 2, unitCost: 3500, sellPrice: 9000 };
const settings = op.DEFAULT_SWITCH_SETTINGS;

function candidate(over = {}) {
  return {
    id: "sp-lagos", supplierId: "lagos-textiles", supplierName: "Lagos Textiles", name: "Dashiki Shirt Classic Cut", categoryId: "fashion", familyKey: null,
    supplierVerified: true, supplierActive: true, published: true, dropship: true, stock: 50, wholesalePrice: 3500, variants: [{ size: "M", color: "Red" }, { size: "L", color: "Blue" }],
    trustScore: 70, missedOrders: 0, ...over,
  };
}
const choose = (candidates, over = {}) =>
  op.chooseAlternative({ lines: [line], originals: new Map([[original.id, original]]), candidates, excludedSupplierIds: ["adaeze"], settings, ...over });

test("matching: same listing family, or same category with a close name", () => {
  assert.equal(op.productMatch(original, candidate({ familyKey: "dashiki-classic", name: "Anything" })), "family");
  assert.equal(op.productMatch(original, candidate({ familyKey: "sp-adaeze", name: "Anything" })), "family", "a listing that names the product it copies");
  assert.equal(op.productMatch({ ...original, familyKey: "sp-lagos" }, candidate({ name: "Anything" })), "family");
  assert.equal(op.productMatch(original, candidate()), "similar");
  assert.equal(op.productMatch(original, candidate({ categoryId: "beauty" })), null, "a different category never matches by name");
  assert.equal(op.productMatch(original, candidate({ name: "Ankara Print Fabric" })), null);
  assert.equal(op.productMatch({ ...original, name: "Women's Iro and Buba Set" }, candidate({ name: "Men's Iro and Buba Set" })), null, "women's vs men's");
  assert.equal(op.productMatch({ ...original, name: "Women's Iro and Buba Set" }, candidate({ name: "Ladies Iro Buba Set" })), "similar");
  assert.equal(op.productMatch(original, { ...original }), null, "never the same product");
  assert.ok(op.nameSimilarity("Classic Dashiki Shirt — Assorted Sizes & Colours", "Dashiki Shirt Classic Cut") >= op.NAME_MATCH_MIN);
});

test("matching: the size and colour must be there", () => {
  assert.deepEqual(op.parseVariantLabel("Red / M"), { size: "m", color: "red" });
  assert.deepEqual(op.parseVariantLabel("M / Red"), { size: "m", color: "red" });
  assert.deepEqual(op.parseVariantLabel("Size 42"), { size: "42", color: null });
  assert.equal(op.parseVariantLabel(""), null);
  assert.equal(choose([candidate()]).choice?.supplierId, "lagos-textiles");
  assert.equal(choose([candidate({ variants: [{ size: "L", color: "Red" }] })]).choice, null, "red but not M");
  assert.equal(choose([candidate({ variants: [{ size: "M", colour: "Blue" }] })]).choice, null, "M but not red");
  assert.equal(choose([candidate({ variants: [] })]).choice, null, "a look-alike must list its sizes and colours");
  assert.equal(choose([candidate({ variants: [], familyKey: "dashiki-classic" })]).choice?.supplierId, "lagos-textiles", "the same listing family with one kind only");
  assert.equal(choose([candidate({ variants: [] })], { lines: [{ ...line, variant: null }] }).choice?.supplierId, "lagos-textiles", "nothing picked: any");
  assert.equal(choose([candidate({ variants: [{ size: "XL", color: "Red" }] })], { lines: [{ ...line, wanted: { size: "xl", color: "red" } }] }).choice?.supplierId, "lagos-textiles", "size and colour from the store product's variants");
});

test("matching: verified, in stock, a product they send for shops", () => {
  assert.deepEqual(choose([candidate({ supplierVerified: false })]), { choice: null, skipped: { "lagos-textiles": "unverified" } });
  assert.deepEqual(choose([candidate({ supplierActive: false })]).skipped, { "lagos-textiles": "unverified" });
  assert.deepEqual(choose([candidate({ stock: 1 })]).skipped, { "lagos-textiles": "stock" }, "2 ordered, 1 left");
  assert.equal(choose([candidate({ stock: 2 })]).choice?.supplierId, "lagos-textiles");
  assert.equal(choose([candidate({ published: false })]).choice, null);
  assert.equal(choose([candidate({ dropship: false })]).choice, null);
  // Two lines from the same product share its stock.
  const two = [line, { ...line, storeProductId: "store-2", variant: "Red / M", quantity: 2 }];
  assert.equal(choose([candidate({ stock: 3 })], { lines: two }).choice, null);
  assert.equal(choose([candidate({ stock: 4 })], { lines: two }).choice?.costAfter, 14000);
  // Every line needs a match from the same supplier.
  const other = { ...line, storeProductId: "store-3", supplierProductId: "sp-other", name: "Kente Stole", variant: null };
  assert.equal(op.chooseAlternative({ lines: [line, other], originals: new Map([[original.id, original]]), candidates: [candidate()], excludedSupplierIds: [], settings }).choice, null);
});

test("price limit: at most 10% above the cost by default, or the seller's margin; never above their price", () => {
  assert.equal(op.maxUnitCost({ unitCost: 3500, sellPrice: 9000 }, settings), 3850);
  assert.equal(choose([candidate({ wholesalePrice: 3850 })]).choice?.costAfter, 7700);
  assert.deepEqual(choose([candidate({ wholesalePrice: 3851 })]).skipped, { "lagos-textiles": "price" });
  const margin = op.switchSettings({ switchCostRule: "margin", switchMinMarginPct: 40 });
  assert.equal(op.maxUnitCost({ unitCost: 3500, sellPrice: 9000 }, margin), 5400, "keep 40% of ₦9,000");
  assert.equal(op.chooseAlternative({ lines: [line], originals: new Map([[original.id, original]]), candidates: [candidate({ wholesalePrice: 5000 })], excludedSupplierIds: [], settings: margin }).choice?.supplierId, "lagos-textiles");
  assert.equal(op.maxUnitCost({ unitCost: 3500, sellPrice: 0 }, margin), 3850, "no price known: the cost rule");
  assert.equal(op.maxUnitCost({ unitCost: 3500, sellPrice: 3600 }, settings), 3600, "never a loss");
  // Settings: defaults and bounds.
  assert.deepEqual(op.switchSettings(null), { auto: true, rule: "cost", maxIncreasePct: 10, minMarginPct: 20 });
  assert.deepEqual(op.switchSettings({ autoSwitchSupplier: false, switchCostRule: "nonsense", switchMaxIncreasePct: 900, switchMinMarginPct: -5 }), { auto: false, rule: "cost", maxIncreasePct: 100, minMarginPct: 0 });
  // Plain words about the money.
  assert.equal(op.costChangeWords(7000, 7000), "Same price for you.");
  assert.equal(op.costChangeWords(7000, 7500), "It costs you ₦500 more.");
  assert.equal(op.costChangeWords(7000, 6700), "It costs you ₦300 less.");
  assert.equal(
    op.switchedMessage({ fromName: "Adaeze Fabrics", toName: "Lagos Textiles", costBefore: 7000, costAfter: 7000 }),
    "Adaeze Fabrics didn't accept in time, so we sent it to Lagos Textiles instead. Same price for you.",
  );
});

test("choosing: same family first, then trust, fewest misses, same city, lowest cost", () => {
  const a = candidate({ id: "p-a", supplierId: "a", supplierName: "A", trustScore: 90, wholesalePrice: 3400 });
  const b = candidate({ id: "p-b", supplierId: "b", supplierName: "B", trustScore: 60, familyKey: "dashiki-classic", wholesalePrice: 3800 });
  assert.equal(choose([a, b]).choice.supplierId, "b", "the same listing family wins");
  const c = candidate({ id: "p-c", supplierId: "c", supplierName: "C", trustScore: 90, missedOrders: 3 });
  assert.equal(choose([a, c]).choice.supplierId, "a", "fewer missed orders");
  const d = candidate({ id: "p-d", supplierId: "d", supplierName: "D", trustScore: 90, wholesalePrice: 3400, sameCity: true });
  assert.equal(choose([a, d]).choice.supplierId, "d", "same city");
  const e = candidate({ id: "p-e", supplierId: "e", supplierName: "E", trustScore: 90, wholesalePrice: 3300 });
  assert.equal(choose([a, e]).choice.supplierId, "e", "lower cost");
  const choice = choose([e]).choice;
  assert.equal(choice.costBefore, 7000);
  assert.equal(choice.costAfter, 6600);
  assert.equal(choice.lines[0].newSupplierProductId, "p-e");
  assert.equal(choice.lines[0].newUnitCost, 3300);
  assert.equal(choice.lines[0].storeProductId, "store-1", "the shop's product stays the same");
});

// ─── Switch limit and never back ──────────────────────────────────────────────

test("switch limit: at most twice per order, off when the shop says so", () => {
  assert.equal(op.MAX_SWITCHES_PER_ORDER, 2);
  assert.equal(op.switchAllowed({ settings, switchesSoFar: 0 }), null);
  assert.equal(op.switchAllowed({ settings, switchesSoFar: 1 }), null);
  assert.equal(op.switchAllowed({ settings, switchesSoFar: 2 }), "limit");
  assert.equal(op.switchAllowed({ settings: op.switchSettings({ autoSwitchSupplier: false }), switchesSoFar: 0 }), "off");
  const source = read("src/lib/supplier-orders/switch.server.ts");
  assert.match(source, /outcome: \{ in: \["switched", "undone"\] \}/, "an undone switch still counts");
});

test("never back to a supplier who already missed it", () => {
  const missed = op.suppliersWhoMissed([
    { supplierId: "adaeze", status: "expired" },
    { supplierId: "lagos-textiles", status: "expired" },
    { supplierId: "declined", status: "rejected" },
    { supplierId: "busy", status: "shipped" },
    { supplierId: "undone", status: "cancelled" },
  ]);
  assert.deepEqual(missed.sort(), ["adaeze", "declined", "lagos-textiles"]);
  const result = choose([candidate(), candidate({ id: "p-kano", supplierId: "kano", supplierName: "Kano Weavers", trustScore: 10 })], { excludedSupplierIds: missed });
  assert.equal(result.choice.supplierId, "kano");
  assert.equal(result.skipped["lagos-textiles"], "missed");
  assert.equal(choose([candidate()], { excludedSupplierIds: missed }).choice, null, "nobody else: the seller chooses");
  const source = read("src/lib/supplier-orders/switch.server.ts");
  assert.match(source, /new Set\(\[\.\.\.suppliersWhoMissed\(siblings\), expired\.supplierId\]\)/);
});

// ─── Undo ─────────────────────────────────────────────────────────────────────

test("undo: until the new supplier accepts; it gives the stock back and the seller's choices come back", () => {
  assert.equal(op.canUndoSwitch({ status: "pending", replacesId: "a" }), true);
  assert.equal(op.canUndoSwitch({ status: "accepted", replacesId: "a" }), false, "they accepted");
  assert.equal(op.canUndoSwitch({ status: "pending", replacesId: null }), false, "not a switch");
  assert.equal(op.canUndoSwitch({ status: "cancelled", replacesId: "a", undoneAt: "2026-10-12T10:00:00Z" }), false, "already undone");
  assert.equal(op.canUndoSwitch(null), false);

  const source = read("src/lib/supplier-orders/switch.server.ts");
  assert.match(source, /updateMany\(\{ where: \{ id: replacement\.id, status: "pending", undoneAt: null \}, data: \{ status: "cancelled", undoneAt: now \} \}\)/, "conditional: an accept that lands first wins");
  assert.match(source, /releaseSupplierOrderStock\(tx, replacement, now\)/);
  assert.match(source, /outcome: "undone", undoneAt: now/);
  assert.match(source, /where: \{ id: replacementId, storeId, replacesId: \{ not: null \} \}/, "only the seller's own store");
  const route = read("src/app/api/app/orders/[id]/supplier-switch/undo/route.ts");
  assert.match(route, /withSeller\(/);
  assert.match(route, /retailOrderId: id, storeId: store\.id/);
  const refund = read("src/app/api/app/orders/[id]/cancel-refund/route.ts");
  assert.match(refund, /withSeller\(/);
  assert.match(read("src/lib/supplier-orders/seller-choices.server.ts"), /findFirst\(\{ where: \{ id: orderId, storeId: store\.id \} \}\)/);
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

test("idempotency: one replacement per expired order, whatever re-runs", () => {
  assert.equal(op.switchKey("so-1"), "switch:so-1");
  assert.equal(op.switchKey("so-1"), op.switchKey("so-1"));
  assert.notEqual(op.switchKey("so-1"), so.supplierOrderKey("order-1", "supplier-1"), "never collides with the first order's key");
  assert.ok(!op.switchKey("so-1").startsWith("dropship:"));

  const source = read("src/lib/supplier-orders/switch.server.ts");
  assert.match(source, /idempotencyKey: switchKey\(expired\.id\)/);
  assert.match(source, /replacesId: expired\.id/, "the expired order stays linked");
  // The new order, the stock it takes and the decision are one transaction.
  const tx = source.slice(source.indexOf("return db.$transaction(async (tx) => {\n    const created"));
  assert.ok(tx.indexOf("tx.supplierOrder.create") < tx.indexOf("tx.supplierProduct.updateMany") && tx.indexOf("tx.supplierProduct.updateMany") < tx.indexOf("tx.supplierSwitch.create"));
  assert.match(source, /stockQuantity: \{ gte: quantity \} \}, data: \{ stockQuantity: \{ decrement: quantity \} \}/);
  assert.match(source, /if \(await db\.supplierSwitch\.findUnique\(\{ where: \{ fromSupplierOrderId: expiredId \}/);

  const migration = read("docs/migrations/2026-10-19-multi-supplier-reroute.sql");
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "SupplierSwitch_fromSupplierOrderId_key"/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "SupplierSwitch_toSupplierOrderId_key"/);
  assert.match(migration, /ALTER TABLE "SupplierSwitch" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ON CONFLICT \("fromSupplierOrderId"\) DO NOTHING/, "old expired orders keep the seller's choices");
  assert.doesNotMatch(migration, /DROP |DELETE FROM|TRUNCATE/i, "additive only");
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /fromSupplierOrderId String\s+@unique/);

  // The status recompute locks the order's row and only moves forward from the status it read.
  const parts = read("src/lib/supplier-orders/parts.server.ts");
  assert.match(parts, /FOR UPDATE/);
  assert.match(parts, /updateMany\(\{ where: \{ id: order\.id, status: order\.status \}, data \}\)/);
  assert.match(parts, /!order\.partlySentAt/, "the customer hears about the first parcel once");
});

// ─── Wiring ───────────────────────────────────────────────────────────────────

test("wiring: pickups move the parcel, not the whole order; customers hear 'shipped' only when it all left", () => {
  const jobs = read("src/lib/logistics/jobs.ts");
  assert.match(jobs, /supplierPickup\.findUnique\(\{ where: \{ deliveryBookingId: job\.id \}/);
  assert.match(jobs, /if \(job\.orderId && orderStatus && !supplierPickup\)/);
  assert.match(read("src/lib/supplier-orders/service.server.ts"), /recomputeOrderStatus\(retailOrderId\)/);
  assert.match(read("src/lib/orders/update-status.ts"), /markOwnPart\(order\.id, input\.status/);
  const acceptance = read("src/lib/supplier-orders/acceptance.server.ts");
  assert.match(acceptance, /decideAfterExpiry\(row\.id, now\)/);
  assert.match(acceptance, /sweepUndecided/);
  assert.match(acceptance, /Press Undo before they accept/);
  assert.match(read("src/lib/email/store-emails.ts"), /Part of your order is on its way/);
  assert.match(read("src/lib/notifications/customer-messages.ts"), /part of your order \{\{order_number\}\} is on its way/);
  assert.match(read("src/app/s/[slug]/order/[orderId]/OrderConfirmation.tsx"), /customerProgress\(order\)/);
});

test("screens: the seller sees parcels, the switch with Undo, or two choices (web and app)", () => {
  // Web copy lives in the orders catalog (shared/i18n/messages/orders/en.ts); the page shows it through t().
  const web = read("src/app/home/orders/[id]/page.tsx") + read("shared/i18n/messages/orders/en.ts");
  for (const words of ["Find another supplier", "Cancel and refund the customer", "Undo", "parts.line", "Your part", 't("detail.findAnother")', 't("detail.cancelRefund")', 't("detail.undo")']) assert.ok(web.includes(words), words);
  const app = read("apps/mobile/src/app/order/[id].tsx");
  for (const words of ['t("order.notAccepted"', 't("order.sentTo"', 't("order.undo")', 't("order.findAnother")', 't("order.refund")', 't("order.refundTitle")', "parts.line", "pathname: \"/find\""]) assert.ok(app.includes(words), words);
  // The phone's words live in the m_orders catalog (translated into the app languages).
  const appWords = read("shared/i18n/messages/m_orders/en.ts");
  for (const words of ["didn't accept in time.", "We sent it to", '"Undo"', "Find another supplier", '"Cancel and refund the customer"', "Cancel and refund the customer?"]) assert.ok(appWords.includes(words), words);
  assert.match(app, /footer = deciding \? null/, "the two choices are the screen's main buttons");
  assert.doesNotMatch(app, /help=\{false\}/, "Help stays");
  assert.match(read("apps/mobile/src/app/find/index.tsx"), /useLocalSearchParams<\{ q\?: string \}>/);
  assert.match(read("src/components/settings/SupplierSwitchCard.tsx"), /t\("switch\.auto"\)/);
  assert.match(read("shared/i18n/messages/account/en.ts"), /"switch\.auto": "Send it to another supplier for me"/);
});
