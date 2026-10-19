// The phone's product editor (shared/product-edit.ts, apps/mobile/src/app/product/[id].tsx) and shipping labels
// (src/lib/labels-token.ts, src/lib/labels-html.ts, apps/mobile/src/lib/label-pure.ts, app/order/label.tsx).
// Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edit = await import("../shared/product-edit.ts");
const token = await import("../src/lib/labels-token.ts");
const html = await import("../src/lib/labels-html.ts");
const labelPure = await import("../apps/mobile/src/lib/label-pure.ts");
const schemas = await import("../src/lib/schemas/index.ts").catch(() => null);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const own = { name: "Ankara tote", description: "Hand made", images: ["a.jpg", "b.jpg", "c.jpg"], retailPrice: 15000, compareAtPrice: 20000, currentStock: 8, lowStockThreshold: 10, inventoryType: "seller" };

test("product edit: amounts and counts from what the seller typed", () => {
  assert.equal(edit.parseNaira("12,500"), 12500);
  assert.equal(edit.parseNaira(" ₦ 2500.5 "), 2500.5);
  assert.equal(edit.parseNaira("0"), null);
  assert.equal(edit.parseNaira("-5"), null);
  assert.equal(edit.parseNaira("abc"), null);
  assert.equal(edit.parseNaira(""), null);
  assert.equal(edit.parseWholeNumber("0"), 0);
  assert.equal(edit.parseWholeNumber("1,200"), 1200);
  assert.equal(edit.parseWholeNumber("2.5"), null);
  assert.equal(edit.parseWholeNumber("-1"), null);
  assert.equal(edit.amountText(null), "");
});

test("product edit: own stock, dropship and other kinds; only own stock is counted", () => {
  assert.equal(edit.productKind({ inventoryType: "seller" }), "own");
  assert.equal(edit.productKind({ inventoryType: "dropshipping" }), "dropship");
  assert.equal(edit.productKind({ inventoryType: "seller", dropship: { id: "r1" } }), "dropship");
  assert.equal(edit.productKind({ inventoryType: "digital", dropship: null }), "other");
  assert.equal(edit.tracksStock("seller"), true);
  for (const type of ["dropshipping", "digital", "print_on_demand", "source_on_demand"]) assert.equal(edit.tracksStock(type), false);
});

test("product edit: sends only what changed, and stops at the first box to fix", () => {
  const form = edit.formFromProduct(own);
  assert.deepEqual(edit.productPatch(own, form), { ok: true, patch: {} });

  const changed = edit.productPatch(own, { ...form, name: "  Ankara tote bag ", price: "16,000", stock: "3", lowStock: "2", description: "New" });
  assert.deepEqual(changed, { ok: true, patch: { name: "Ankara tote bag", retailPrice: 16000, currentStock: 3, lowStockThreshold: 2, description: "New" } });

  // An empty old price takes it off; a typed one is set.
  assert.deepEqual(edit.productPatch(own, { ...form, compareAt: "" }).patch, { compareAtPrice: null });
  assert.deepEqual(edit.productPatch({ ...own, compareAtPrice: null }, { ...form, compareAt: "18000" }).patch, { compareAtPrice: 18000 });

  for (const [box, value, problem] of [["name", "A", "name"], ["price", "0", "price"], ["price", "ten", "price"], ["compareAt", "x", "compareAt"], ["stock", "-1", "stock"], ["lowStock", "1.5", "lowStock"], ["description", "x".repeat(5001), "description"]]) {
    assert.deepEqual(edit.productPatch(own, { ...form, [box]: value }), { ok: false, problem }, `${box}=${value}`);
  }

  // Photos: a new order is sent whole.
  assert.deepEqual(edit.productPatch(own, { ...form, images: ["c.jpg", "a.jpg", "b.jpg"] }).patch, { images: ["c.jpg", "a.jpg", "b.jpg"] });
});

test("product edit: dropship and digital products never send stock (the supplier's, or none)", () => {
  const dropship = { ...own, inventoryType: "dropshipping" };
  const form = edit.formFromProduct(dropship);
  assert.deepEqual(edit.productPatch(dropship, { ...form, stock: "nonsense", lowStock: "", price: "17000" }), { ok: true, patch: { retailPrice: 17000 } });
});

