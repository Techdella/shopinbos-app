// Payment links and link in bio: codes, one-time and expiry rules, what the buyer may choose (never a price),
// the agreed-price maths, the limits on links Peggy makes in customer chats, bio block checks, that checkout prices
// links on the server, that paid orders settle their link, and that every word the screens use is in i18n.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const links = await import("../src/lib/payment-links/pure.ts");
const bio = await import("../src/lib/bio/pure.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ─── Codes ────────────────────────────────────────────────────────────────────

test("link codes: 12 unguessable characters from an unambiguous alphabet, all different", () => {
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const code = links.newLinkCode();
    assert.equal(code.length, links.LINK_CODE_LENGTH);
    assert.ok(links.LINK_CODE_LENGTH >= 10);
    assert.match(code, /^[a-z2-9]+$/);
    assert.doesNotMatch(code, /[01ilouv]/, "no look-alike letters");
    assert.ok(links.isLinkCode(code));
    seen.add(code);
  }
  assert.equal(seen.size, 3000, "no repeats");
  // Bytes that would bias the alphabet are skipped (rejection sampling), so a fixed source still fills the code.
  let calls = 0;
  const fixed = links.newLinkCode((size) => {
    calls += 1;
    return new Uint8Array(size).fill(calls === 1 ? 255 : 0);
  });
  assert.equal(fixed, "a".repeat(12));
  assert.ok(calls >= 2, "the biased bytes were thrown away");
  for (const bad of ["", "ABCDEFGHJKMN", "abc", "aaaabbbbcccc1", "aaaabbbbccc0", "../etc/passwd", null, 42]) assert.equal(links.isLinkCode(bad), false, String(bad));
});

// ─── One-time and expiry ─────────────────────────────────────────────────────

test("one-time links close once paid; expired and cancelled links can't be paid; reusable links keep selling", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const later = new Date("2026-10-16T12:00:00Z");
  const past = new Date("2026-10-14T12:00:00Z");
  assert.equal(links.linkStatus({ status: "active", oneTime: true, expiresAt: later }, now), "active");
  assert.equal(links.linkPayBlock({ status: "active", oneTime: true, expiresAt: later }, now), null);
  assert.equal(links.linkStatus({ status: "active", oneTime: true, expiresAt: past }, now), "expired", "past its time reads as expired");
  assert.equal(links.linkPayBlock({ status: "active", oneTime: false, expiresAt: past.toISOString() }, now), "expired");
  assert.equal(links.linkStatus({ status: "paid", oneTime: true, expiresAt: null }, now), "paid");
  assert.equal(links.linkPayBlock({ status: "paid", oneTime: true, expiresAt: later }, now), "paid", "a paid one-time link can't be paid again");
  assert.equal(links.linkPayBlock({ status: "cancelled", oneTime: false, expiresAt: null }, now), "cancelled");
  assert.equal(links.linkPayBlock({ status: "active", oneTime: false, expiresAt: null }, now), null, "reusable, no end date");
  assert.match(links.PAY_BLOCK_MESSAGE.expired, /expired/);
  assert.equal(links.expiryFor("never", now), null);
  assert.equal(links.expiryFor("24h", now).toISOString(), "2026-10-16T12:00:00.000Z");
  assert.equal(links.expiryFor(undefined, now).toISOString(), "2026-10-22T12:00:00.000Z", "7 days by default");
});

// ─── What the buyer may choose ───────────────────────────────────────────────

test("checkout lines come from the link: the buyer picks only an open option and a quantity within the limit, never a price", () => {
  const one = { items: [{ productId: "p1", quantity: 1, price: 1 }], maxQuantity: 5, customAmount: null };
  let result = links.linkCheckoutLines(one, { quantity: 99, variantId: "v2", price: 1 });
  assert.deepEqual(result, { ok: true, lines: [{ productId: "p1", quantity: 5, variantId: "v2" }] }, "quantity capped, no price passed on");
  result = links.linkCheckoutLines(one, { quantity: 0 });
  assert.equal(result.lines[0].quantity, 1);
  // A fixed option can't be swapped.
  result = links.linkCheckoutLines({ ...one, items: [{ productId: "p1", variantId: "v1", quantity: 2 }] }, { variantId: "v9", quantity: 3 });
  assert.deepEqual(result.lines, [{ productId: "p1", quantity: 3, variantId: "v1" }]);
  // An agreed price fixes the quantity.
  result = links.linkCheckoutLines({ ...one, items: [{ productId: "p1", quantity: 2 }], customAmount: 20000 }, { quantity: 4 });
  assert.equal(result.lines[0].quantity, 2);
  assert.equal(links.buyerSetsQuantity({ ...one, customAmount: 20000 }), false);
  // Several products: exactly what the link says.
  result = links.linkCheckoutLines({ items: [{ productId: "p1", quantity: 1 }, { productId: "p2", variantId: "v", quantity: 2 }], maxQuantity: 1, customAmount: null }, { quantity: 9, variantId: "x" });
  assert.deepEqual(result.lines, [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 2, variantId: "v" }]);
  assert.equal(links.linkCheckoutLines({ items: [], maxQuantity: 1, customAmount: null }).ok, false);
  // Saved items are re-read safely.
  assert.deepEqual(links.readLinkItems([{ productId: "p1", quantity: 2 }, { productId: "", quantity: 1 }, "junk", { productId: "p3", quantity: 999 }]).map((item) => item.productId), ["p1"]);
});

