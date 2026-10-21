// The WhatsApp store: the in-chat cart (add, options, take one off, limits), what a tap or typed word asks of it,
// the cart priced from the store's products, the WhatsApp messages for it (Meta's limits), a cart sent from the
// WhatsApp catalog (webhook `order` messages), the wa.me share link and the order confirmation. Pure TypeScript,
// Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";

const store = await import("../src/lib/whatsapp-store/pure.ts");
const bot = await import("../src/lib/inbox/whatsapp-bot.ts");
const pure = await import("../src/lib/inbox/pure.ts");
const assistant = await import("../src/lib/inbox/assistant.ts");

const naira = (n) => `₦${n.toLocaleString("en-NG")}`;

const dress = { id: "dress1", name: "Ankara dress", price: 15000, soldOut: false, options: [{ id: "s", name: "S", price: null, soldOut: false }, { id: "m", name: "M", price: 16000, soldOut: false }, { id: "l", name: "L", price: null, soldOut: true }] };
const bag = { id: "bag1", name: "Leather bag", price: 25000, soldOut: false, options: [] };
const gone = { id: "old1", name: "Old hat", price: 5000, soldOut: true, options: [] };
const products = new Map([dress, bag, gone].map((p) => [p.id, p]));

test("taps and short cart words become cart actions; questions don't", () => {
  assert.deepEqual(store.detectStoreIntent({ text: "Add to cart", replyId: "a:bag1" }), { kind: "add", productId: "bag1", variantId: null });
  assert.deepEqual(store.detectStoreIntent({ text: "M", replyId: "a:dress1:m" }), { kind: "add", productId: "dress1", variantId: "m" });
  assert.deepEqual(store.detectStoreIntent({ text: "Remove", replyId: "rm:dress1:m" }), { kind: "remove", key: "dress1:m" });
  assert.deepEqual(store.detectStoreIntent({ text: "", replyId: "co" }), { kind: "checkout" });
  assert.deepEqual(store.detectStoreIntent({ text: "", replyId: "edit" }), { kind: "edit" });
  assert.deepEqual(store.detectStoreIntent({ text: "View cart!", replyId: null }), { kind: "cart" });
  assert.deepEqual(store.detectStoreIntent({ text: "Checkout", replyId: null }), { kind: "checkout" });
  assert.deepEqual(store.detectStoreIntent({ text: "clear my cart", replyId: null }), { kind: "clear" });
  assert.equal(store.detectStoreIntent({ text: "can I pay on delivery when I checkout?", replyId: null }), null);
  assert.equal(store.detectStoreIntent({ text: "hi", replyId: "p:bag1" }), null, "Peggy's own ids stay hers");
  assert.equal(store.detectStoreIntent({ text: "", replyId: "a:../../etc" }), null, "crafted ids are refused");
  assert.equal(store.detectStoreIntent({ text: "", replyId: "a:bag1:x:y" }), null);
});

test("the cart adds, merges, fills in an option, takes one off and keeps its limits", () => {
  let added = store.addToCart([], { productId: "bag1" });
  assert.equal(added.ok, true);
  added = store.addToCart(added.cart, { productId: "bag1" });
  assert.deepEqual(added.cart, [{ productId: "bag1", variantId: null, quantity: 2 }]);

  // A catalog cart line without a size gets the size the customer picks, not a second line.
  const open = [{ productId: "dress1", variantId: null, quantity: 3 }];
  const filled = store.addToCart(open, { productId: "dress1", variantId: "m" });
  assert.deepEqual(filled.cart, [{ productId: "dress1", variantId: "m", quantity: 3 }]);

  const taken = store.removeOne([{ productId: "bag1", variantId: null, quantity: 2 }, { productId: "dress1", variantId: "m", quantity: 1 }], "dress1:m");
  assert.deepEqual(taken, [{ productId: "bag1", variantId: null, quantity: 2 }]);
  assert.deepEqual(store.removeOne(taken, "bag1"), [{ productId: "bag1", variantId: null, quantity: 1 }]);

  const max = store.addToCart([{ productId: "bag1", variantId: null, quantity: store.CART_LIMITS.perLine }], { productId: "bag1" });
  assert.deepEqual([max.ok, max.reason], [false, "max"]);
  const full = Array.from({ length: store.CART_LIMITS.lines }, (_, i) => ({ productId: `p${i}`, variantId: null, quantity: 1 }));
  const over = store.addToCart(full, { productId: "another" });
  assert.deepEqual([over.ok, over.reason], [false, "full"]);
});

