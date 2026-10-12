// Email builder, template library, sanitiser, auto-replies and chatbot helpers (pure TypeScript, Node strips
// the types natively).
import test from "node:test";
import assert from "node:assert/strict";

const blocks = await import("../src/lib/marketing/blocks.ts");
const { sanitizeEmailHtml, isSafeEmailUrl } = await import("../src/lib/marketing/sanitize.ts");
const library = await import("../src/lib/marketing/template-library.ts");
const layout = await import("../src/lib/marketing/email-layout.ts");
const preview = await import("../src/lib/marketing/preview.ts");
const ai = await import("../src/lib/marketing/template-ai.ts");
const assistant = await import("../src/lib/inbox/assistant.ts");

const brand = { storeName: "Ada & Co", logoUrl: null, accent: "#123456", ink: "#111111", paper: "#F6F5F9" };
const shop = { name: "Ada & Co", url: "https://ada.shopinbos.com" };

test("new block types render email-safe HTML and round-trip through the blocks comment", () => {
  const list = [
    { type: "heading", text: "Sallah <sale>", size: "md", align: "center", color: "#FF0000" },
    { type: "text", text: "**Bold**, *italic* and [our shop](https://ada.ng/?a=1&b=2)", bg: "#F6F4FA", pad: 20 },
    { type: "spacer", height: 32 },
    { type: "columns", cells: [{ heading: "When", text: "Saturday" }, { imageUrl: "https://img.example/a.jpg", alt: "A", buttonLabel: "Go", buttonUrl: "{{store_url}}" }] },
    { type: "products", items: [{ name: "Kaftan", price: "₦34,000", imageUrl: "https://img.example/k.jpg", url: "https://ada.ng/product/1" }], buttonLabel: "Buy" },
    { type: "coupon", code: "SALLAH15", title: "Sallah gift", note: "15% off" },
    { type: "social", links: [{ network: "instagram", url: "https://instagram.com/ada" }, { network: "x", url: "javascript:alert(1)" }] },
    { type: "footer", text: "Sent by {{store}}", unsubscribe: true },
    { type: "image", url: "https://img.example/hero.jpg", alt: "Hero", link: "{{store_url}}" },
    { type: "button", label: "Shop", url: "{{store_url}}", align: "center", color: "#00AA00", textColor: "#000000" },
  ];
  const html = blocks.htmlFromBlocks(list);
  assert.deepEqual(blocks.readBlocks(html), list, "the builder reopens every block with its styles");

  assert.match(html, /<h2 style="margin:0 0 14px;font-size:22px;line-height:1.2;text-align:center;color:#FF0000">Sallah &lt;sale&gt;<\/h2>/);
  assert.match(html, /<strong>Bold<\/strong>, <em>italic<\/em>/);
  assert.match(html, /<a href="https:\/\/ada\.ng\/\?a=1&amp;b=2"/);
  assert.match(html, /background:#F6F4FA/);
  assert.match(html, /height:32px/);
  assert.match(html, /max-width:272px/, "columns use inline-block cells that stack on phones");
  assert.match(html, /₦34,000/);
  assert.match(html, /SALLAH15/);
  assert.match(html, /href="https:\/\/instagram\.com\/ada"/);
  assert.doesNotMatch(html, /javascript:/, "unsafe social links are dropped");
  assert.match(html, /href="{{unsubscribe_url}}"/);
  assert.match(html, /<a href="{{store_url}}"><img src="https:\/\/img\.example\/hero\.jpg"/);
  assert.match(html, /background:#00AA00;color:#000000/);
});

test("block parsing drops bad colours, unknown types and over-long lists; inline links must be safe", () => {
  const parsed = blocks.parseBlocks([
    { type: "text", text: "x", color: "red;}</style>", align: "middle", pad: 999 },
    { type: "nope" },
    { type: "products", items: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, price: "₦1", imageUrl: "", url: "" })) },
    { type: "columns", cells: [{ heading: "Only one" }] },
  ]);
  assert.deepEqual(parsed[0], { type: "text", text: "x", pad: 48 });
  assert.equal(parsed.length, 3);
  assert.equal(parsed[1].items.length, 6);
  assert.equal(parsed[2].cells.length, 2, "columns always have two cells");
  assert.equal(blocks.inline("[bad](javascript:alert(1))"), "[bad](javascript:alert(1))");
  assert.equal(blocks.inline("<b>&</b>"), "&lt;b&gt;&amp;&lt;/b&gt;");
  assert.equal(blocks.safeUrl("https://x.y/a b"), "", "no spaces or quotes in links");
  assert.equal(blocks.safeColor("#abc"), "#abc");
  assert.equal(blocks.safeColor("url(x)"), "");
});

