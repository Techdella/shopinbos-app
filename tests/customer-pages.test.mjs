// What customers see on the web (the "Familiar app" checkout pages): the link in bio's Shop now, New arrivals and
// Track my order blocks; payment links with saved delivery (the one-tap pay page, and checkout charging exactly the
// seller's address and fee); the product page's seller card; and the tracking page staying on its unguessable URL.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const bio = await import("../src/lib/bio/pure.ts");
const links = await import("../src/lib/payment-links/pure.ts");
const info = await import("../src/lib/storefront/shopper-info.ts");
const mobile = await import("../apps/mobile/src/lib/paylinks-pure.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ─── Link in bio ──────────────────────────────────────────────────────────────

test("bio: Shop now, New arrivals and Track my order are blocks the page saves, with default words", () => {
  for (const type of ["shop", "arrivals", "track"]) {
    assert.ok(bio.BIO_BLOCK_TYPES.includes(type), type);
    assert.equal(bio.BioBlockSchema.safeParse({ id: "b1", type }).success, true, `${type} without a label`);
    assert.equal(bio.BioBlockSchema.safeParse({ id: "b1", type, label: "Go" }).success, true);
    assert.equal(bio.BioBlockSchema.safeParse({ id: "b1", type, url: "https://x.com" }).success, false, "no extra fields (strict)");
    assert.equal(bio.BioBlockSchema.safeParse({ id: "b1", type, label: "x".repeat(41) }).success, false, "short button words");
  }
  assert.equal(bio.bioBlockLabel({ type: "shop" }), "Shop now");
  assert.equal(bio.bioBlockLabel({ type: "arrivals", label: "  " }), "New arrivals");
  assert.equal(bio.bioBlockLabel({ type: "track", label: "Where's my order?" }), "Where's my order?");
  // A too-long label is found field by field, like the other blocks.
  const problems = bio.bioBlockProblems([{ id: "s1", type: "shop", label: "x".repeat(60) }]);
  assert.deepEqual(problems.map((p) => `${p.blockId}.${p.field}`), ["s1.label"]);
});

test("bio: New arrivals is the newest 4 published products, newest first", () => {
  const products = [
    { id: "a", status: "published", createdAt: "2026-10-01T10:00:00Z" },
    { id: "b", status: "draft", createdAt: "2026-10-20T10:00:00Z" },
    { id: "c", status: "published", createdAt: "2026-10-19T10:00:00Z" },
    { id: "d", status: "published", createdAt: "2026-10-05T10:00:00Z" },
    { id: "e", status: "published", createdAt: "2026-10-18T10:00:00Z" },
    { id: "f", status: "published", createdAt: "2026-09-01T10:00:00Z" },
  ];
  assert.deepEqual(bio.newestProducts(products).map((p) => p.id), ["c", "e", "d", "a"]);
  assert.equal(bio.ARRIVALS_COUNT, 4, "a 2×2 grid");
  // The editor's list has no status: everything in it is published already.
  assert.deepEqual(bio.newestProducts([{ id: "x", createdAt: new Date("2026-01-01") }, { id: "y", createdAt: new Date("2026-02-01") }]).map((p) => p.id), ["y", "x"]);
  const service = read("src/lib/bio/service.server.ts");
  assert.match(service, /orderBy: \{ createdAt: "desc" \}, take: ARRIVALS_COUNT/);
  assert.match(service, /status: "published" \}, orderBy: \{ createdAt: "desc" \}/, "only published products in New arrivals");
});

test("bio: a new page starts with Shop now, New arrivals, WhatsApp and Track my order", () => {
  const page = bio.defaultBioBlocks({ productIds: ["p1", "p2", "p3", "p4"], whatsapp: "+2348031112222" });
  assert.equal(page[0].type, "shop");
  assert.equal(page[1].type, "arrivals");
  assert.equal(page.at(-1).type, "track");
  assert.ok(page.some((b) => b.type === "whatsapp"));
  assert.equal(new Set(page.map((b) => b.id)).size, page.length, "fixed, different ids");
  assert.equal(bio.BioPageSchema.safeParse({ blocks: page }).success, true);
  // No products yet: no Shop now or Track my order (nothing to buy or track).
  assert.deepEqual(bio.defaultBioBlocks({ productIds: [], whatsapp: "+2348031112222" }).map((b) => b.type), ["whatsapp"]);
  // The editor's "starter" button adds them too; Peggy's starter (no shopButtons) is as before.
  const starter = bio.starterBlocks({ productIds: ["p1"], whatsapp: "08031112222", shopButtons: true });
  assert.deepEqual(starter.map((b) => b.type), ["shop", "arrivals", "product", "whatsapp", "track"]);
  assert.deepEqual(bio.starterBlocks({ productIds: ["p1"] }).map((b) => b.type), ["product"]);
});

