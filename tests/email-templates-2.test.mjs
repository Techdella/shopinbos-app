// The second email template library: new blocks (heroes, countdowns, receipts, delivery steps, reviews,
// highlights, VIP card, points meter, games, style families), the 60+ starters, series and Peggy's grounding.
// Pure TypeScript, Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";

const blocks = await import("../src/lib/marketing/blocks.ts");
const { sanitizeEmailHtml } = await import("../src/lib/marketing/sanitize.ts");
const library = await import("../src/lib/marketing/template-library.ts");
const layout = await import("../src/lib/marketing/email-layout.ts");
const preview = await import("../src/lib/marketing/preview.ts");
const ai = await import("../src/lib/marketing/template-ai.ts");
const flows = await import("../src/lib/marketing/flows.ts");

const brand = { storeName: "Ada & Co", logoUrl: null, accent: "#123456", ink: "#111111", paper: "#F6F5F9" };
const shop = { name: "Ada & Co", url: "https://ada.shopinbos.com" };
const EVIL = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';

const RICH = [
  { type: "theme", theme: "luxe" },
  { type: "hero", layout: "full", imageUrl: "https://img.example/h.jpg", alt: EVIL, eyebrow: EVIL, heading: `Hi ${EVIL}`, text: EVIL, buttonLabel: EVIL, buttonUrl: "javascript:alert(1)" },
  { type: "hero", layout: "split", imageUrl: "javascript:alert(1)", alt: "x", eyebrow: "", heading: "Split", text: "", buttonLabel: "Go", buttonUrl: "{{store_url}}?play=spin" },
  { type: "hero", layout: "type", imageUrl: "", alt: "", eyebrow: "New", heading: "Big words", text: "Body", buttonLabel: "", buttonUrl: "" },
  { type: "banner", text: EVIL, variant: "dark" },
  { type: "countdown", variant: "boxes", title: EVIL, units: [{ value: "05", label: EVIL }], note: EVIL },
  { type: "countdown", variant: "pill", title: "Ends in", units: [{ value: "24", label: "hours" }], note: "" },
  { type: "countdown", variant: "bar", title: "Sale", units: [{ value: "02", label: "days" }], note: "" },
  { type: "receipt", title: EVIL, lines: [{ name: EVIL, detail: EVIL, amount: EVIL }], totals: [{ label: "Total", amount: "{{order_total}}" }], note: EVIL },
  { type: "steps", steps: ["A", EVIL, "C"], current: 1, note: EVIL },
  { type: "review", quote: EVIL, author: EVIL, rating: 4, detail: EVIL },
  { type: "features", items: [{ icon: "<b>", title: EVIL, text: EVIL }] },
  { type: "vip", tier: EVIL, title: EVIL, text: EVIL, perks: [EVIL], buttonLabel: "Go", buttonUrl: "javascript:alert(1)" },
  { type: "meter", title: EVIL, current: 450, goal: 1000, unit: EVIL, from: EVIL, to: EVIL, note: EVIL },
  { type: "game", game: "spin", title: EVIL, text: EVIL, prizes: [EVIL], value: "", buttonLabel: "Spin", buttonUrl: "{{store_url}}?play=spin" },
  { type: "game", game: "scratch", title: "S", text: "", prizes: [], value: EVIL, buttonLabel: "Reveal", buttonUrl: "vbscript:x" },
  { type: "game", game: "gift", title: "G", text: "", prizes: [], value: "", buttonLabel: "Open", buttonUrl: "{{store_url}}" },
  { type: "game", game: "draw", title: "D", text: "", prizes: [], value: EVIL, buttonLabel: "", buttonUrl: "" },
  { type: "coupon", code: "SAVE10", title: EVIL, note: EVIL, variant: "ticket", value: EVIL },
  { type: "coupon", code: "SAVE20", title: "T", note: "N", variant: "bold", value: "20% OFF" },
  { type: "products", items: [{ name: EVIL, price: "₦1", imageUrl: "https://img.example/p.jpg", url: "https://x.ng/p", was: EVIL, badge: EVIL }], columns: 3 },
  { type: "products", items: [{ name: "One", price: "₦2", imageUrl: "https://img.example/q.jpg", url: "https://x.ng/q" }], columns: 1 },
  { type: "divider", variant: "dots" },
  { type: "divider", variant: "accent" },
  { type: "button", label: "Outline", url: "{{store_url}}", variant: "outline" },
  { type: "footer", text: EVIL, unsubscribe: true, variant: "panel" },
];