test("the preview line rides in its own comment and doesn't disturb the blocks", () => {
  const body = blocks.htmlFromBlocks([{ type: "text", text: "Hi" }]);
  const withPre = blocks.withPreheader(body, "Ends Sunday ₦");
  assert.equal(blocks.readPreheader(withPre), "Ends Sunday ₦");
  assert.deepEqual(blocks.readBlocks(withPre), [{ type: "text", text: "Hi" }]);
  const changed = blocks.withPreheader(withPre, "New line");
  assert.equal(blocks.readPreheader(changed), "New line");
  assert.equal((changed.match(/sib-pre:/g) ?? []).length, 1);
  assert.equal(blocks.withPreheader(changed, ""), body, "clearing it restores the plain body");
  assert.equal(blocks.readPreheader("<p>hand written</p>"), "");
  assert.equal(blocks.readPreheader(blocks.withPreheader("<p>hand written</p>", "Hello")), "Hello");
});

test("the HTML sanitiser strips scripts, handlers and javascript: links but keeps email layout", () => {
  const dirty = [
    '<p onclick="steal()" style="color:red">Hi</p>',
    "<script>alert(1)</script>",
    '<a href="java&#115;cript:alert(1)">x</a>',
    '<a href=" JAVASCRIPT:alert(1)">y</a>',
    "<img src=x onerror=alert(1)>",
    '<iframe src="https://evil"></iframe>',
    '<form action="https://evil"><input name="card"></form>',
    '<div style="background:url(javascript:alert(1))">z</div>',
    '<style>a{color:red}</style><style>@import url(https://evil.css)</style>',
    '<a href="https://ok.ng/?a=1&amp;b=2" target="_blank">ok</a>',
    '<img src="data:image/png;base64,AAAA" alt="">',
    '<img src="data:text/html;base64,PHNjcmlwdD4=" alt="">',
    "<!--[if mso]><table><![endif]-->",
  ].join("\n");
  const clean = sanitizeEmailHtml(dirty);
  assert.doesNotMatch(clean, /<script|onclick|onerror|<iframe|<form|<input|javascript/i);
  assert.match(clean, /<p style="color:red">Hi<\/p>/);
  assert.match(clean, /<a href="https:\/\/ok\.ng\/\?a=1&amp;b=2" target="_blank">ok<\/a>/);
  assert.match(clean, /<style>a{color:red}<\/style>/);
  assert.doesNotMatch(clean, /@import/);
  assert.match(clean, /data:image\/png/);
  assert.doesNotMatch(clean, /data:text\/html/);
  assert.match(clean, /<!--\[if mso\]>/, "Outlook comments survive");
  assert.match(sanitizeEmailHtml("<p>a</p><script>never closed"), /^<p>a<\/p>$/);
  assert.equal(isSafeEmailUrl("vbscript:x"), false);
  assert.equal(isSafeEmailUrl("{{store_url}}"), true);
});

test("every starter template is built from blocks, survives the sanitiser and renders with the brand", () => {
  assert.ok(library.TEMPLATE_LIBRARY.length >= 16);
  assert.equal(layout.TEMPLATE_LIBRARY, library.TEMPLATE_LIBRARY, "the old import path still works");
  const keys = new Set();
  const categories = new Set();
  for (const template of library.TEMPLATE_LIBRARY) {
    assert.ok(!keys.has(template.key), `${template.key} is unique`);
    keys.add(template.key);
    categories.add(template.category);
    assert.ok(template.category in library.TEMPLATE_CATEGORIES, `${template.key} has a known category`);
    assert.ok(blocks.readBlocks(template.bodyHtml)?.length, `${template.key} opens in the visual builder`);
    assert.equal(sanitizeEmailHtml(template.bodyHtml), template.bodyHtml, `${template.key} is untouched by the sanitiser`);
    const html = preview.renderEmailPreview({ bodyHtml: template.bodyHtml, preheader: template.preheader, brand, shop });
    assert.doesNotMatch(html, /{{\s*\w+\s*}}/, `${template.key} has no unfilled merge tags`);
    assert.match(html, /Ada &amp; Co/);
    for (const src of html.matchAll(/<img src="([^"]+)"/g)) assert.match(src[1], /^https:\/\/(images\.unsplash\.com\/photo-|app\.shopinbos\.com\/brand\/email\/shopinbos-logo-(navy|white)@2x\.png$)/, `${template.key} images come from Unsplash (or the footer's Shopinbos mark)`);
  }
  for (const key of ["newsletter", "sale", "new_arrival", "announcement", "welcome", "cart", "thank_you"]) assert.ok(keys.has(key), `old key ${key} still exists`);
  for (const category of ["welcome", "festive", "abandoned_cart", "shipping", "review", "win_back", "birthday", "restock", "event"]) assert.ok(categories.has(category), `${category} has a starter`);
  assert.equal(library.nearestStarter("write a Sallah sale email for my store").key, "sallah");
  assert.equal(library.nearestStarter("Detty December promo").key, "detty_december");
  assert.equal(library.matchStarter("make it shorter"), null);
  assert.equal(library.nearestStarter("make it shorter").key, "newsletter");
  assert.equal(preview.previewSubject("Hi {{name}} from {{store}}", shop), "Hi Ada from Ada & Co");
});