test("bio: the public page builds its own Shop, product and order links, and Track uses the order lookup", () => {
  const service = read("src/lib/bio/service.server.ts");
  assert.match(service, /type: "shop", label: bioBlockLabel\(block\), href: buildStorefrontUrl\(store\)/);
  assert.match(service, /orderHref: buildStorefrontUrl\(store, "\/order"\)/);
  const view = read("src/app/s/[slug]/links/BioPageView.tsx");
  assert.match(view, /\/orders\/lookup/, "Track my order asks the store's lookup (order number + email or phone)");
  assert.match(view, /aria-expanded=\{open\}/, "a real button that opens the form");
  assert.match(view, /grid-cols-2/, "New arrivals is a 2×2 grid");
  const editor = read("src/app/home/social/link-in-bio/BioEditor.tsx");
  assert.match(editor, /"shop", "arrivals", "product", "whatsapp", "track"/, "sellers can add the new blocks");
});

// ─── Payment links with saved delivery ────────────────────────────────────────

const address = { street: "14 Aminu Kano Crescent", city: "Wuse 2", state: "FCT", landmark: "Near Banex Plaza" };

test("pay links: saved delivery is checked, stored in its own columns and read back", () => {
  const ok = links.CreatePaymentLinkSchema.safeParse({ items: [{ productId: "p1", quantity: 1 }], delivery: { ...address, fee: 2500 } });
  assert.equal(ok.success, true);
  assert.equal(links.CreatePaymentLinkSchema.safeParse({ items: [{ productId: "p1", quantity: 1 }], delivery: { ...address, street: " " } }).success, false, "an address needs a street");
  assert.equal(links.CreatePaymentLinkSchema.safeParse({ items: [{ productId: "p1", quantity: 1 }], delivery: { ...address, fee: -1 } }).success, false, "no negative fee");
  assert.equal(links.CreatePaymentLinkSchema.safeParse({ items: [{ productId: "p1", quantity: 1 }], delivery: { ...address, fee: 0, price: 1 } }).success, false, "strict");
  assert.equal(links.CreatePaymentLinkSchema.safeParse({ items: [{ productId: "p1", quantity: 1 }] }).success, true, "delivery stays optional");

  const columns = links.linkDeliveryColumns(ok.data.delivery);
  assert.deepEqual(columns, { deliveryStreet: address.street, deliveryCity: "Wuse 2", deliveryState: "FCT", deliveryLandmark: "Near Banex Plaza", deliveryFee: 2500, deliveryOptionId: null });
  assert.deepEqual(links.linkDeliveryColumns(null), { deliveryStreet: null, deliveryCity: null, deliveryState: null, deliveryLandmark: null, deliveryFee: null, deliveryOptionId: null });
  // A fee wins over an option (the option would price it again).
  assert.equal(links.linkDeliveryColumns({ ...address, fee: 0, optionId: "zone-1" }).deliveryOptionId, null);
  assert.equal(links.linkDeliveryColumns({ ...address, fee: null, optionId: "zone-1" }).deliveryOptionId, "zone-1");

  const saved = links.readLinkDelivery(columns);
  assert.deepEqual(saved, { street: address.street, city: "Wuse 2", state: "FCT", landmark: "Near Banex Plaza", fee: 2500, optionId: null });
  assert.equal(links.readLinkDelivery({ deliveryStreet: "", deliveryCity: "Ikeja" }), null, "no address, no saved delivery");
  assert.equal(links.linkDeliveryReady(saved), true);
  assert.equal(links.linkDeliveryReady({ ...saved, fee: null }), false, "address alone only fills the form");
  assert.equal(links.linkDeliveryReady({ ...saved, fee: null, optionId: "zone-1" }), true);
  assert.equal(links.linkDeliveryReady({ ...saved, state: "" }), false);
});

