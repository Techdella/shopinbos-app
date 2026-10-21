// The phone app's Payouts and Invoices screens (apps/mobile/src/app/{payouts.tsx,invoices}), the seller's photo and
// shop logo on Home, My shop and Settings, and the rules they share with the web (/api/app/payouts, /api/app/invoices,
// src/lib/seller-invoices.ts). Pure helpers are loaded directly.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pure = await import("../apps/mobile/src/lib/money-pure.ts");
const web = await import("../src/lib/seller-invoices.ts");
const { NAMESPACES, CATALOGS } = await import("../shared/i18n/catalog.ts");

const order = (id, online, status = "paid") => ({ id, orderNumber: `SB-${id}`, buyerName: null, total: 1000, status, paymentMethod: online ? "paystack" : "cash", online, createdAt: "2026-10-12T10:00:00Z" });

test("payouts: paid online, collected yourself, all (the web's tabs)", () => {
  const orders = [order("a", true), order("b", false), order("c", true)];
  assert.deepEqual([...pure.PAYOUT_FILTERS], ["online", "offline", "all"]);
  assert.deepEqual(pure.filterPayouts(orders, "online").map((row) => row.id), ["a", "c"]);
  assert.deepEqual(pure.filterPayouts(orders, "offline").map((row) => row.id), ["b"]);
  assert.equal(pure.filterPayouts(orders, "all").length, 3);
  assert.deepEqual(pure.countPayouts(orders), { online: 2, offline: 1, all: 3 });
});

test("a new invoice: the phone's checks and body match the server's schema", () => {
  assert.deepEqual([...pure.INVOICE_DIRECTIONS], [...web.INVOICE_DIRECTIONS]);
  assert.deepEqual([...pure.INVOICE_PARTIES], [...web.INVOICE_PARTIES]);
  const form = { ...pure.EMPTY_INVOICE, partyName: "  Ada Fabrics ", amount: "₦50,000", description: " Stock ", partyEmail: "" };
  assert.equal(pure.invoiceProblem(form), null);
  const body = pure.invoiceBody(form);
  assert.deepEqual(body, { direction: "sent", partyType: "supplier", partyName: "Ada Fabrics", partyEmail: "", amount: 50000, description: "Stock" });
  const parsed = web.ManualInvoiceSchema.safeParse(body);
  assert.equal(parsed.success, true);
  assert.equal(pure.invoiceProblem({ ...form, partyName: " " }), "name");
  assert.equal(pure.invoiceProblem({ ...form, amount: "abc" }), "amount");
  assert.equal(pure.invoiceProblem({ ...form, amount: "0" }), "amount");
  assert.equal(pure.invoiceProblem({ ...form, description: "" }), "description");
  assert.equal(pure.invoiceProblem({ ...form, partyEmail: "ada@" }), "email");
  assert.equal(web.ManualInvoiceSchema.safeParse({ ...body, partyEmail: "ada@" }).success, false);
  assert.equal(web.ManualInvoiceSchema.safeParse({ ...body, amount: 0 }).success, false);
  assert.equal(pure.parseAmount("12,500.50"), 12500.5);
  assert.equal(pure.parseAmount(""), null);
});

test("the server keeps hand-made invoices newest first, at most 100", () => {
  const input = web.ManualInvoiceSchema.parse({ direction: "received", partyType: "logistics", partyName: "GIG", amount: "2500", description: "Delivery" });
  const invoice = web.buildManualInvoice(input, new Date("2026-10-12T10:00:00Z"));
  assert.match(invoice.id, /^INV-[0-9A-Z]+$/);
  assert.equal(invoice.status, "received");
  const saved = Array.from({ length: 100 }, (_, index) => ({ ...invoice, id: `old-${index}` }));
  const next = web.addManualInvoice(invoice, saved);
  assert.equal(next.length, 100);
  assert.equal(next[0].id, invoice.id);
  assert.deepEqual(web.readManualInvoices({ manualInvoices: [invoice] }), [invoice]);
  assert.deepEqual(web.readManualInvoices(null), []);
});