test("product edit: the patch passes the web form's schema (StoreProductUpdateSchema)", (t) => {
  if (!schemas) return t.skip("src/lib/schemas/index.ts couldn't be loaded");
  const form = edit.formFromProduct(own);
  const result = edit.productPatch(own, { ...form, name: "Bag", price: "100", compareAt: "", stock: "0", lowStock: "0", description: "", images: [] });
  assert.ok(result.ok);
  const parsed = schemas.StoreProductUpdateSchema.safeParse(result.patch);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.equal(parsed.data.compareAtPrice, null, "null takes the old price off");
  assert.equal(schemas.StoreProductUpdateSchema.safeParse({ compareAtPrice: -1 }).success, false);
  assert.equal(schemas.StoreProductUpdateSchema.safeParse({ retailPrice: 0 }).success, false);
  // Creating a product still needs a positive old price or none.
  assert.equal(schemas.StoreProductCreateSchema.safeParse({ name: "Bag", retailPrice: 100, compareAtPrice: null }).success, false);
});

test("product edit: photos move, become main and are removed", () => {
  const images = ["a", "b", "c", "d"];
  assert.deepEqual(edit.makeMainPhoto(images, 2), ["c", "a", "b", "d"]);
  assert.deepEqual(edit.makeMainPhoto(images, 0), images);
  assert.deepEqual(edit.makeMainPhoto(images, 9), images);
  assert.deepEqual(edit.movePhoto(images, 1, 0), ["b", "a", "c", "d"]);
  assert.deepEqual(edit.movePhoto(images, 1, 2), ["a", "c", "b", "d"]);
  assert.deepEqual(edit.movePhoto(images, 3, 4), images);
  assert.deepEqual(edit.removePhoto(images, 1), ["a", "c", "d"]);
  assert.deepEqual(images, ["a", "b", "c", "d"], "the original list is left alone");
});

test("product edit: variants are read for display, junk skipped", () => {
  assert.deepEqual(edit.variantRows([{ name: "Red / M", price: 5000, stock: 3 }, { color: "Blue" }, null, { price: 1 }, "x"]), [
    { name: "Red / M", price: 5000, stock: 3 },
    { name: "Blue", price: null, stock: null },
  ]);
  assert.deepEqual(edit.variantRows(null), []);
});

test("label links: signed for one seller's orders, short-lived, and tamper-proof", () => {
  const secret = "test-secret";
  const now = Date.UTC(2026, 9, 14, 10);
  const signed = token.signLabelToken({ userId: "user_1", orderIds: ["order_abc123"], now }, secret);
  assert.deepEqual(token.verifyLabelToken(signed, secret, now + 60_000), { userId: "user_1", orderIds: ["order_abc123"] });
  assert.equal(token.verifyLabelToken(signed, secret, now + token.LABEL_TOKEN_TTL_MS + 1), null, "expired");
  assert.equal(token.verifyLabelToken(signed, "other-secret", now), null, "wrong secret");
  const [payload, signature] = signed.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "user_2", o: ["order_abc123"], e: now + 1e9 })).toString("base64url");
  assert.equal(token.verifyLabelToken(`${forged}.${signature}`, secret, now), null, "someone else's id");
  assert.equal(token.verifyLabelToken(`${payload}.${signature}x`, secret, now), null);
  assert.equal(token.verifyLabelToken(`${payload}.${signature}.x`, secret, now), null);
  assert.equal(token.verifyLabelToken("", secret, now), null);
  assert.equal(token.verifyLabelToken(signed, "", now), null, "no secret, no access");
  assert.throws(() => token.signLabelToken({ userId: "u", orderIds: [] }, ""));
  assert.equal(token.labelLinkSecret({ CRON_SECRET: "c", JWT_SECRET: "j" }), "c");
  assert.equal(token.labelLinkSecret({ LABEL_LINK_SECRET: "l", CRON_SECRET: "c" }), "l");
});