test("an agreed price is spread over the lines and adds up exactly", () => {
  const lines = links.spreadAgreedAmount([{ price: 10000, quantity: 1 }, { price: 5000, quantity: 3 }], 20000);
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  assert.ok(Math.abs(total - 20000) < 0.05, `${total}`);
  assert.equal(lines[0].price, 8000);
  assert.deepEqual(links.spreadAgreedAmount([{ price: 15000, quantity: 2 }], 25000), [{ price: 12500, quantity: 2 }]);
  assert.deepEqual(links.spreadAgreedAmount([{ price: 0, quantity: 1 }], 5000), [{ price: 5000, quantity: 1 }]);
});

test("the order's channel: the chat the link was sent in, else the app it was opened from, else payment link", () => {
  assert.equal(links.linkOrderChannel({ channel: "whatsapp" }, "instagram"), "whatsapp");
  assert.equal(links.linkOrderChannel({ channel: "livechat" }, null), "online_store");
  assert.equal(links.linkOrderChannel({ channel: null }, "tiktok"), "tiktok");
  assert.equal(links.linkOrderChannel({ channel: null }, "email"), "payment_link");
  assert.equal(links.linkOrderChannel({}, null), "payment_link");
  assert.ok(read("shared/channels.ts").includes('"payment_link"'), "a known order channel");
});