test("a stored cart is cleaned: bad rows dropped, quantities clamped, duplicates merged", () => {
  const cart = store.readCart([
    { productId: "bag1", quantity: 2 },
    { productId: "bag1", variantId: null, quantity: 3 },
    { productId: "dress1", variantId: "m", quantity: 99 },
    { productId: "<script>", quantity: 1 },
    { productId: "hat", quantity: 0 },
    "junk",
  ]);
  assert.deepEqual(cart, [{ productId: "bag1", variantId: null, quantity: 5 }, { productId: "dress1", variantId: "m", quantity: 10 }]);
  assert.deepEqual(store.readCart(null), []);
});

test("prices come from the store, options and sold-out items are flagged", () => {
  const priced = store.priceCart(
    [
      { productId: "dress1", variantId: "m", quantity: 2 },
      { productId: "dress1", variantId: null, quantity: 1 },
      { productId: "bag1", variantId: null, quantity: 1 },
      { productId: "old1", variantId: null, quantity: 1 },
      { productId: "missing", variantId: null, quantity: 1 },
    ],
    products,
  );
  assert.deepEqual(priced.lines.map((l) => [l.name, l.unit, l.total, l.needsOption, l.unavailable]), [
    ["Ankara dress (M)", 16000, 32000, false, false],
    ["Ankara dress", 15000, 15000, true, false],
    ["Leather bag", 25000, 25000, false, false],
    ["Old hat", 5000, 5000, false, true],
    ["A product that's no longer available", 0, 0, false, true],
  ]);
  assert.equal(priced.total, 72000);
  assert.equal(priced.count, 4);
  // A switched-off or sold-out option can't be bought.
  assert.equal(store.priceCart([{ productId: "dress1", variantId: "l", quantity: 1 }], products).lines[0].unavailable, true);
  assert.equal(store.priceCart([{ productId: "dress1", variantId: "zz", quantity: 1 }], products).lines[0].unavailable, true);
});

test("WhatsApp messages for the cart stay within Meta's limits", () => {
  const priced = store.priceCart([{ productId: "bag1", variantId: null, quantity: 2 }], products);
  const cart = store.buildCartMessage(priced, naira, "Added Leather bag to your cart.");
  assert.equal(cart.interactive.type, "button");
  assert.deepEqual(cart.interactive.action.buttons.map((b) => b.reply.id), ["co", "menu", "edit"]);
  assert.match(cart.body, /2 × Leather bag: ₦50,000/);
  assert.match(cart.body, /Total: ₦50,000/);

  const empty = store.buildCartMessage(store.priceCart([], products), naira);
  assert.match(empty.body, /empty/);
  assert.equal(empty.interactive.action.buttons[0].reply.id, bot.REPLY_IDS.menu);

  const edit = store.buildEditList(priced, naira);
  assert.equal(edit.type, "list");
  const rows = edit.action.sections.flatMap((s) => s.rows);
  assert.ok(rows.length <= bot.LIMITS.rows);
  assert.ok(rows.every((r) => r.title.length <= bot.LIMITS.rowTitle && r.id.length <= bot.LIMITS.rowId));
  assert.deepEqual(rows.map((r) => r.id), ["rm:bag1", "clr"]);

  const options = store.buildOptionList(dress, naira);
  assert.deepEqual(options.action.sections[0].rows.map((r) => [r.id, r.description]), [["a:dress1:s", "₦15,000"], ["a:dress1:m", "₦16,000"]], "sold-out sizes are left out");
  assert.equal(store.buildOptionList({ ...dress, options: [{ id: "x", name: "X", price: null, soldOut: true }] }, naira), null);

  const pay = store.buildPayMessage(priced, naira, "https://shop.example/pay/abc", { payOnDeliveryOnly: false, hours: 24 });
  assert.equal(pay.interactive.type, "cta_url");
  assert.deepEqual(pay.interactive.action, { name: "cta_url", parameters: { display_text: "Pay now", url: "https://shop.example/pay/abc" } });
  assert.ok(pay.body.endsWith("https://shop.example/pay/abc"), "the inbox (and the plain-text fallback) carries the link");
  assert.ok(pay.interactive.body.text.length <= bot.LIMITS.body);
  assert.match(bot.interactiveSummary(pay.interactive), /\[Pay now: https:\/\/shop\.example\/pay\/abc\]/);
  assert.equal(store.buildPayMessage(priced, naira, "https://x.test/p", { payOnDeliveryOnly: true, hours: 24 }).interactive.action.parameters.display_text, "Place order");
});