const printable = (overrides = {}) => ({
  shopName: "Ada's <Bags>",
  shopPhone: "0803 000 0000",
  logoUrl: null,
  format: "label",
  words: { title: "Print labels", print: "Print", nothing: "No orders to print." },
  labels: [{ orderNumber: "SIB-1042", buyerName: "Chioma <b>Obi</b>", buyerPhone: "08031234567", lines: ["12 Admiralty Way", "Lekki, Lagos"], collect: 21000, count: 2, date: "14 Oct", qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>' }],
  ...overrides,
});

test("printable label page: the label, escaped, sized for the printer, and it opens the print dialog", () => {
  const page = html.renderLabelsHtml(printable());
  for (const words of ["SIB-1042", "08031234567", "12 Admiralty Way", "Lekki, Lagos", "Pay on delivery · collect", "₦21,000", "2 items", "From · 0803 000 0000", "size: 4in 6in", "window.print()", "<path"]) assert.ok(page.includes(words), words);
  assert.ok(page.includes("Chioma &lt;b&gt;Obi&lt;/b&gt;") && !page.includes("<b>Obi"), "buyer names are escaped");
  assert.ok(page.includes("Ada&#39;s &lt;Bags&gt;"));

  const paid = html.renderLabelsHtml(printable({ format: "a4", labels: [{ ...printable().labels[0], collect: 0, lines: [], count: 1 }] }));
  for (const words of ["Paid · do not collect", "Customer pickup", "1 item ", "size: A4", 'class="sheet"']) assert.ok(paid.includes(words), words);

  const empty = html.renderLabelsHtml(printable({ labels: [] }));
  assert.ok(empty.includes("No orders to print.") && !empty.includes("setTimeout"), "nothing to print, no dialog");

  const evil = html.renderLabelsHtml(printable({ logoUrl: "javascript:alert(1)", labels: [{ ...printable().labels[0], qrSvg: '<svg onload="alert(1)"></svg>' }] }));
  assert.ok(!evil.includes("onload=") && !evil.includes("javascript:alert"), "only real QR markup and https logos");
});

test("label as text for WhatsApp", () => {
  const words = { "label.deliverTo": "Deliver to", "label.pickup": "Customer will pick it up", "label.collect": "Collect {amount} on delivery", "label.paid": "Paid. Don't collect money", "label.items": "{count} items", "label.from": "From {shop}", "label.track": "Track: {url}" };
  const t = (key, values = {}) => words[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
  const shop = { name: "Ada Bags", phone: "0803 000 0000", logoUrl: null };
  const label = { orderId: "o1", orderNumber: "SIB-1042", buyerName: "Chioma Obi", buyerPhone: "08031234567", addressLines: ["12 Admiralty Way", "Lekki, Lagos"], collect: 21000, itemCount: 2, createdAt: "2026-10-14T10:00:00Z", trackUrl: "https://ada.shopinbos.com/order/o1" };
  assert.equal(
    labelPure.labelText(shop, label, t),
    ["*Deliver to*", "Chioma Obi", "08031234567", "12 Admiralty Way", "Lekki, Lagos", "", "Collect ₦21,000 on delivery", "SIB-1042 · 2 items", "From Ada Bags · 0803 000 0000", "Track: https://ada.shopinbos.com/order/o1"].join("\n"),
  );
  const pickup = labelPure.labelText({ ...shop, phone: null }, { ...label, buyerPhone: null, addressLines: [], collect: 0 }, t);
  assert.ok(pickup.includes("Customer will pick it up") && pickup.includes("Paid. Don't collect money") && pickup.includes("From Ada Bags\n"));
});

test("routes and screens: Bearer for data, a signed token for the print page, native screens in the app", () => {
  const productRoute = read("src/app/api/app/store-products/[id]/route.ts");
  assert.match(productRoute, /export const GET = withSeller\(/);
  assert.match(productRoute, /storeId: store\.id/, "only the seller's own products");
  const labelsRoute = read("src/app/api/app/labels/route.ts");
  assert.match(labelsRoute, /export const GET = withSeller\(/);
  assert.match(labelsRoute, /signLabelToken\(\{ userId: user\.id/);
  const printRoute = read("src/app/api/app/labels/print/route.ts");
  assert.match(printRoute, /verifyLabelToken\(/);
  assert.match(printRoute, /loadLabels\(\{ userId: access\.userId, orderIds: access\.orderIds \}\)/, "only the orders in the token, from the seller's own store");
  assert.match(printRoute, /"Cache-Control": "no-store"/);
  // The web print page and the app read the same labels.
  assert.match(read("src/app/home/labels/print/page.tsx"), /loadLabels\(/);

  const products = read("apps/mobile/src/app/(tabs)/products.tsx") + read("apps/mobile/src/app/dropship.tsx");
  assert.doesNotMatch(products, /openWeb\(`\/products\//);
  assert.match(products, /pathname: "\/product\/\[id\]"/);
  const order = read("apps/mobile/src/app/order/[id].tsx");
  assert.doesNotMatch(order, /\/home\/labels/);
  assert.match(order, /pathname: "\/order\/label"/);

  const screen = read("apps/mobile/src/app/product/[id].tsx");
  assert.match(screen, /productPatch\(/, "the shared rules");
  assert.match(screen, /Alert\.alert\(t\("edit\.removeTitle"\)/, "delete asks first");
  const mobileLib = read("apps/mobile/src/lib/products.ts");
  for (const route of ['"/api/upload"', "`/api/store/products/${", "`/api/app/store-products/${"]) assert.ok(mobileLib.includes(route), route);
  const label = read("apps/mobile/src/app/order/label.tsx");
  assert.match(label, /WebBrowser\.openBrowserAsync\(printUrl\(/);
  assert.match(label, /Share\.share\(/);
  assert.doesNotMatch(label, /expo-print|view-shot/, "no new native modules");

  const catalog = read("shared/i18n/catalog.ts");
  for (const ns of ["m_productedit", "m_label"]) assert.match(catalog, new RegExp(`import ${ns} from "\\./messages/${ns}/index\\.ts";`));
});
