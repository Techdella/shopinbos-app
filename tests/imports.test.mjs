// China imports through the sourcing partner (ShopKonfam): links, quotes, steps and the partner's queue.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const imp = await import("../src/lib/imports/pure.ts");
const team = await import("../src/lib/admin-team/pure.ts");

test("ShopKonfam and 1688 links are recognised and tidied; other sites are not", () => {
  assert.deepEqual(imp.parseImportLink("https://shopkonfam.com/products/ladies-tote-bag?utm_source=wa"), { source: "shopkonfam", url: "https://shopkonfam.com/products/ladies-tote-bag", productRef: "ladies-tote-bag" });
  assert.deepEqual(imp.parseImportLink("www.shopkonfam.com/p/12345/"), { source: "shopkonfam", url: "https://shopkonfam.com/p/12345", productRef: "12345" });
  assert.deepEqual(imp.parseImportLink("https://detail.1688.com/offer/712345678901.html?spm=a26352"), { source: "1688", url: "https://detail.1688.com/offer/712345678901.html", productRef: "712345678901" });
  assert.deepEqual(imp.parseImportLink("m.1688.com/offer/612345678.html"), { source: "1688", url: "https://detail.1688.com/offer/612345678.html", productRef: "612345678" });
  assert.equal(imp.parseImportLink("https://shopkonfam.com.evil.com/x"), null);
  assert.equal(imp.parseImportLink("https://detail.1688.com.evil.com/offer/1.html"), null);
  assert.equal(imp.parseImportLink("https://www.aliexpress.com/item/1.html"), null);
  assert.equal(imp.parseImportLink("javascript:alert(1)"), null);
  assert.equal(imp.parseImportLink(""), null);
  assert.equal(imp.looksLikeLink("https://www.aliexpress.com/item/1.html"), true);
  assert.equal(imp.looksLikeLink("Bluetooth earbuds with case"), false);
});

test("request titles come from the seller's words, else the link", () => {
  assert.equal(imp.importTitle({ description: "  Mini bucket bag " }), "Mini bucket bag");
  assert.equal(imp.importTitle({ link: { source: "shopkonfam", url: "x", productRef: "ladies-tote_bag" } }), "ShopKonfam item ladies tote bag");
  assert.equal(imp.importTitle({ link: { source: "1688", url: "x", productRef: "7123" } }), "1688 item 7123");
  assert.equal(imp.importTitle({ hasPhoto: true }), "Product from your photo");
});

test("quotes add up in naira, and expire", () => {
  assert.deepEqual(imp.quoteTotals({ unitPrice: 2450, quantity: 50, freight: 38000, customs: 21500, serviceFee: 12000 }), { goods: 122500, total: 194000, landedUnit: 3880 });
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(imp.quoteOpen({ status: "quoted", quoteValidUntil: "2026-11-12T00:00:00Z" }, now), true);
  assert.equal(imp.quoteOpen({ status: "quoted", quoteValidUntil: "2026-11-09T00:00:00Z" }, now), false);
  assert.equal(imp.quoteOpen({ status: "quoted", quoteValidUntil: null }, now), true);
  assert.equal(imp.quoteOpen({ status: "quote_paid", quoteValidUntil: null }, now), false);
});

test("the timeline, progress and the 'My imports · N' count", () => {
  assert.deepEqual(imp.IMPORT_STEPS.map((step) => step.key), ["requested", "quoted", "quote_paid", "bought", "checked", "shipping", "customs", "in_stock"]);
  assert.equal(imp.importProgress("requested"), 0);
  assert.equal(imp.importProgress("in_stock"), 100);
  assert.equal(imp.importProgress("cancelled"), 0);
  assert.equal(imp.activeImportCount([{ status: "shipping" }, { status: "in_stock" }, { status: "declined" }, { status: "requested" }]), 2);
  assert.equal(imp.isImportStatus("teleported"), false);
  assert.equal(imp.importRef(1042), "IMP-1042");
});

test("the partner moves an order one step at a time, from paid to delivered", () => {
  const path = [];
  let status = "quoted";
  while (imp.PARTNER_NEXT[status]) {
    status = imp.PARTNER_NEXT[status].to;
    path.push(status);
  }
  assert.deepEqual(path, ["quote_paid", "bought", "checked", "shipping", "customs", "in_stock"]);
  assert.equal(imp.PARTNER_NEXT.requested, undefined, "a request needs a quote first");
  assert.equal(imp.partnerFilter("nonsense"), "new");
  assert.deepEqual(imp.statusesFor("active"), ["quote_paid", "bought", "checked", "shipping", "customs"]);
  assert.equal(imp.statusesFor("all"), null);
  const every = imp.PARTNER_FILTERS.flatMap((filter) => filter.statuses).sort();
  assert.deepEqual(every, Object.keys(imp.IMPORT_STATUS_LABEL).sort(), "each status sits in one filter");
});

test("history parses safely and gives each step's time", () => {
  const events = imp.parseImportEvents([{ status: "requested", at: "2026-11-01T09:00:00Z", by: "seller" }, { status: "quoted", at: "2026-11-02T09:00:00Z", by: "partner" }, { status: "nope", at: "x" }, "junk"]);
  assert.equal(events.length, 2);
  assert.deepEqual(imp.stepTimes(events), { requested: "2026-11-01T09:00:00Z", quoted: "2026-11-02T09:00:00Z" });
  assert.deepEqual(imp.parseImportEvents(null), []);
});

test("the sourcing partner's staff open China imports and their settings only", () => {
  assert.equal(team.adminHome("sourcing"), "/admin/imports");
  assert.equal(team.adminCanOpen("sourcing", "/admin/imports/abc"), true);
  assert.equal(team.adminCanOpen("sourcing", "/api/admin/imports/abc/photos"), true);
  assert.equal(team.adminCanOpen("sourcing", "/admin/settings"), true);
  assert.equal(team.adminCanOpen("sourcing", "/admin/dashboard"), false);
  assert.equal(team.adminCanOpen("sourcing", "/admin/sellers"), false);
  assert.equal(team.adminCanOpen("sourcing", "/admin/wallets"), false);
  assert.equal(team.adminCanOpen("operations", "/admin/imports"), true);
  assert.equal(team.adminCanOpen("finance", "/admin/imports"), false);
  assert.deepEqual(team.adminNavIds("sourcing"), ["imports", "settings"]);
});

test("the table has its migration, and requests stay closed until the partner is ready", () => {
  const sql = readFileSync(new URL("../docs/migrations/2026-11-30-import-orders.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ImportOrder"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  const service = readFileSync(new URL("../src/lib/imports/service.server.ts", import.meta.url), "utf8");
  assert.match(service, /process\.env\.CHINA_IMPORTS_OPEN === "true"/);
});
