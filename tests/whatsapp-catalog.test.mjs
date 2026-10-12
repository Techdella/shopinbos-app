// WhatsApp catalog: feed rows (price, availability, CSV escaping), the feed token check, items_batch planning,
// Graph error and batch-status parsing, and product message payloads. Pure helpers only
// (src/lib/whatsapp-catalog/pure.ts, with the shared feed mapping in src/lib/social/feeds.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wc = await import("../src/lib/whatsapp-catalog/pure.ts");
const feeds = await import("../src/lib/social/feeds.ts");

const product = (overrides = {}) => ({
  id: "prod_1",
  name: "Ankara Tote",
  description: "<p>Hand-made, <b>lined</b></p>",
  images: ["/uploads/tote.jpg", "https://cdn.example.com/tote-2.jpg"],
  retailPrice: 1500,
  compareAtPrice: null,
  currency: "ngn",
  currentStock: 3,
  sku: "TOTE-1",
  barcode: null,
  categoryName: "Bags",
  status: "published",
  ...overrides,
});

const build = (products) =>
  feeds.buildFeedItems(products, { channel: "whatsapp", brand: "Ada's Shop", productUrl: (id) => `https://ada.shopinbos.com/product/${id}`, appOrigin: "https://app.shopinbos.com" });

/** Minimal RFC 4180 reader, enough to check the escaping round-trips. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\r" && text[i + 1] === "\n") row.push(cell), rows.push(row), (row = []), (cell = ""), i++;
    else cell += ch;
  }
  return rows;
}

test("feed rows: price as '1500.00 NGN', availability words, absolute images, plain-text description", () => {
  const { items, skipped } = build([product(), product({ id: "p2", currentStock: 0, compareAtPrice: 2000, retailPrice: 1750.5 })]);
  assert.equal(skipped.length, 0);
  const row = wc.catalogRow(items[0]);
  assert.equal(row.price, "1500.00 NGN");
  assert.equal(row.availability, "in stock");
  assert.equal(row.condition, "new");
  assert.equal(row.image_link, "https://app.shopinbos.com/uploads/tote.jpg", "relative image made absolute");
  assert.equal(row.additional_image_link, "https://cdn.example.com/tote-2.jpg");
  assert.equal(row.description, "Hand-made, lined");
  assert.equal(row.brand, "Ada's Shop");
  assert.match(row.link, /^https:\/\/ada\.shopinbos\.com\/product\/prod_1\?utm_source=whatsapp/);
  const sale = wc.catalogRow(items[1]);
  assert.equal(sale.availability, "out of stock");
  assert.equal(sale.price, "2000.00 NGN", "regular price is the compare-at price");
  assert.equal(sale.sale_price, "1750.50 NGN");
});

test("feed leaves out drafts and products without a photo or price, with reasons", () => {
  const { items, skipped } = build([product({ id: "d", status: "draft" }), product({ id: "n", images: [] }), product({ id: "z", retailPrice: 0 }), product({ id: "rel", images: ["relative.jpg"] })]);
  assert.equal(items.length, 0);
  assert.deepEqual(skipped.map((s) => [s.id, s.reason]), [["d", "Not published"], ["n", "No photo"], ["z", "No price"], ["rel", "No photo"]]);
});

test("feed CSV: Meta's header, and commas, quotes and newlines escaped so the row round-trips", () => {
  const tricky = product({ name: 'Tote, "Large"', description: "Line one\nLine two, with comma", images: ["https://a.example/1.jpg", "https://a.example/2.jpg", "https://a.example/3.jpg"] });
  const csv = wc.catalogFeedCsv(build([tricky]));
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], [...wc.CATALOG_FEED_COLUMNS]);
  for (const required of ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "additional_image_link"]) assert.ok(rows[0].includes(required), required);
  const record = Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]]));
  assert.equal(record.title, 'Tote, "Large"');
  assert.equal(record.description, "Line one Line two, with comma", "newlines collapsed by plainText");
  assert.equal(record.additional_image_link, "https://a.example/2.jpg,https://a.example/3.jpg");
  assert.equal(record.price, "1500.00 NGN");
  assert.equal(rows.length, 2);
  assert.ok(csv.includes('"Tote, ""Large"""'), "quotes doubled inside a quoted cell");
});

test("feed token: random and URL-safe; only the exact token matches", () => {
  const a = wc.generateFeedToken();
  const b = wc.generateFeedToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(wc.feedTokenMatches(a, a), true);
  assert.equal(wc.feedTokenMatches(b, a), false);
  assert.equal(wc.feedTokenMatches(a.slice(0, -1), a), false, "truncated");
  assert.equal(wc.feedTokenMatches(`${a}x`, a), false, "extended");
  assert.equal(wc.feedTokenMatches("", a), false);
  assert.equal(wc.feedTokenMatches(null, a), false);
  assert.equal(wc.feedTokenMatches(a, null), false, "store without a token never matches");
  assert.equal(wc.feedTokenMatches("short", "short"), false, "odd-shaped tokens fail");
  const path = wc.catalogFeedPath("ada shop", a);
  assert.equal(path, `/api/public/store/ada%20shop/catalog-feed.csv?token=${a}`);
  assert.ok(!wc.maskFeedUrl(`https://x${path}`).includes(a), "masked URL hides the token");
});

test("batch planning: CREATE new, UPDATE changed, skip unchanged, DELETE removed, wait for in-flight", () => {
  const { items } = build([product({ id: "new" }), product({ id: "same" }), product({ id: "changed" }), product({ id: "inflight" }), product({ id: "failed" })]);
  const hash = (id) => wc.itemHash(wc.batchData(items.find((i) => i.id === id)));
  const records = [
    { productId: "same", hash: hash("same"), status: "synced", remote: true },
    { productId: "changed", hash: "old", status: "synced", remote: true },
    { productId: "inflight", hash: hash("inflight"), status: "pending", remote: false, handle: "h1" },
    { productId: "failed", hash: hash("failed"), status: "failed", remote: false },
    { productId: "gone", hash: "x", status: "synced", remote: true },
    { productId: "gone-local", hash: null, status: "skipped", remote: false },
    { productId: "deleting", hash: null, status: "pending", remote: true, handle: "h2", method: "DELETE" },
  ];
  const plan = wc.planSync(items, records);
  const methods = Object.fromEntries(plan.requests.map((r) => [r.data.id, r.method]));
  assert.deepEqual(methods, { new: "CREATE", changed: "UPDATE", gone: "DELETE" });
  assert.equal(plan.unchanged, 3, "same, inflight and failed are left alone");
  assert.deepEqual(plan.requests.find((r) => r.method === "DELETE").data, { id: "gone" });
  assert.equal(plan.hashes.get("gone"), null);
  assert.equal(plan.hashes.get("new"), hash("new"));

  const manual = wc.planSync(items, records, { retryFailed: true });
  assert.equal(manual.requests.find((r) => r.data.id === "failed")?.method, "CREATE", "Sync now retries rejected products");
  const full = wc.planSync(items, records, { full: true });
  assert.equal(full.requests.filter((r) => r.method !== "DELETE").length, 5, "full resend sends every listed product");
  assert.ok(full.requests.some((r) => r.data.id === "deleting" && r.method === "DELETE"));
});

test("batch data: Meta field names, empty optional fields left out; body and chunking", () => {
  const { items } = build([product()]);
  const data = wc.batchData(items[0]);
  assert.equal(data.id, "prod_1");
  assert.equal(data.price, "1500.00 NGN");
  assert.equal(data.availability, "in stock");
  assert.ok(!("sale_price" in data) && !("gtin" in data), "blank optional fields omitted");
  assert.equal(wc.itemHash({ a: "1", b: "2" }), wc.itemHash({ b: "2", a: "1" }), "hash ignores key order");
  const body = wc.itemsBatchBody([{ method: "UPDATE", data }]);
  assert.equal(body.item_type, "PRODUCT_ITEM");
  assert.equal(body.allow_upsert, true);
  assert.deepEqual(wc.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(wc.chunk([], 500), []);
});

test("Graph errors: permission, token, rate limit, not found, duplicate", () => {
  const permission = wc.parseGraphError({ error: { message: "(#10) Application does not have permission for this action", code: 10 } });
  assert.equal(permission.kind, "permission");
  assert.match(permission.message, /catalog_management and business_management/);
  assert.equal(wc.parseGraphError({ error: { message: "(#200) Requires business_management permission", code: 200 } }).kind, "permission");
  assert.equal(wc.parseGraphError({ error: { message: "Error validating access token", code: 190, error_subcode: 463 } }).kind, "token");
  assert.equal(wc.parseGraphError({ error: { message: "Application request limit reached", code: 4 } }).kind, "rate_limit");
  assert.equal(wc.parseGraphError({}, 429).kind, "rate_limit");
  assert.equal(wc.parseGraphError({ error: { message: "Unsupported get request. Object with ID '1' does not exist", code: 100, error_subcode: 33 } }).kind, "not_found");
  assert.equal(wc.parseGraphError({ error: { message: "Item with retailer_id x already exists", code: 100 } }).kind, "duplicate");
  const other = wc.parseGraphError({ error: { message: "Something odd", code: 1, error_user_msg: "Try later" } });
  assert.equal(other.kind, "other");
  assert.equal(other.message, "Try later", "error_user_msg preferred");
  assert.equal(wc.parseGraphError(null, 500).message, "Meta answered 500");
});

test("permissions from debug_token: scopes and granular scopes", () => {
  assert.deepEqual(wc.missingPermissions({ scopes: ["whatsapp_business_messaging", "catalog_management", "business_management"] }), []);
  assert.deepEqual(wc.missingPermissions({ scopes: ["whatsapp_business_messaging", "whatsapp_business_management"] }), ["catalog_management", "business_management"]);
  assert.deepEqual(wc.missingPermissions({ granular_scopes: [{ scope: "catalog_management", target_ids: ["9"] }] }), ["business_management"]);
  assert.equal(wc.missingPermissions({}), null, "Meta didn't say");
  assert.equal(wc.missingPermissions(null), null);
  const data = { granular_scopes: [{ scope: "business_management", target_ids: ["123456", "bad"] }, { scope: "whatsapp_business_management", target_ids: ["777777"] }] };
  assert.deepEqual(wc.grantedTargets(data, "business_management"), ["123456"]);
  assert.deepEqual(wc.grantedTargets(data, "whatsapp_business_management"), ["777777"]);
  assert.deepEqual(wc.grantedTargets(data, "catalog_management"), []);
});

test("batch status: finished with per-item errors, in progress, errors by line, immediate validation errors", () => {
  const finished = wc.parseBatchStatus({
    data: [{ handle: "h", status: "finished", errors_total_count: 2, errors: [{ line: 0, id: "p1", message: "Invalid price" }, { line: 3, message: "Bad image" }, { message: "Feed-level warning" }] }],
  }, ["a", "b", "c", "p4"]);
  assert.equal(finished.done, true);
  assert.equal(finished.errors.get("p1"), "Invalid price");
  assert.equal(finished.errors.get("p4"), "Bad image", "line number mapped to the request's id");
  assert.deepEqual(finished.general, ["Feed-level warning"]);
  const running = wc.parseBatchStatus({ data: [{ status: "in_progress" }] });
  assert.equal(running.done, false);
  assert.equal(running.errors.size, 0);
  assert.equal(wc.parseBatchStatus({}).state, "unknown");
  const immediate = wc.parseBatchResponse({ handles: ["AbC"], validation_status: [{ retailer_id: "p9", errors: [{ message: "Missing title" }] }, { retailer_id: "ok", errors: [] }] });
  assert.deepEqual(immediate.handles, ["AbC"]);
  assert.equal(immediate.errors.get("p9"), "Missing title");
  assert.equal(immediate.errors.has("ok"), false);
});

test("product messages: one product, a list, and limits", () => {
  const single = wc.productMessagePayload("+234 801 234 5678", "cat1", ["p1"], { body: "Here it is" });
  assert.equal(single.to, "2348012345678");
  assert.equal(single.type, "interactive");
  assert.equal(single.interactive.type, "product");
  assert.deepEqual(single.interactive.action, { catalog_id: "cat1", product_retailer_id: "p1" });
  const list = wc.productMessagePayload("2348012345678", "cat1", ["p1", "p2", "p1"], { header: "New in" });
  assert.equal(list.interactive.type, "product_list");
  assert.equal(list.interactive.header.text, "New in");
  assert.deepEqual(list.interactive.action.sections[0].product_items, [{ product_retailer_id: "p1" }, { product_retailer_id: "p2" }], "duplicates removed");
  assert.throws(() => wc.productMessagePayload("234", "cat1", []), /at least one/);
  assert.throws(() => wc.productMessagePayload("234", "cat1", Array.from({ length: 31 }, (_, i) => `p${i}`)), /30/);
});

test("counts and wiring: statuses counted; routes, cron and migration in place", () => {
  assert.deepEqual(wc.countItems([{ status: "synced", count: 4 }, { status: "failed", count: 1 }, { status: "deleted", count: 9 }, { status: "pending", count: 2 }]), { synced: 4, failed: 1, pending: 2, skipped: 0 });
  const feed = readFileSync(new URL("../src/app/api/public/store/[slug]/catalog-feed.csv/route.ts", import.meta.url), "utf8");
  assert.match(feed, /feedTokenMatches/);
  assert.match(feed, /storeIsLive/);
  const cron = readFileSync(new URL("../src/app/api/cron/whatsapp-catalog/route.ts", import.meta.url), "utf8");
  assert.match(cron, /cronAuthorization/);
  const graph = readFileSync(new URL("../src/lib/whatsapp-catalog/graph.ts", import.meta.url), "utf8");
  assert.match(graph, /Authorization: `Bearer \$\{token\}`/, "token sent as a header");
  assert.doesNotMatch(graph, /console\./, "graph client never logs");
  const sql = readFileSync(new URL("../docs/migrations/2026-10-15-whatsapp-catalog.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "WhatsAppCatalog"/);
  assert.match(sql, /ALTER TABLE "WhatsAppCatalogItem" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /-- select cron\.schedule\(/);
  const route = readFileSync(new URL("../src/app/api/app/whatsapp-catalog/route.ts", import.meta.url), "utf8");
  assert.match(route, /withSeller/);
});