test("pay links: the seller's form becomes the delivery body (empty fee is free), web and phone alike", () => {
  const form = { street: " 14 Aminu Kano Crescent ", city: "Wuse 2", state: "FCT", landmark: "", fee: "₦2,500" };
  const web = links.deliveryFromForm(form);
  assert.deepEqual(web, { street: "14 Aminu Kano Crescent", city: "Wuse 2", state: "FCT", landmark: null, fee: 2500, optionId: null });
  assert.equal(links.deliveryFromForm({ ...form, fee: "" }).fee, 0);
  assert.equal(links.deliveryFromForm({ ...form, state: "" }), null);
  assert.equal(links.deliveryFromForm({ ...form, fee: "abc" }), null);
  assert.deepEqual(mobile.deliveryBody(form), web, "the phone sends the same body");
  assert.equal(links.LinkDeliverySchema.safeParse(web).success, true);

  const lines = [{ productId: "p1", name: "Wig", price: 45000, image: null, quantity: 1 }];
  const base = { amount: "", note: "", buyerName: "Chioma", buyerPhone: "0803 555 0141", oneTime: true, expiry: "7d" };
  assert.equal("delivery" in mobile.createBody(lines, base), false, "off: no delivery key");
  const body = mobile.createBody(lines, { ...base, deliveryOn: true, delivery: { ...form, landmark: "Near Banex Plaza" } });
  assert.equal(body.delivery.fee, 2500);
  assert.equal(links.CreatePaymentLinkSchema.safeParse(body).success, true, "the phone's body passes the web's strict schema");
  assert.equal(mobile.createProblem(lines, { ...base, deliveryOn: true, delivery: { ...form, city: "" } }), "deliveryAddress");
  assert.equal(mobile.createProblem(lines, { ...base, deliveryOn: true, delivery: { ...form, fee: "abc" } }), "deliveryFee");
  assert.equal(mobile.createProblem(lines, { ...base, deliveryOn: true, delivery: form }), null);
});

test("pay links: checkout charges the saved address and fee, whatever the page sends", () => {
  const saved = links.readLinkDelivery({ deliveryStreet: address.street, deliveryCity: "Wuse 2", deliveryState: "FCT", deliveryLandmark: null, deliveryFee: 2500 });
  const asked = { address: { street: "1 Elsewhere Rd", city: "Kano", state: "Kano", country: "Nigeria" }, deliveryOptionId: "cheap" };
  const fixed = links.linkCheckoutDelivery(saved, asked);
  assert.equal(fixed.fixed, true);
  assert.deepEqual(fixed.address, { street: address.street, city: "Wuse 2", state: "FCT", country: "Nigeria", landmark: undefined });
  assert.equal(fixed.agreedDeliveryFee, 2500);
  assert.equal(fixed.deliveryOptionId, null, "the customer can't pick a cheaper option");
  // No saved delivery (or only an address): the customer's own choices stand.
  assert.deepEqual(links.linkCheckoutDelivery(null, asked), { address: asked.address, deliveryOptionId: "cheap", agreedDeliveryFee: null, fixed: false });
  assert.equal(links.linkCheckoutDelivery({ ...saved, fee: null }, asked).fixed, false);

  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /linkCheckoutDelivery\(link\?\.delivery/);
  assert.match(checkout, /agreedDeliveryFee: linkDelivery\.agreedDeliveryFee/);
  const quote = read("src/app/api/public/store/[slug]/checkout/quote/route.ts");
  assert.match(quote, /linkCheckoutDelivery\(link\.delivery/);
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /input\.store\.userId && agreedFee === null/, "an agreed fee replaces the delivery partners");
});