test("Peggy's email drafts are tied to the real catalogue; the no-AI fallback uses the shop's products", () => {
  const products = [{ id: "p1", name: "Kaftan", price: "₦34,000", imageUrl: "https://cdn/k.jpg", url: "https://shop/product/p1" }];
  const grounded = ai.groundBlocks(
    [
      { type: "heading", text: "Sale" },
      { type: "products", items: [{ id: "p1", price: "₦1" }, { id: "made-up" }, { name: "kaftan" }] },
      { type: "products", items: [{ id: "nope" }] },
      { type: "image", url: "https://invented.example/x.jpg", alt: "x" },
      { type: "image", url: "https://cdn/k.jpg", alt: "Kaftan" },
      { type: "text", text: "  " },
    ],
    { products, images: ["https://cdn/k.jpg"] },
  );
  assert.deepEqual(grounded.map((b) => b.type), ["heading", "products", "image"]);
  assert.deepEqual(grounded[1].items[0], { name: "Kaftan", price: "₦34,000", imageUrl: "https://cdn/k.jpg", url: "https://shop/product/p1" }, "the real price wins");
  assert.equal(grounded[1].items.length, 2);

  const fallback = ai.fallbackDraft("Christmas email", products, false);
  assert.equal(fallback.starter, "Merry Christmas");
  const grid = fallback.blocks.find((b) => b.type === "products");
  assert.deepEqual(grid.items.map((i) => i.name), ["Kaftan"]);
  assert.equal(ai.fallbackDraft("Christmas email", [], false).blocks.some((b) => b.type === "products"), false, "no sample prices for a shop without products");
  assert.equal(ai.fallbackDraft("make it shorter", products, true), null, "edits need AI");
});

test("business hours work in Lagos time, including late openings, and say when the shop is back", () => {
  const rules = assistant.normaliseAutoReply({ hours: { enabled: true, days: { fri: { open: true, from: "18:00", to: "02:00" }, sat: { open: false }, sun: { open: false } } } });
  // 2026-10-12 is a Monday. 08:30 UTC = 09:30 Lagos.
  assert.equal(assistant.lagosClock(new Date("2026-10-12T08:30:00Z")).day, "mon");
  assert.equal(assistant.lagosClock(new Date("2026-10-12T08:30:00Z")).minutes, 9 * 60 + 30);
  assert.equal(assistant.isOpenNow(rules.hours, new Date("2026-10-12T08:30:00Z")), true);
  assert.equal(assistant.isOpenNow(rules.hours, new Date("2026-10-12T07:30:00Z")), false, "08:30 Lagos is before 9");
  assert.equal(assistant.nextOpening(rules.hours, new Date("2026-10-12T07:30:00Z")), "later today at 9am");
  assert.equal(assistant.nextOpening(rules.hours, new Date("2026-10-12T18:00:00Z")), "tomorrow at 9am");
  // Friday 23:00 and Saturday 01:00 Lagos are inside Friday's 18:00-02:00.
  assert.equal(assistant.isOpenNow(rules.hours, new Date("2026-10-16T22:00:00Z")), true);
  assert.equal(assistant.isOpenNow(rules.hours, new Date("2026-10-17T00:00:00Z")), true);
  assert.equal(assistant.isOpenNow(rules.hours, new Date("2026-10-17T02:00:00Z")), false);
  assert.equal(assistant.nextOpening(rules.hours, new Date("2026-10-17T10:00:00Z")), "on Monday at 9am");
  assert.equal(assistant.describeHours(rules.hours), "Mon-Thu 9am-6pm, Fri 6pm-2am");
  assert.equal(assistant.isOpenNow({ ...rules.hours, enabled: false }), true);
});

