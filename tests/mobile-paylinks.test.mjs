// The phone app's Payment links and Link in bio screens (apps/mobile/src/app/{payment-links,link-in-bio}) and the
// pure rules they share with the web routes (/api/app/payment-links, /api/app/bio). Pure helpers are loaded directly.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pure = await import("../apps/mobile/src/lib/paylinks-pure.ts");
const web = await import("../src/lib/payment-links/pure.ts");
const bio = await import("../src/lib/bio/pure.ts");
const { NAMESPACES, CATALOGS } = await import("../shared/i18n/catalog.ts");

const row = (status, extra = {}) => ({ id: status, code: "abcdefghjkmn", url: "https://x.shopinbos.com/pay/abcdefghjkmn", title: "Tote", status, oneTime: true, amount: 1000, createdBy: "seller", createdAt: "2026-10-12T10:00:00Z", expiresAt: null, views: 0, paidCount: 0, order: null, buyerName: null, items: [], ...extra });

test("the list filters by status and counts each one", () => {
  const links = [row("active"), row("paid"), row("active"), row("cancelled")];
  assert.deepEqual(pure.filterLinks(links, "active").map((link) => link.status), ["active", "active"]);
  assert.equal(pure.filterLinks(links, "all").length, 4);
  assert.deepEqual(pure.countByStatus(links), { all: 4, active: 2, paid: 1, expired: 0, cancelled: 1 });
  assert.deepEqual([...pure.LINK_STATUSES], [...web.PAYMENT_LINK_STATUSES], "same statuses as the server");
  assert.deepEqual([...pure.EXPIRY_CHOICES], [...web.EXPIRY_CHOICES], "same expiry choices as the web form");
  assert.equal(pure.canCancel(row("active")), true);
  assert.equal(pure.canCancel(row("paid")), false);
});

test("lines: add, more of the same, quantity limits, at most 10 products", () => {
  let lines = pure.addLine([], { productId: "p1", name: "Tote", price: 5000, image: null });
  lines = pure.addLine(lines, { productId: "p1", name: "Tote", price: 5000, image: null });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 2);
  assert.equal(pure.setQuantity(lines, "p1", 99)[0].quantity, 50);
  assert.equal(pure.setQuantity(lines, "p1", 0).length, 0, "0 takes it out");
  for (let i = 2; i <= 12; i += 1) lines = pure.addLine(lines, { productId: `p${i}`, name: "x", price: 100, image: null });
  assert.equal(lines.length, 10);
  assert.equal(pure.linesTotal([{ productId: "a", name: "a", price: 2500, image: null, quantity: 3 }]), 7500);
});

test("the create body passes the web's strict schema", () => {
  const lines = [{ productId: "p1", name: "Tote", price: 5000, image: null, quantity: 2 }];
  const form = { amount: "12,500", note: "  Blue please ", buyerName: "", buyerPhone: "0803 123 4567", oneTime: false, expiry: "30d" };
  const body = pure.createBody(lines, form);
  assert.deepEqual(body, { items: [{ productId: "p1", variantId: null, quantity: 2 }], oneTime: false, expiry: "30d", customAmount: 12500, note: "Blue please", buyerName: null, buyerPhone: "0803 123 4567" });
  assert.equal(web.CreatePaymentLinkSchema.safeParse(body).success, true);
  assert.equal(web.CreatePaymentLinkSchema.safeParse(pure.createBody(lines, { ...form, amount: "" })).data.customAmount, null);
  assert.equal(pure.createProblem([], form), "pickProduct");
  assert.equal(pure.createProblem(lines, { amount: "abc" }), "amount");
  assert.equal(pure.createProblem(lines, { amount: "" }), null);
  assert.equal(pure.parseNaira("₦0"), null);
});

test("sharing: WhatsApp to the buyer's number, short titles", () => {
  assert.equal(pure.whatsappShareUrl("Pay here", "0803 123 4567"), web.whatsappShareUrl("Pay here", "0803 123 4567"));
  assert.equal(pure.whatsappShareUrl("Hi"), "https://wa.me/?text=Hi");
  assert.equal(pure.createdTitle([{ name: "Tote" }, { name: "Bag" }, { name: "Hat" }], "Ada"), "Tote + 2");
  assert.equal(pure.createdTitle([], "Ada"), "Ada");
  assert.equal(pure.shortUrl("https://ada.shopinbos.com/links"), "ada.shopinbos.com/links");
});