test("a cart sent from the WhatsApp catalog is parsed from the webhook and becomes the chat cart", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, contacts: [{ wa_id: "2348012345678", profile: { name: "Ada" } }], messages: [{ from: "2348012345678", id: "wamid.9", timestamp: "1760000000", type: "order", order: { catalog_id: "CAT1", text: "Deliver to Yaba", product_items: [{ product_retailer_id: "bag1", quantity: "2", item_price: "25000", currency: "NGN" }, { product_retailer_id: "dress1", quantity: 1, item_price: 15000, currency: "NGN" }, { product_retailer_id: "", quantity: 1 }] } }] } }] }],
  };
  const [message] = pure.parseWhatsAppWebhook(payload).messages;
  assert.equal(message.text, "Sent a cart: 3 items. Deliver to Yaba");
  assert.deepEqual(message.order, { catalogId: "CAT1", items: [{ productId: "bag1", quantity: 2, price: 25000, currency: "NGN" }, { productId: "dress1", quantity: 1, price: 15000, currency: "NGN" }] });
  assert.deepEqual(store.cartFromCatalogOrder(message.order.items), [{ productId: "bag1", variantId: null, quantity: 2 }, { productId: "dress1", variantId: null, quantity: 1 }]);
  const text = pure.parseWhatsAppWebhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "111" }, messages: [{ from: "234801", type: "text", text: { body: "hi" } }] } }] }] }).messages[0];
  assert.equal(text.order, undefined);
});

test("the shared link opens a chat with a message Peggy answers with the products", () => {
  assert.equal(store.waMeLink("+234 801 234 5678"), `https://wa.me/2348012345678?text=${encodeURIComponent(store.SHARE_MESSAGE)}`);
  assert.equal(store.waMeLink("12"), null);
  assert.equal(store.waMeLink(null), null);
  const intent = bot.detectWhatsAppIntent({ text: store.SHARE_MESSAGE, features: { productList: true, orderStatus: true, ordering: "cart" } });
  assert.deepEqual(intent, { kind: "catalogue" });
});

test("order confirmations: which stage is due and what the customer reads", () => {
  assert.equal(store.confirmStage({ status: "paid", paymentMethod: null }), "paid");
  assert.equal(store.confirmStage({ status: "pending", paymentMethod: "pay_on_delivery" }), "placed");
  assert.equal(store.confirmStage({ status: "pending", paymentMethod: "transfer" }), "placed");
  assert.equal(store.confirmStage({ status: "pending", paymentMethod: null }), null, "a card order waits for its payment");
  assert.equal(store.confirmStage({ status: "cancelled", paymentMethod: "transfer" }), null);

  const base = { orderNumber: "SB-1001", items: [{ name: "Leather bag", quantity: 2, price: 25000 }], shippingFee: 2000, total: 52000, orderUrl: "https://shop.example/order/o1" };
  const paid = store.confirmationText({ ...base, stage: "paid", paymentMethod: null }, naira);
  assert.match(paid, /Payment received\. Order SB-1001 is confirmed/);
  assert.match(paid, /2 × Leather bag: ₦50,000/);
  assert.match(paid, /Delivery: ₦2,000/);
  assert.match(paid, /Total: ₦52,000/);
  assert.match(paid, /https:\/\/shop\.example\/order\/o1/);
  assert.match(store.confirmationText({ ...base, stage: "placed", paymentMethod: "pay_on_delivery" }, naira), /pay when it arrives/);
  assert.match(store.confirmationText({ ...base, stage: "placed", paymentMethod: "transfer" }, naira), /as soon as your transfer arrives/);
});

test("settings: the WhatsApp store is an ordering mode, confirmations default on", () => {
  assert.equal(assistant.normaliseWhatsAppBot({ ordering: "cart" }).ordering, "cart");
  assert.equal(assistant.normaliseWhatsAppBot({}).confirmations, true);
  assert.equal(assistant.normaliseWhatsAppBot({ confirmations: false }).confirmations, false);
  // "Order on WhatsApp" still means an order in cart mode (the server adds it to the cart).
  assert.deepEqual(bot.detectWhatsAppIntent({ text: "Order", replyId: "o:bag1", features: { productList: true, orderStatus: true, ordering: "cart" } }), { kind: "order", productId: "bag1" });
});