test("an order invoice's lines and totals", () => {
  const totals = pure.invoiceTotals({ items: [{ name: "Tote", price: 5000, quantity: 2 }, { name: "", price: 1000 }], subtotal: 11000, shippingFee: 1500, discountAmount: null, total: 12500 });
  assert.deepEqual(totals.lines, [{ name: "Tote", quantity: 2, price: 5000, total: 10000 }, { name: "Item", quantity: 1, price: 1000, total: 1000 }]);
  assert.equal(totals.delivery, 1500);
  assert.equal(totals.discount, 0);
  assert.equal(totals.total, 12500);
  assert.equal(pure.orderStatusTone("delivered"), "success");
  assert.equal(pure.orderStatusTone("awaiting_payment"), "warning");
});

test("screens exist, are in My shop and Payments, open from the web paths, and use m_money words", () => {
  for (const file of ["payouts.tsx", "invoices/index.tsx", "invoices/new.tsx", "invoices/[id].tsx"]) {
    assert.ok(existsSync(new URL(`../apps/mobile/src/app/${file}`, import.meta.url)), file);
    const source = read(`apps/mobile/src/app/${file}`);
    assert.match(source, /useT\("m_money"/, file);
    assert.doesNotMatch(source, /Alert\.alert|window\.(confirm|alert|prompt)|openWeb\(/, file);
  }
  const shop = read("apps/mobile/src/app/(tabs)/shop.tsx");
  assert.match(shop, /id: "payouts"[^\n]+path: "app:\/payouts"/);
  assert.match(shop, /id: "invoices"[^\n]+path: "app:\/invoices"/);
  const payments = read("apps/mobile/src/app/payments.tsx");
  assert.doesNotMatch(payments, /openWeb\("\/home\/(payouts|invoices)"\)/);
  const webPaths = read("apps/mobile/src/lib/web.ts");
  assert.match(webPaths, /"\/home\/payouts": "\/payouts"/);
  assert.match(webPaths, /"\/home\/invoices": "\/invoices"/);
  assert.ok(NAMESPACES.includes("m_money"));
  for (const id of ["payouts", "invoices"]) assert.ok(CATALOGS.m_shop.en[`link.${id}.label`], id);
  for (const lang of ["pcm", "yo", "ha", "ig"]) {
    for (const key of Object.keys(CATALOGS.m_money.en)) assert.ok(CATALOGS.m_money[lang][key], `m_money ${lang} ${key}`);
  }
  for (const [key, text] of Object.entries(CATALOGS.m_money.en)) assert.doesNotMatch(text, /\b(error|failed|invalid)\b/i, key);
  // No more "opens in your browser" for these two.
  assert.doesNotMatch(CATALOGS.m_settings.en["money.payoutsHint"], /browser/);
  assert.doesNotMatch(CATALOGS.m_settings.en["money.invoicesHint"], /browser/);
});

test("the seller's photo shows on Home, the shop logo on My shop, and both in Settings", () => {
  // Home follows the "Familiar app" prototype: the seller's photo in the level ring next to the greeting and shop
  // name; it opens Rewards, or Settings on a server without Rewards.
  const home = read("apps/mobile/src/app/(tabs)/home.tsx");
  assert.match(home, /const myPicture = latestPicture\(changedPictures, "avatarUrl", data\?\.ownerAvatarUrl\)/);
  assert.match(home, /<LevelPill [^\n]*uri=\{myPicture\}/);
  assert.match(home, /router\.push\("\/settings"\)/);
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /<Picture uri=\{latestPicture\(changedPictures, "logoUrl", store\.logoUrl\)\}/);
  const settings = read("apps/mobile/src/app/settings.tsx");
  assert.match(settings, /pickImage\("avatar"\)/);
  assert.match(settings, /pickImage\("logo"\)/);
  assert.match(settings, /removeIdentityImage\("avatar"\)/);
  // Same API as the web's uploader, and the dashboard sends the photo.
  assert.match(read("apps/mobile/src/lib/identity.ts"), /"\/api\/app\/me\/images"/);
  assert.match(read("src/lib/dashboard/index.ts"), /ownerAvatarUrl: store\.user\.avatarUrl/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const key of ["set.photo", "set.addPhoto", "set.changePhoto", "set.removePhoto"]) assert.ok(CATALOGS.m_settings[lang][key], `${lang} ${key}`);
    assert.ok(CATALOGS.m_home[lang]["me.open"], `${lang} me.open`);
  }
});