test("keyword quick replies match whole words and phrases; asking for a person is spotted", () => {
  const rules = assistant.normaliseAutoReply({
    keywordsEnabled: true,
    keywords: [
      { id: "price", keywords: "price, how much", reply: "Prices are on the store." },
      { id: "acct", keywords: ["Account Number"], reply: "We'll send our details." },
      { id: "bad", keywords: [], reply: "dropped" },
    ],
  });
  assert.equal(rules.keywords.length, 2);
  assert.equal(assistant.matchKeywordReply(rules, "Pls HOW MUCH is this?")?.id, "price");
  assert.equal(assistant.matchKeywordReply(rules, "send your account number abeg")?.id, "acct");
  assert.equal(assistant.matchKeywordReply(rules, "priceless vibes"), null, "whole words only");
  assert.equal(assistant.wantsHuman("Can I talk to a person?"), true);
  assert.equal(assistant.wantsHuman("I need a refund", ["refund"]), true);
  assert.equal(assistant.wantsHuman("Do you have size 42?"), false);
});

test("the auto-reply decision: chatbot, keywords, away with hours, instant reply, cooldown and channel switches", () => {
  const monday10 = new Date("2026-10-12T09:00:00Z");
  const sunday = new Date("2026-10-18T09:00:00Z");
  const rules = assistant.normaliseAutoReply({
    hours: { enabled: true },
    keywordsEnabled: true,
    keywords: [{ id: "price", keywords: ["price"], reply: "Prices are on the store." }],
    ack: { enabled: true, message: "Got it!" },
    channels: { sms: false },
  });
  const base = { enabled: true, mode: "message", awayMessage: "We're away.", rules, channel: "whatsapp", channelReplies: true, message: "hello", sellerOnline: false, lastAutoReplyAt: null, chatbot: false, now: monday10 };

  assert.deepEqual(assistant.decideAutoReply({ ...base, chatbot: true, channel: "livechat" }), { kind: "chatbot" });
  assert.equal(assistant.decideAutoReply({ ...base, channel: "sms" }), null, "switched off for SMS");
  assert.equal(assistant.decideAutoReply({ ...base, channelReplies: false }), null);
  assert.deepEqual(assistant.decideAutoReply({ ...base, message: "what's the PRICE" }), { kind: "keyword", ruleId: "price", body: "Prices are on the store." });
  assert.deepEqual(assistant.decideAutoReply({ ...base, message: "price", recentKeywordIds: ["price"] }), { kind: "ack", body: "Got it!" }, "each keyword reply once per 12 hours");
  assert.deepEqual(assistant.decideAutoReply(base), { kind: "ack", body: "Got it!" }, "open hours: instant reply");
  assert.deepEqual(assistant.decideAutoReply({ ...base, now: sunday }), { kind: "away", body: "We're away. We're back tomorrow at 9am.", peggy: false });
  assert.equal(assistant.decideAutoReply({ ...base, now: sunday, lastAutoReplyAt: new Date(sunday.getTime() - 3600_000) }), null, "12-hour cooldown");
  assert.equal(assistant.decideAutoReply({ ...base, enabled: false }), null, "master switch off");

  const legacy = { ...base, rules: assistant.normaliseAutoReply(null), mode: "peggy" };
  assert.deepEqual(assistant.decideAutoReply(legacy), { kind: "away", body: "We're away.", peggy: true }, "no hours: away while the seller is out");
  assert.equal(assistant.decideAutoReply({ ...legacy, sellerOnline: true }), null, "no hours: nothing while the seller is in");

  assert.equal(assistant.chatbotOnDuty({ enabled: true, when: "always" }, rules, true), true);
  assert.equal(assistant.chatbotOnDuty({ enabled: true, when: "outside_hours" }, rules, false, monday10), false);
  assert.equal(assistant.chatbotOnDuty({ enabled: true, when: "outside_hours" }, rules, false, sunday), true);
  assert.equal(assistant.chatbotOnDuty({ enabled: false, when: "always" }, rules, false), false);
});

test("chatbot settings are normalised with safe defaults", () => {
  const bot = assistant.normaliseChatbot({ enabled: true, name: "  ", tone: "rude", faqs: [{ q: "Custom sizes?", a: "Yes" }, { q: "", a: "x" }], handoff: { keywords: "Refund, refund, wholesale" }, when: "outside_hours", sources: { products: false } });
  assert.equal(bot.name, "Peggy");
  assert.equal(bot.tone, "friendly");
  assert.equal(bot.faqs.length, 1);
  assert.deepEqual(bot.handoff.keywords, ["refund", "wholesale"]);
  assert.equal(bot.when, "outside_hours");
  assert.deepEqual(bot.sources, { products: false, delivery: true, policies: true, faqs: true });
  assert.deepEqual(assistant.normaliseChatbot(null), assistant.DEFAULT_CHATBOT);
  assert.deepEqual(assistant.normaliseAutoReply(undefined), assistant.DEFAULT_AUTO_REPLY);
});