test("new blocks escape text, drop unsafe links and contain no scripts or handlers", () => {
  // Built the way the builder saves: parsed (lengths capped) first.
  const html = blocks.htmlFromBlocks(blocks.parseBlocks(RICH));
  const body = html.replace(/^<!--sib-blocks:[^>]*-->\n/, "");
  assert.doesNotMatch(body, /<script|\son[a-z]+\s*=\s*"|javascript:|vbscript:|<svg|<iframe|<form/i, "no scripts, handlers or script links (escaped text is fine)");
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;&gt;/, "text is escaped, not dropped");
  assert.match(body, /href="{{store_url}}\?play=spin"/, "the shop link may carry a query for game pages");
  assert.match(body, /<!--sib-theme:luxe-->/);
  assert.match(body, /<!--sib-bleed-->/, "a full hero as the first visible block runs edge to edge");
  assert.equal((body.match(/<!--sib-bleed-->/g) ?? []).length, 1);
  assert.match(body, /border-color:{{brand_accent}} #FFE7B0/, "the spin wheel is drawn with CSS borders");
  assert.match(body, /SCRATCH HERE/);
  assert.match(body, /text-decoration:line-through/, "old prices are struck through");
  assert.match(body, /<td width="45%"/, "the meter fills 450 of 1000");
  assert.match(body, /★★★★<\/span><span style="color:#D9D4CC">★/, "four of five stars");
  assert.match(body, /<!--\[if mso\]>/, "Outlook gets ghost tables for columns");
  assert.equal(sanitizeEmailHtml(html), html, "the sanitiser leaves builder output untouched");
  assert.deepEqual(blocks.readBlocks(html), blocks.parseBlocks(RICH), "everything round-trips through the blocks comment");
  assert.equal(blocks.blocksToHtml(blocks.readBlocks(html)), body);
  assert.equal(blocks.readTheme(html), "luxe");
});

test("block parsing keeps variants valid, clamps numbers and leaves old blocks unchanged", () => {
  const parsed = blocks.parseBlocks([
    { type: "theme", theme: "neon" },
    { type: "hero", layout: "diagonal", heading: "H" },
    { type: "steps", steps: ["a", "b"], current: 9 },
    { type: "review", quote: "q", rating: 11 },
    { type: "meter", current: -5, goal: 0 },
    { type: "game", game: "slots" },
    { type: "coupon", code: "X", title: "", note: "", variant: "wavy" },
    { type: "divider" },
    { type: "button", label: "Go", url: "{{store_url}}" },
    { type: "countdown", units: Array.from({ length: 9 }, () => ({ value: "1234567890123456", label: "x" })) },
  ]);
  assert.equal(parsed[0].theme, "classic");
  assert.equal(parsed[1].layout, "full");
  assert.equal(parsed[2].current, 1);
  assert.equal(parsed[3].rating, 5);
  assert.deepEqual([parsed[4].current, parsed[4].goal], [0, 1]);
  assert.equal(parsed[5].game, "spin");
  assert.equal("variant" in parsed[6], false);
  assert.deepEqual(parsed[7], { type: "divider" }, "no variant key appears on old blocks");
  assert.deepEqual(parsed[8], { type: "button", label: "Go", url: "{{store_url}}" });
  assert.equal(parsed[9].units.length, 4);
  assert.equal(parsed[9].units[0].value.length, 12);
  assert.equal(blocks.safeUrl("{{store_url}}?play=spin"), "{{store_url}}?play=spin");
  assert.equal(blocks.safeUrl("{{name}}/x"), "", "only shop and cart links take a path");
  assert.equal(blocks.safeUrl('{{store_url}}?a="b'), "");
  // Classic emails keep exactly the markup they always had.
  assert.equal(blocks.blocksToHtml([{ type: "text", text: "Hi" }]), '<p style="margin:0 0 14px">Hi</p>');
});

test("the shell applies the style family, splits a full-bleed hero and keeps the brand", () => {
  const body = blocks.htmlFromBlocks([{ type: "theme", theme: "luxe" }, { type: "hero", layout: "full", imageUrl: "https://img.example/h.jpg", alt: "", eyebrow: "", heading: "Hello", text: "", buttonLabel: "", buttonUrl: "" }, { type: "text", text: "Body" }]);
  const html = layout.wrapEmail({ bodyHtml: body, brand });
  assert.match(html, /background:#08070A/, "luxury dark page");
  assert.match(html, /color-scheme" content="dark"/);
  assert.match(html, /padding:0;border-radius:18px 18px 0 0/, "the hero row has no padding");
  assert.match(html, /padding:6px 28px 30px/, "the rest is padded");
  assert.match(html, /@media only screen and \(max-width:480px\)/);
  const classic = layout.wrapEmail({ bodyHtml: "<p>x</p>", brand });
  assert.match(classic, /background:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#111111;border-radius:18px;padding:30px 28px/);
  assert.match(classic, /background:#F6F5F9/, "brand paper behind a classic card");
  const out = preview.renderEmailPreview({ bodyHtml: body, preheader: "Hi", brand, shop });
  assert.doesNotMatch(out, /sib-blocks:|sib-pre:|sib-theme:/, "previews drop the builder's bookkeeping comments");
});

test("every template renders, is unique, sanitiser-stable, and sits in a known category, journey and style", () => {
  const all = library.TEMPLATE_LIBRARY;
  assert.ok(all.length >= 48, `at least 18 + 30 templates (have ${all.length})`);
  const keys = new Set();
  const names = new Set();
  for (const tpl of all) {
    assert.ok(!keys.has(tpl.key), `${tpl.key} is unique`);
    assert.ok(!names.has(tpl.name), `${tpl.name} name is unique`);
    keys.add(tpl.key);
    names.add(tpl.name);
    assert.ok(tpl.key.length <= 40, `${tpl.key} fits the copy API`);
    assert.ok(tpl.category in library.TEMPLATE_CATEGORIES, `${tpl.key} category`);
    assert.ok(tpl.flow in library.TEMPLATE_FLOWS, `${tpl.key} journey`);
    assert.ok(blocks.EMAIL_THEMES.includes(tpl.style), `${tpl.key} style`);
    assert.equal(blocks.readTheme(tpl.bodyHtml), tpl.style, `${tpl.key} body carries its style`);
    assert.equal(sanitizeEmailHtml(tpl.bodyHtml), tpl.bodyHtml, `${tpl.key} survives the sanitiser`);
    const reopened = blocks.readBlocks(tpl.bodyHtml);
    assert.ok(reopened?.length, `${tpl.key} opens in the builder`);
    assert.equal(blocks.blocksToHtml(reopened), tpl.bodyHtml.replace(/^<!--sib-blocks:[^>]*-->\n/, ""), `${tpl.key} reopens without changes`);
    const html = preview.renderEmailPreview({ bodyHtml: tpl.bodyHtml, preheader: tpl.preheader, brand, shop });
    assert.doesNotMatch(html, /{{\s*\w+\s*}}/, `${tpl.key} has no unfilled merge tags`);
    assert.doesNotMatch(html, /<script|javascript:/i);
    for (const src of html.matchAll(/<img src="([^"]+)"/g)) assert.match(src[1], /^https:\/\/images\.unsplash\.com\/photo-\d+-[0-9a-f]+\?/, `${tpl.key} images come from Unsplash`);
    for (const href of html.matchAll(/href="([^"]+)"/g)) assert.match(href[1], /^(https:\/\/|#)/, `${tpl.key} link ${href[1]}`);
  }
  // Every journey has starters, and every style family is used.
  for (const flow of Object.keys(library.TEMPLATE_FLOWS)) assert.ok(all.some((tpl) => tpl.flow === flow), `${flow} has starters`);
  for (const style of blocks.EMAIL_THEMES) assert.ok(all.some((tpl) => tpl.style === style), `${style} is used`);
  // The brief's must-haves.
  for (const key of ["welcome_gift", "welcome_story", "welcome_last_chance", "cart_gentle", "cart_social_proof", "cart_last_chance", "checkout_abandoned", "browse_reminder", "price_drop", "low_stock", "order_confirmed", "shipped_tracking", "out_for_delivery", "delivered_review", "care_tips", "cross_sell", "replenish", "referral", "flash_sale", "bogo", "bundle_deal", "payday_sale", "black_friday", "sallah_flash", "easter", "independence_day", "back_to_school", "lookbook", "vip_early_access", "free_delivery", "spin_to_win", "scratch_reveal", "points_reward", "tier_up", "lucky_draw", "birthday_surprise", "one_order_gold", "win_back_cash", "sunset", "survey", "newsletter_editorial", "event_rsvp", "wholesale_quote", "wholesale_restock"]) {
    assert.ok(keys.has(key), `${key} exists`);
  }
  // Campaign emails only get {{name}}, {{store}}, {{store_url}} filled: flow-only tags stay in flow templates.
  const flowOnly = /{{\s*(cart_items|cart_total|cart_url|order_number|order_total|product_name|discount_code|full_name)\s*}}/;
  for (const tpl of all.filter((t) => ["promotions", "seasonal", "games", "news"].includes(t.flow))) assert.doesNotMatch(tpl.bodyHtml.replace(/^<!--sib-blocks:[^>]*-->\n/, ""), flowOnly, `${tpl.key} works as a campaign`);
});

test("series become automation drafts with waits, checks and a one-time code where promised", () => {
  for (const series of library.TEMPLATE_SERIES) {
    assert.ok(library.seriesTemplates(series).length === series.steps.length, `${series.key} templates exist`);
    for (const [i, step] of series.steps.entries()) {
      const tpl = library.TEMPLATE_LIBRARY.find((t) => t.key === step.template);
      assert.deepEqual(tpl.series, { key: series.key, step: i + 1 }, `${tpl.key} knows its place in the series`);
    }
    const draft = library.seriesAutomation(series.key);
    assert.ok(flows.TRIGGER_INFO[draft.trigger], `${series.key} trigger is real`);
    const steps = draft.steps.map(flows.parseStep);
    assert.ok(steps.every(Boolean), `${series.key} steps all parse`);
    assert.equal(steps.filter((s) => s.type === "send_email").length, series.steps.length);
    assert.ok(steps.length <= 20);
  }
  const cart = library.seriesAutomation("cart").steps;
  assert.deepEqual(cart.map((s) => s.type), ["wait", "condition", "send_email", "wait", "condition", "send_email", "wait", "condition", "give_discount", "send_email"]);
  assert.deepEqual(cart.filter((s) => s.type === "wait").map((s) => s.minutes), [60, 1380, 2880], "1 hour, 24 hours, 72 hours");
  assert.match(cart[9].bodyHtml, /{{discount_code}}/, "the last email shows the code the flow made");
  assert.doesNotMatch(cart[9].bodyHtml, />CART10</);
  assert.equal(library.seriesAutomation("nope"), null);
});

test("Peggy knows the new starters: Sallah flash sale, cart series, games; grounding keeps facts real", () => {
  assert.equal(library.nearestStarter("write a Sallah sale email for my store").key, "sallah");
  assert.equal(library.matchStarter("write a Sallah flash sale with a countdown").key, "sallah_flash");
  assert.equal(library.matchStarter("Black Friday email").key, "black_friday");
  assert.equal(library.matchStarter("spin to win email for my customers").key, "spin_to_win");
  assert.equal(library.matchStarter("payday promo").key, "payday_sale");
  assert.equal(library.matchStarter("wholesale quote follow up").key, "wholesale_quote");
  assert.equal(library.matchStarter("make it shorter"), null);
  assert.equal(ai.matchSeries("write a cart series for me").key, "cart");
  assert.equal(ai.matchSeries("welcome sequence").key, "welcome");
  assert.equal(ai.matchSeries("a cart email"), null);
  assert.equal(ai.fallbackDraft("write my abandoned cart series", [], false).starter, "Cart reminder 1: gentle (1 hour)");
  assert.match(ai.BLOCK_FORMAT, /"type":"game"/);
  assert.match(ai.STARTER_GUIDE, /Abandoned cart series/);
  assert.match(ai.STARTER_GUIDE, /Sallah flash sale/);

  const grounded = ai.groundBlocks(
    [
      { type: "theme", theme: "market" },
      { type: "hero", layout: "full", imageUrl: "https://invented.example/x.jpg", heading: "Big sale" },
      { type: "hero", layout: "split", imageUrl: "https://cdn/k.jpg", heading: "Kaftan" },
      { type: "hero", layout: "type", heading: "  " },
      { type: "products", items: [{ id: "p1", price: "₦1", was: "₦99", badge: "-99%" }], columns: 3 },
      { type: "countdown", variant: "pill", title: "Ends in", units: [{ value: "24", label: "hours" }] },
    ],
    { products: [{ id: "p1", name: "Kaftan", price: "₦34,000", imageUrl: "https://cdn/k.jpg", url: "https://shop/p1" }], images: ["https://cdn/k.jpg"] },
  );
  assert.deepEqual(grounded.map((b) => b.type), ["theme", "hero", "hero", "products", "countdown"]);
  assert.deepEqual([grounded[1].layout, grounded[1].imageUrl], ["type", ""], "an invented photo is dropped");
  assert.equal(grounded[2].imageUrl, "https://cdn/k.jpg");
  assert.deepEqual(grounded[3].items[0], { name: "Kaftan", price: "₦34,000", imageUrl: "https://cdn/k.jpg", url: "https://shop/p1" }, "no made-up old prices");
});