test("the seller's create input is strict: no store, no prices, products in range", () => {
  const ok = links.CreatePaymentLinkSchema.safeParse({ items: [{ productId: "p1", quantity: 2 }] });
  assert.equal(ok.success, true);
  assert.equal(ok.data.oneTime, true);
  assert.equal(ok.data.expiry, "7d");
  for (const bad of [
    { items: [] },
    { items: [{ productId: "p1", quantity: 0 }] },
    { items: [{ productId: "p1", quantity: 1, price: 5 }] },
    { items: [{ productId: "p1", quantity: 1 }], storeId: "store-B" },
    { items: [{ productId: "p1", quantity: 1 }], customAmount: -5 },
    { items: [{ productId: "p1", quantity: 1 }], expiry: "forever" },
    { items: Array.from({ length: 11 }, (_, i) => ({ productId: `p${i}`, quantity: 1 })) },
  ]) {
    assert.equal(links.CreatePaymentLinkSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
  }
});

// ─── Peggy in customer chats ─────────────────────────────────────────────────

test("chat links: own published product only, capped quantity, rate limited per conversation and per store", () => {
  const base = { productFound: true, published: true, recentForConversation: 0, recentForStore: 0 };
  assert.equal(links.customerLinkProblem(base), null);
  assert.equal(links.customerLinkProblem({ ...base, productFound: false }), "not_found");
  assert.equal(links.customerLinkProblem({ ...base, published: false }), "not_published");
  assert.equal(links.customerLinkProblem({ ...base, recentForConversation: links.CUSTOMER_LINK_LIMITS.perConversationPerHour }), "rate_limited");
  assert.equal(links.customerLinkProblem({ ...base, recentForStore: links.CUSTOMER_LINK_LIMITS.perStorePerHour }), "store_busy");
  assert.equal(links.customerLinkQuantity(500), links.CUSTOMER_LINK_LIMITS.maxQuantity);
  assert.equal(links.customerLinkQuantity(-3), 1);
  assert.equal(links.customerLinkQuantity(null), 1);
  assert.equal(links.customerLinkQuantity(2.7), 2);
  assert.equal(links.CUSTOMER_LINK_LIMITS.expiryHours, 24);

  const service = read("src/lib/payment-links/service.server.ts");
  const chat = service.slice(service.indexOf("export async function createCustomerChatLink"));
  assert.match(chat, /storeId: input\.storeId/, "the product query is scoped to the store");
  assert.match(chat, /expiry: "24h"/);
  assert.match(chat, /oneTime: true/);
  assert.match(chat, /createdBy: "peggy_customer", conversationId: input\.conversationId/, "the conversation is recorded on the link");
  assert.match(chat, /no_payment/, "no way to pay: Peggy says so");
  // Peggy's customer replies get the link from the server, never from the model.
  const bot = read("src/lib/inbox/chatbot.server.ts");
  assert.match(bot, /createCustomerChatLink/);
  assert.match(bot, /Never write a link yourself/);
  assert.match(read("src/lib/inbox/service.ts"), /conversationId: conversation\.id/);
});

// ─── Server-side pricing and settling ────────────────────────────────────────

test("checkout and the quote price a payment link on the server, and paid orders settle their link", () => {
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /linkCheckout\(store\.id, parsed\.data\.paymentLinkCode/);
  assert.match(checkout, /const items = link \? link\.lines : bagItems;/, "the link's own lines replace the bag");
  assert.match(checkout, /agreedItemsTotal: link\?\.agreedItemsTotal \?\? null/);
  assert.match(checkout, /discountCode: link \? undefined : discountCode/, "no codes on top of a link");
  assert.match(checkout, /paymentLinkId: link\?\.link\.id \?\? null/);
  assert.match(checkout, /reserveStock\(tx, store\.id, priced\.stockHolds\)/, "stock holds as normal checkout");
  const quote = read("src/app/api/public/store/[slug]/checkout/quote/route.ts");
  assert.match(quote, /priceOrder\(\{ store, items: link\.lines/);
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /spreadAgreedAmount\(\[\.\.\.merged\.values\(\)\], agreed\)/);
  assert.match(pricing, /if \(!applied && agreed === null\)/, "no automatic discount on an agreed price");
  // Every way an order becomes paid settles its link (idempotent).
  // (The Paystack webhook's paid-order follow-ups live in src/lib/commerce/order-paid.server.ts.)
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /afterRetailOrderPaid\(/);
  for (const file of ["src/lib/commerce/order-paid.server.ts", "src/app/actions/payments.ts", "src/lib/orders/update-status.ts", "src/app/api/public/store/[slug]/checkout/route.ts"]) {
    assert.match(read(file), /settlePaymentLinkForOrder\(/, file);
  }
  const service = read("src/lib/payment-links/service.server.ts");
  assert.match(service, /status: "published"/, "only published products go on a link");
  assert.match(service, /const paidCount = orders\.filter\(counts\)\.length/, "the count is recomputed, so replays are safe");
  // The public page shows public product data only.
  const page = read("src/lib/payment-links/public.server.ts");
  assert.doesNotMatch(page, /costPrice|supplier|userId|buyerEmail: order/);
});

// ─── Link in bio ──────────────────────────────────────────────────────────────

test("bio blocks are checked: safe web links, real WhatsApp numbers, unique ids, a block limit", () => {
  const page = (blocks) => ({ blocks, theme: { preset: "night" } });
  const good = bio.BioPageSchema.safeParse(page([
    { id: "b1", type: "product", productId: "p1", action: "pay", featured: true },
    { id: "b2", type: "link", label: "Size guide", url: "https://example.com/sizes" },
    { id: "b3", type: "socials", links: { instagram: "@ada", tiktok: "ada" } },
    { id: "b4", type: "whatsapp", phone: "+234 803 111 2222" },
    { id: "b5", type: "signup" },
    { id: "b6", type: "collection", collectionId: "c1" },
    { id: "b7", type: "text", text: "Delivery in Lagos in 24 hours" },
  ]));
  assert.equal(good.success, true, good.error?.issues?.[0]?.message);
  for (const [label, blocks] of [
    ["script link", [{ id: "b1", type: "link", label: "x", url: "javascript:alert(1)" }]],
    ["data link", [{ id: "b1", type: "link", label: "x", url: "data:text/html,hi" }]],
    ["no label", [{ id: "b1", type: "link", label: "", url: "https://x.com" }]],
    ["bad phone", [{ id: "b1", type: "whatsapp", phone: "call me" }]],
    ["duplicate ids", [{ id: "b1", type: "text", text: "a" }, { id: "b1", type: "text", text: "b" }]],
    ["unknown type", [{ id: "b1", type: "html", html: "<script>" }]],
    ["extra field", [{ id: "b1", type: "text", text: "a", storeId: "x" }]],
    ["too many", Array.from({ length: bio.MAX_BIO_BLOCKS + 1 }, (_, i) => ({ id: `b${i}`, type: "text", text: "a" }))],
  ]) {
    assert.equal(bio.BioPageSchema.safeParse(page(blocks)).success, false, label);
  }
  assert.equal(bio.BioPageSchema.safeParse({ blocks: [], avatarUrl: "javascript:x" }).success, false);
  assert.equal(bio.BioPageSchema.safeParse({ blocks: [], theme: { preset: "night", button: "red" } }).success, false, "colours are hex");
  assert.deepEqual(bio.readBioBlocks([{ id: "ok", type: "text", text: "hi" }, { id: "bad", type: "link", url: "javascript:x", label: "x" }, null]).map((b) => b.id), ["ok"]);
});

test("bio links: social handles become profile links, WhatsApp opens a chat, colours follow the preset", () => {
  assert.equal(bio.socialUrl("instagram", "@ada.fabrics"), "https://instagram.com/ada.fabrics");
  assert.equal(bio.socialUrl("tiktok", "adafabrics"), "https://www.tiktok.com/@adafabrics");
  assert.equal(bio.socialUrl("x", "https://x.com/ada"), "https://x.com/ada");
  assert.equal(bio.socialUrl("facebook", "javascript:alert(1)"), "https://facebook.com/javascriptalert1", "never a script link");
  assert.equal(bio.socialUrl("youtube", ""), null);
  assert.equal(bio.socialUrl("whatsapp", "0803 111 2222"), "https://wa.me/2348031112222");
  assert.equal(bio.whatsappChatUrl("+2348031112222", "Hi Ada!"), "https://wa.me/2348031112222?text=Hi%20Ada!");
  const store = { background: "#111111", text: "#eeeeee", button: "#222222", buttonText: "#ffffff" };
  assert.deepEqual(bio.bioColours({ preset: "store" }, store), store);
  assert.equal(bio.bioColours({ preset: "night" }, store).background, bio.BIO_PRESETS.night.background);
  assert.equal(bio.bioColours({ preset: "night", button: "#123456" }, store).button, "#123456");
  const starter = bio.starterBlocks({ productIds: ["p1", "p2"], whatsapp: "08031112222", socials: { instagram: "@ada", tiktok: "" }, signup: true });
  assert.deepEqual(starter.map((b) => b.type), ["product", "product", "whatsapp", "socials", "signup"]);
  assert.equal(starter[0].action, "pay");
  assert.equal(starter[1].action, "page");
  assert.deepEqual(starter[3].links, { instagram: "@ada" });
  assert.equal(bio.BioPageSchema.safeParse({ blocks: starter }).success, true, "a starter page is valid");
});

test("bio editor checks: half-filled blocks are found field by field before anything is sent", () => {
  const blocks = [
    { id: "b1", type: "link", label: "", url: "https://" },
    { id: "b2", type: "whatsapp", phone: "" },
    { id: "b3", type: "text", text: "  " },
    { id: "b4", type: "product", productId: "gone", action: "page", featured: false },
    { id: "b5", type: "link", label: "Sizes", url: "https://example.com/sizes" },
    { id: "b6", type: "whatsapp", phone: "+234" },
    { id: "b7", type: "link", label: "Shop", url: "https://shop" },
  ];
  const problems = bio.bioBlockProblems(blocks, { productIds: ["p1"], collectionIds: [] });
  assert.deepEqual(problems.map((p) => `${p.blockId}.${p.field}`), ["b1.label", "b1.url", "b2.phone", "b3.text", "b4.productId", "b6.phone", "b7.url"]);
  assert.ok(problems.every((p) => p.message && typeof p.index === "number"));
  // The editor and the server agree: whatever the checks pass, the schema accepts.
  const fine = blocks.filter((block) => !problems.some((p) => p.blockId === block.id));
  assert.deepEqual(fine.map((b) => b.id), ["b5"]);
  assert.equal(bio.BioPageSchema.safeParse({ blocks: fine }).success, true);
  for (const block of blocks.filter((b) => b.id !== "b5" && b.id !== "b4")) assert.equal(bio.BioPageSchema.safeParse({ blocks: [block] }).success, false, block.id);
  // A server refusal points at the block: blocks[i].field.
  const refused = bio.BioPageSchema.safeParse({ blocks: [blocks[4], blocks[0]] });
  assert.deepEqual(bio.bioIssueTarget(refused.error.issues[0].path), { index: 1, field: "label" });
  assert.equal(bio.bioIssueTarget(["title"]), null);
  // A new WhatsApp or link block no longer starts with a value that can't save ("+234", "https://").
  const editor = read("src/app/home/social/link-in-bio/BioEditor.tsx");
  assert.doesNotMatch(editor, /phone: whatsapp \|\| "\+234"/);
  assert.match(editor, /bioBlockProblems\(/);
  assert.match(editor, /aria-invalid/);
  assert.match(editor, /role="alert"/);
});

test("a live store's /links works before the seller saves: a starter page, 404 only when turned off", () => {
  const starter = bio.defaultBioBlocks({ productIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"], whatsapp: "2348031112222" });
  // Shop now, New arrivals, the top 3 products (the first a big card), WhatsApp, then Track my order.
  assert.deepEqual(starter.map((b) => b.type), ["shop", "arrivals", "product", "product", "product", "whatsapp", "track"]);
  assert.equal(starter.find((b) => b.type === "product").featured, true);
  assert.ok(starter.every((b) => b.type !== "product" || b.action === "page"), "no Buy now without a payment link");
  assert.deepEqual(starter.find((b) => b.type === "whatsapp"), { id: "auto-whatsapp", type: "whatsapp", phone: "+2348031112222", label: "Chat with us on WhatsApp" });
  assert.equal(bio.defaultBioBlocks({ productIds: [], whatsapp: "" }).length, 0);
  assert.equal(bio.BioPageSchema.safeParse({ blocks: starter }).success, true, "the starter page saves as is");
  const service = read("src/lib/bio/service.server.ts");
  assert.match(service, /if \(!store \|\| store\.status !== "active"\) return null;/);
  assert.match(service, /if \(store\.bioPage && !store\.bioPage\.published\) return null;/);
  assert.match(service, /bioDefaultBlocks\(store\.id\)/);
});

test("the public bio page builds its own links and counts taps only for blocks on the page", () => {
  const service = read("src/lib/bio/service.server.ts");
  assert.match(service, /status: "published"/, "only published products show");
  assert.match(service, /storeId, id: \{ in: productIds \}/, "products must be the store's own");
  assert.match(service, /readBioBlocks\(page\.blocks\)\.some\(\(block\) => block\.id === blockId\)/);
  const signup = read("src/app/api/public/store/[slug]/links/signup/route.ts");
  assert.match(signup, /block\.type === "signup"/, "only a sign-up block on the page collects emails");
  assert.match(signup, /checkRateLimitShared/);
  assert.match(read("src/app/s/[slug]/links/BioPageView.tsx"), /StoreFootnote/, "the Built with Shopinbos badge rule");
});

// ─── Words ────────────────────────────────────────────────────────────────────

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const path = join(dir, name);
    if (statSync(new URL(`../${path}`, import.meta.url)).isDirectory()) out.push(...filesUnder(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test("every seller-facing word on the new screens is in the paylinks catalog, in all five languages", () => {
  const en = CATALOGS.paylinks.en;
  const missing = [];
  const files = [...filesUnder("src/components/payment-links"), ...filesUnder("src/app/home/payment-links"), ...filesUnder("src/app/home/social/link-in-bio")];
  assert.ok(files.length >= 5);
  for (const file of files) {
    const source = read(file);
    if (!/useT\("paylinks"|getT\("paylinks"/.test(source)) continue;
    for (const match of source.matchAll(/\bt\("([\w.-]+)"/g)) if (!(match[1] in en)) missing.push(`${file}: ${match[1]}`);
    // Keys built at run time (expiry.*, status.*, filter.*, block.*) must exist for every value.
    if (source.includes("t(`expiry.${")) for (const choice of links.EXPIRY_CHOICES) if (!(`expiry.${choice}` in en)) missing.push(`expiry.${choice}`);
    if (source.includes("t(`status.${")) for (const status of links.PAYMENT_LINK_STATUSES) if (!(`status.${status}` in en)) missing.push(`status.${status}`);
    if (source.includes("t(`block.${")) for (const type of bio.BIO_BLOCK_TYPES) if (!(`block.${type}` in en)) missing.push(`block.${type}`);
  }
  for (const creator of links.PAYMENT_LINK_CREATORS) if (!(`by.${creator}` in en)) missing.push(`by.${creator}`);
  assert.deepEqual(missing, []);
  for (const locale of ["pcm", "yo", "ha", "ig"]) {
    const gaps = Object.keys(en).filter((key) => !CATALOGS.paylinks[locale]?.[key]?.trim());
    assert.deepEqual(gaps, [], `paylinks/${locale}`);
  }
  for (const key of ["payment-links", "link-in-bio"]) {
    for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(CATALOGS.nav[locale][key], `nav/${locale}: ${key}`);
  }
  // No browser confirm boxes on the new screens.
  for (const file of files) assert.doesNotMatch(read(file), /window\.confirm|\balert\(/, file);
});