test("link in bio: move, remove, new blocks and the save body pass the web's schema", () => {
  const blocks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(pure.moveBlock(blocks, 1, -1).map((b) => b.id), ["b", "a", "c"]);
  assert.deepEqual(pure.moveBlock(blocks, 2, 1).map((b) => b.id), ["a", "b", "c"], "the last can't go down");
  assert.deepEqual(pure.moveBlock(blocks, 0, -1), blocks);
  assert.deepEqual(pure.removeBlock(blocks, "b").map((b) => b.id), ["a", "c"]);

  assert.equal(pure.cleanUrl("instagram.com/ada"), "https://instagram.com/ada");
  assert.equal(pure.cleanUrl("javascript:alert(1)"), null);
  assert.equal(pure.cleanUrl("hello"), null);
  assert.deepEqual(pure.linkBlock("", "https://x.com"), { ok: false, problem: "label" });
  assert.deepEqual(pure.linkBlock("Price list", "nope"), { ok: false, problem: "url" });
  const link = pure.linkBlock(" Price list ", "shop.com/prices", () => 0.5);
  assert.equal(link.ok, true);
  assert.equal(bio.BioBlockSchema.safeParse(link.block).success, true);
  const product = pure.productBlock("p1", true);
  assert.equal(product.action, "pay");
  assert.equal(bio.BioBlockSchema.safeParse(product).success, true);

  const page = { exists: true, published: true, title: "  Ada Fabrics ", bio: "", avatarUrl: "", theme: { preset: "store" }, blocks: [link.block, product], views: 3, clicks: { [product.id]: 4 }, url: "https://ada.shopinbos.com/links" };
  const body = pure.bioSaveBody(page);
  assert.deepEqual(Object.keys(body).sort(), ["avatarUrl", "bio", "blocks", "published", "theme", "title"]);
  assert.equal(body.title, "Ada Fabrics");
  assert.equal(bio.BioPageSchema.safeParse(body).success, true);
  assert.equal(pure.blockTaps(page.clicks, product.id), 4);
  assert.equal(pure.blockTaps(page.clicks, "zzz"), 0);
});

test("screens exist, are in My shop, open from the web paths, and use m_paylinks words", () => {
  for (const file of ["payment-links/index.tsx", "payment-links/new.tsx", "payment-links/[id].tsx", "link-in-bio.tsx"]) {
    assert.ok(existsSync(new URL(`../apps/mobile/src/app/${file}`, import.meta.url)), file);
    const source = read(`apps/mobile/src/app/${file}`);
    assert.match(source, /useT\("m_paylinks"/, file);
    assert.doesNotMatch(source, /Alert\.alert|window\.(confirm|alert|prompt)/, `${file} uses the app's own sheets`);
  }
  const shop = read("apps/mobile/src/app/(tabs)/shop.tsx");
  assert.match(shop, /id: "paymentLinks"[^\n]+path: "app:\/payment-links"/);
  assert.match(shop, /id: "linkInBio"[^\n]+path: "app:\/link-in-bio"/);
  const webPaths = read("apps/mobile/src/lib/web.ts");
  assert.match(webPaths, /"\/home\/payment-links": "\/payment-links"/);
  assert.match(webPaths, /"\/home\/social\/link-in-bio": "\/link-in-bio"/);
  // Colours, photo and other blocks aren't edited on the phone, and the page doesn't send the seller to the web.
  assert.doesNotMatch(read("apps/mobile/src/app/link-in-bio.tsx"), /web-only|openWeb\(/);
  assert.ok(NAMESPACES.includes("m_paylinks"));
  for (const id of ["paymentLinks", "linkInBio"]) assert.ok(CATALOGS.m_shop.en[`link.${id}.label`], id);
  // The words a seller reads never say error, failed or invalid.
  for (const [key, text] of Object.entries(CATALOGS.m_paylinks.en)) assert.doesNotMatch(text, /\b(error|failed|invalid)\b/i, key);
});