test("pay links: the short pay page when the address and delivery are saved", () => {
  const saved = { street: address.street, city: "Wuse 2", state: "Abuja", landmark: null, fee: 0, optionId: null };
  assert.equal(links.payInOneTap({ delivery: saved, items: [{ available: true, options: [] }] }), true);
  assert.equal(links.payInOneTap({ delivery: saved, items: [{ available: false, options: [] }] }), false, "something gone: the full page explains");
  assert.equal(links.payInOneTap({ delivery: { ...saved, fee: null }, items: [{ available: true }] }), false);
  assert.equal(links.payInOneTap({ delivery: null, items: [{ available: true }] }), false);
  assert.equal(links.linkDeliveryLine({ ...saved, fee: 4000 }), "Doorstep to Wuse 2, Abuja · included");
  assert.equal(links.linkDeliveryLine(saved), "Doorstep to Wuse 2, Abuja · free");
  assert.equal(links.linkDeliveryLine({ ...saved, fee: null, optionId: "z" }, { name: "Express", price: 3000 }), "Express to Wuse 2, Abuja · included");
  assert.equal(links.linkDeliveryPlace({ city: "Lagos", state: "Lagos" }), "Lagos");
  // One Pay button: card first.
  assert.equal(links.oneTapMethod(["transfer", "paystack", "pay_on_delivery"]), "paystack");
  assert.equal(links.oneTapMethod(["pay_on_delivery", "transfer"]), "transfer");
  assert.equal(links.oneTapMethod([]), null);

  const page = read("src/app/s/[slug]/pay/[code]/PayLinkClient.tsx");
  assert.match(page, /is asking you to pay/);
  assert.match(page, /Secure payment\. You'll get a receipt and a tracking link\./);
  assert.match(page, /Track my order/, "the paid screen links to the order page");
  const sql = read("docs/migrations/2026-11-18-paylink-delivery.sql");
  for (const column of ["deliveryStreet", "deliveryCity", "deliveryState", "deliveryLandmark", "deliveryFee", "deliveryOptionId"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), column);
    assert.match(read("prisma/schema.prisma"), new RegExp(`\\n  ${column}\\s+(String|Float)\\?`), column);
  }
});

// ─── Product page, checkout and tracking ──────────────────────────────────────

test("product page: the seller card says where the shop is and where it delivers", () => {
  assert.equal(info.sellerReach({ sellArea: "nationwide", sellStates: [] }), "delivers nationwide");
  assert.equal(info.sellerReach({ sellArea: "one_state", sellStates: ["Lagos"] }), "delivers within Lagos");
  assert.equal(info.sellerReach({ sellArea: "one_state", sellStates: [], originState: "Oyo" }), "delivers within Oyo");
  assert.equal(info.sellerReach({ sellArea: "selected", sellStates: ["Lagos", "Ogun", "Oyo"] }), "delivers within Lagos, Ogun and Oyo");
  assert.equal(info.sellerReach({ sellArea: "selected", sellStates: ["Lagos", "Ogun", "Oyo", "Osun", "Ondo"] }), "delivers within Lagos, Ogun, Oyo and 2 more states");
  assert.equal(info.sellerReach(null), null);
  assert.equal(info.sellerCardLine({ place: "Lekki, Lagos", reach: "delivers nationwide" }), "Lekki, Lagos · delivers nationwide");
  assert.equal(info.sellerCardLine({ place: null, reach: null }), null);
  const pdp = read("src/components/storefront/boutique/pdp/BoutiquePdp.tsx");
  assert.match(pdp, /Chat on WhatsApp/);
  assert.match(pdp, /Choose doorstep or pickup point at checkout\./);
});

test("checkout: pickup points are one card with a Change pickup point sheet, and pay on delivery is explained", () => {
  const view = read("src/components/storefront/checkout/PartnerDelivery.tsx");
  assert.match(view, /Change pickup point/);
  assert.match(view, /role="dialog" aria-modal="true"/);
  assert.match(view, /Pay on delivery isn&apos;t offered for this order\./);
  assert.match(view, /To \{area\}/);
  assert.match(read("src/app/api/public/store/[slug]/checkout/quote/route.ts"), /withPointDistances\(/);
});

test("tracking: the order page keeps its unguessable address, and never shows the rider", () => {
  assert.equal(existsSync(new URL("../src/app/t", import.meta.url)), false, "no /t/<orderNumber> route");
  assert.equal(existsSync(new URL("../src/app/s/[slug]/t", import.meta.url)), false);
  const page = read("src/app/s/[slug]/order/[orderId]/OrderConfirmation.tsx");
  assert.match(page, /"On the way"/);
  assert.match(page, /Give it to the rider only when you have your order\./);
  for (const words of ["It's late", "It hasn't arrived", "It arrived damaged", "Wrong item"]) assert.ok(page.includes(words), words);
  assert.doesNotMatch(page, /riderLat|riderLng|locationLat|lastLocation/, "no rider location");
});
