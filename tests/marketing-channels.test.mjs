// SMS and WhatsApp marketing: the SMS segment counter, WhatsApp template variables and validation, consent
// filtering, STOP / START handling, order-message rules, and automation step validation.
// Pure helpers only (src/lib/marketing/text-channels.ts, src/lib/marketing/flows.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tc = await import("../src/lib/marketing/text-channels.ts");
const flows = await import("../src/lib/marketing/flows.ts");
const config = await import("../src/lib/marketing/campaign-config.ts");

// ─── SMS segment counter ──────────────────────────────────────────────────────

test("plain GSM-7 text: 160 characters in one SMS, 153 per part after that", () => {
  assert.deepEqual(tc.smsSegments(""), { encoding: "GSM-7", units: 0, segments: 0, perSegment: 160, remaining: 160, unicodeChars: [] });
  const one = tc.smsSegments("a".repeat(160));
  assert.equal(one.encoding, "GSM-7");
  assert.equal(one.segments, 1);
  assert.equal(one.remaining, 0);
  assert.equal(tc.smsSegments("a".repeat(161)).segments, 2);
  assert.equal(tc.smsSegments("a".repeat(306)).segments, 2);
  assert.equal(tc.smsSegments("a".repeat(307)).segments, 3);
  assert.equal(tc.smsSegments("Ẹ").encoding, "UCS-2", "Yoruba dot-below letters aren't GSM-7");
  assert.equal(tc.smsSegments("Café £5 @ Ikeja! ¿Qué? Ñ ü").encoding, "GSM-7", "GSM-7 includes £ @ é ¿ Ñ ü");
});

test("GSM-7 extension characters count twice and never straddle two parts", () => {
  const euro = tc.smsSegments("€".repeat(80));
  assert.equal(euro.units, 160);
  assert.equal(euro.segments, 1);
  assert.equal(tc.smsSegments("€".repeat(81)).segments, 2);
  // 152 plain characters then a "{" (2 septets): it can't fit in the first part's last septet.
  const straddle = tc.smsSegments(`${"a".repeat(152)}{${"a".repeat(10)}`);
  assert.equal(straddle.units, 164);
  assert.equal(straddle.segments, 2);
  assert.equal(straddle.remaining, 153 - 12);
});

test("Unicode (emoji, curly quotes) switches the whole message to UCS-2: 70, then 67 per part", () => {
  const short = tc.smsSegments("Hi Ada 👋");
  assert.equal(short.encoding, "UCS-2");
  assert.equal(short.units, 9, "an emoji is two UTF-16 units");
  assert.deepEqual(short.unicodeChars, ["👋"]);
  assert.equal(tc.smsSegments("’".repeat(70)).segments, 1);
  assert.equal(tc.smsSegments("’".repeat(71)).segments, 2);
  assert.equal(tc.smsSegments("’".repeat(134)).segments, 2);
  assert.equal(tc.smsSegments("’".repeat(135)).segments, 3);
  // 66 units then an emoji (2 units) doesn't fit in the 67-unit part, so it moves on whole.
  assert.equal(tc.smsSegments(`${"’".repeat(66)}👋${"’".repeat(10)}`).segments, 2);
});

test("cost estimate only when a per-segment price is known", () => {
  assert.equal(tc.estimateSmsCost(2, 100, 4.5), 900);
  assert.equal(tc.estimateSmsCost(1, 3, 2.333), 7);
  assert.equal(tc.estimateSmsCost(2, 100, null), null);
  assert.equal(tc.estimateSmsCost(2, 100, 0), null);
  assert.equal(tc.estimateSmsCost(2, 100, undefined), null);
});

test("sender IDs: 3-11 letters or digits with at least one letter", () => {
  assert.equal(tc.validSenderId("ADIRE"), true);
  assert.equal(tc.validSenderId("Shop 24"), true);
  assert.equal(tc.validSenderId("AB"), false);
  assert.equal(tc.validSenderId("ABCDEFGHIJKL"), false);
  assert.equal(tc.validSenderId("12345"), false);
  assert.equal(tc.validSenderId("Adire-House"), false);
  assert.equal(tc.validSenderId(null), false);
});

// ─── WhatsApp templates ───────────────────────────────────────────────────────

const content = (body, extra = {}) => ({ header: { format: "NONE" }, body, buttons: [], ...extra });

test("template variables: {{1}}..{{n}} filled from the mapping, in order, with safe fallbacks", () => {
  const body = "Hi {{1}}, use {{3}} at {{2}} today. Shop: {{4}} now.";
  assert.deepEqual(tc.placeholders(body), [1, 3, 2, 4]);
  assert.equal(tc.variableCount(content(body)), 4);
  const values = { first_name: "Ada", store_name: "Adire House", discount_code: "DEC20", link: "https://adire.shopinbos.com" };
  const { params, missing } = tc.fillTemplateVariables(["first_name", "store_name", "discount_code", "link"], 4, values);
  assert.deepEqual(params, ["Ada", "Adire House", "DEC20", "https://adire.shopinbos.com"]);
  assert.deepEqual(missing, []);
  const empty = tc.fillTemplateVariables(["first_name", "product_link", "order_number"], 3, { link: "https://shop" });
  assert.deepEqual(empty.params, ["there", "https://shop", "-"], "a missing name becomes 'there', a missing link the shop link");
  assert.deepEqual(empty.missing, ["first_name", "product_link", "order_number"]);
  const messy = tc.fillTemplateVariables(["cart_items"], 1, { cart_items: "Kaftan × 1\nBag ×\t2       and more" });
  assert.equal(messy.params[0], "Kaftan × 1 Bag × 2   and more", "Meta refuses newlines, tabs and 4+ spaces");
});

test("template message for the Cloud API: body parameters, image header", () => {
  const message = tc.templateMessage({ name: "store_promo", language: "en", params: ["Ada", "DEC20"], headerImageUrl: "https://img.example/p.jpg" });
  assert.deepEqual(message, {
    type: "template",
    template: {
      name: "store_promo",
      language: { code: "en" },
      components: [
        { type: "header", parameters: [{ type: "image", image: { link: "https://img.example/p.jpg" } }] },
        { type: "body", parameters: [{ type: "text", text: "Ada" }, { type: "text", text: "DEC20" }] },
      ],
    },
  });
  assert.deepEqual(tc.templateMessage({ name: "hello", language: "en_GB", params: [] }), { type: "template", template: { name: "hello", language: { code: "en_GB" } } });
});

test("template components for Meta: samples for every variable, footer and buttons", () => {
  const preset = tc.presetTemplate("promo");
  const components = tc.toMetaComponents(preset.content, preset.variables, "4::aW1hZ2U=");
  assert.deepEqual(components[0], { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aW1hZ2U="] } });
  assert.equal(components[1].type, "BODY");
  assert.deepEqual(components[1].example.body_text[0], ["Ada", "Adire House", "ADIRE-20", "https://adire.shopinbos.com"]);
  assert.deepEqual(components.at(-1), { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Stop promotions" }] });
  const back = tc.fromMetaComponents(components);
  assert.equal(back.body, preset.content.body);
  assert.equal(back.header.format, "IMAGE");
  assert.deepEqual(back.buttons, [{ type: "QUICK_REPLY", text: "Stop promotions" }]);
  assert.equal(tc.renderTemplateText(content("Hi {{1}}, from {{2}}."), ["Ada", "Adire"]), "Hi Ada, from Adire.");
});

test("every ready-made template passes our own checks", () => {
  assert.deepEqual(tc.TEMPLATE_PRESETS.map((p) => p.key).sort(), ["abandoned_cart", "back_in_stock", "order_confirmation", "order_delivered", "order_shipped", "promo"]);
  for (const preset of tc.TEMPLATE_PRESETS) {
    const problems = tc.templateProblems({ name: preset.name, category: preset.category, language: "en", content: preset.content, variables: preset.variables });
    assert.deepEqual(problems, [], `${preset.key}: ${problems.join("; ")}`);
    assert.equal(preset.variables.length, tc.variableCount(preset.content), `${preset.key} maps every variable`);
    if (preset.category === "UTILITY") assert.ok(!/code|offer|sale|discount/i.test(preset.content.body), `${preset.key} stays transactional`);
  }
});

test("template validation catches what Meta would reject", () => {
  const ok = { name: "weekend_sale", category: "MARKETING", language: "en", content: content("Hi {{1}}, our sale at {{2}} starts now."), variables: ["first_name", "store_name"] };
  assert.deepEqual(tc.templateProblems(ok), []);
  assert.match(tc.templateProblems({ ...ok, name: "Weekend Sale" }).join(), /lowercase/);
  assert.match(tc.templateProblems({ ...ok, content: content("Hi {{1}}, sale at {{3}} now.") , variables: ["first_name", "store_name", "link"] }).join(), /\{\{2\}\} is missing/);
  assert.match(tc.templateProblems({ ...ok, content: content("{{1}}, our sale starts now.") }).join(), /start or end/);
  assert.match(tc.templateProblems({ ...ok, content: content("Our sale starts now {{1}}") }).join(), /start or end/);
  assert.match(tc.templateProblems({ ...ok, variables: ["first_name"] }).join(), /\{\{2\}\} is filled/);
  assert.match(tc.templateProblems({ ...ok, variables: ["first_name", "made_up"] }).join(), /\{\{2\}\} is filled/);
  assert.match(tc.templateProblems({ ...ok, category: "AUTHENTICATION" }).join(), /Marketing or Utility/);
  assert.match(tc.templateProblems({ ...ok, content: content("Hi {{1}}, sale at {{2}} now.", { buttons: [{ type: "URL", text: "Shop", url: "http://x.com" }] }) }).join(), /https/);
  assert.match(tc.templateProblems({ ...ok, content: content("x".repeat(1025)) , variables: [] }).join(), /1,024/);
  assert.equal(tc.templateName("Order Shipped! (v2)"), "order_shipped_v2");
});

test("stored template rows read back safely", () => {
  assert.deepEqual(tc.readTemplateContent(null), { header: { format: "NONE" }, body: "", buttons: [] });
  const row = tc.readTemplateContent({ header: { format: "TEXT", text: "Hi" }, body: "Body", footer: "F", buttons: [{ type: "URL", text: "Go", url: "https://a.b" }, { type: "PHONE", text: "x" }] });
  assert.equal(row.header.text, "Hi");
  assert.equal(row.buttons.length, 1);
  assert.deepEqual(tc.readVariables(["first_name", 3, "link"]), ["first_name", "", "link"]);
});

// ─── Consent ──────────────────────────────────────────────────────────────────

test("consent filtering: per channel, opted-out numbers dropped, one message per phone", () => {
  const contacts = [
    { phone: "+2348011111111", smsOk: true, whatsappOk: false, name: "SMS only" },
    { phone: "+2348022222222", smsOk: true, whatsappOk: true, name: "Both" },
    { phone: "+2348022222222", smsOk: true, whatsappOk: true, name: "Duplicate phone" },
    { phone: null, smsOk: true, whatsappOk: true, name: "No phone" },
    { phone: "+2348033333333", smsOk: false, whatsappOk: false, name: "Buyer, no opt-in" },
    { phone: "+2348044444444", smsOk: true, whatsappOk: true, name: "Said STOP on SMS" },
    { phone: "+2348055555555", smsOk: true, whatsappOk: true, name: "Stopped promotions on WhatsApp" },
  ];
  const optOuts = tc.optOutIndex([
    { phone: "+2348044444444", channel: "sms", scope: "all" },
    { phone: "+2348055555555", channel: "whatsapp", scope: "marketing" },
  ]);
  assert.deepEqual(tc.consentedForChannel(contacts, "sms", optOuts).map((c) => c.name), ["SMS only", "Both", "Stopped promotions on WhatsApp"]);
  assert.deepEqual(tc.consentedForChannel(contacts, "whatsapp", optOuts).map((c) => c.name), ["Both", "Said STOP on SMS"]);
});

test("order messages may use the checkout phone; a full STOP still blocks them, 'stop promotions' doesn't", () => {
  const optOuts = tc.optOutIndex([
    { phone: "+2348044444444", channel: "sms", scope: "all" },
    { phone: "+2348055555555", channel: "whatsapp", scope: "marketing" },
  ]);
  assert.deepEqual(tc.mayText({ channel: "sms", phone: "+2348011111111", purpose: "transactional", consent: false, optOuts }), { ok: true });
  assert.equal(tc.mayText({ channel: "sms", phone: "+2348011111111", purpose: "marketing", consent: false, optOuts }).ok, false);
  assert.equal(tc.mayText({ channel: "sms", phone: "+2348044444444", purpose: "transactional", consent: true, optOuts }).ok, false);
  assert.deepEqual(tc.mayText({ channel: "whatsapp", phone: "+2348055555555", purpose: "transactional", consent: false, optOuts }), { ok: true });
  assert.equal(tc.mayText({ channel: "whatsapp", phone: "+2348055555555", purpose: "marketing", consent: true, optOuts }).ok, false);
  assert.match(tc.mayText({ channel: "sms", phone: null, purpose: "transactional", consent: true, optOuts }).reason, /No phone/);
  // A marketing-only opt-out never downgrades an earlier full one.
  const both = tc.optOutIndex([{ phone: "+1", channel: "sms", scope: "all" }, { phone: "+1", channel: "sms", scope: "marketing" }]);
  assert.equal(tc.isOptedOut(both, "sms", "+1", "transactional"), true);
  assert.equal(tc.purposeOfTrigger("abandoned_checkout"), "transactional");
  assert.equal(tc.purposeOfTrigger("order_shipped"), "transactional");
  assert.equal(tc.purposeOfTrigger("win_back"), "marketing");
  assert.equal(tc.purposeOfTrigger("welcome_email"), "marketing");
});

test("buyers are no longer opted in to marketing texts just by checking out", () => {
  const source = readFileSync(new URL("../src/lib/marketing/contacts.ts", import.meta.url), "utf8");
  assert.ok(!/contact\.smsOk \|\|=/.test(source) && !/contact\.whatsappOk \|\|=/.test(source), "contacts.ts must not grant smsOk/whatsappOk from orders");
});

// ─── STOP / START ─────────────────────────────────────────────────────────────

test("STOP keywords: whole message only, SMS broader than WhatsApp", () => {
  assert.deepEqual(tc.optKeyword("STOP", "sms"), { action: "stop", scope: "all", keyword: "STOP" });
  assert.deepEqual(tc.optKeyword("  stop. ", "sms"), { action: "stop", scope: "all", keyword: "STOP" });
  assert.deepEqual(tc.optKeyword("Unsubscribe!", "whatsapp"), { action: "stop", scope: "all", keyword: "UNSUBSCRIBE" });
  assert.equal(tc.optKeyword("cancel", "sms").action, "stop");
  assert.equal(tc.optKeyword("cancel", "whatsapp"), null, "on WhatsApp 'cancel' is usually about an order");
  assert.equal(tc.optKeyword("please stop sending me these, I want to cancel my order", "sms"), null);
  assert.equal(tc.optKeyword("Don't stop", "sms"), null);
  assert.deepEqual(tc.optKeyword("Stop promotions", "whatsapp"), { action: "stop", scope: "marketing", keyword: "STOP PROMOTIONS" });
  assert.deepEqual(tc.optKeyword("START", "sms"), { action: "start", keyword: "START" });
  assert.equal(tc.optKeyword("", "sms"), null);
  assert.equal(tc.optKeyword(null, "whatsapp"), null);
});

test("the SMS and WhatsApp webhooks call the marketing hooks for STOP and receipts", () => {
  const sms = readFileSync(new URL("../src/app/api/webhooks/sms/[provider]/route.ts", import.meta.url), "utf8");
  const wa = readFileSync(new URL("../src/app/api/webhooks/whatsapp/route.ts", import.meta.url), "utf8");
  for (const [name, source] of [["sms", sms], ["whatsapp", wa]]) {
    assert.match(source, /marketingInboundHook\(/, `${name} webhook handles STOP`);
    assert.match(source, /marketingStatusHook\(/, `${name} webhook records delivery receipts`);
  }
});

// ─── Order messages ───────────────────────────────────────────────────────────

test("order statuses map to customer message events; settings default off", () => {
  assert.equal(tc.customerEventFor("paid"), "payment_received");
  assert.equal(tc.customerEventFor("shipped"), "order_shipped");
  assert.equal(tc.customerEventFor("delivered"), "order_delivered");
  assert.equal(tc.customerEventFor("order_confirmed"), "order_confirmed");
  assert.equal(tc.customerEventFor("processing"), null);
  assert.equal(tc.customerEventFor("cancelled"), null);
  const settings = tc.readTransactional({ order_shipped: { whatsapp: true, templateId: "t1" }, junk: true });
  assert.equal(settings.order_shipped.whatsapp, true);
  assert.equal(settings.order_shipped.sms, false);
  assert.equal(settings.order_shipped.templateId, "t1");
  assert.equal(settings.order_confirmed.whatsapp, false);
  assert.match(settings.order_shipped.smsText, /tracking/i, "default SMS text");
  for (const event of tc.CUSTOMER_EVENTS) assert.ok(tc.presetTemplate(event.preset), `${event.key} has a ready-made template`);
});

test("order code calls the notification hook with one line each", () => {
  const files = ["../src/lib/orders/update-status.ts", "../src/app/api/public/store/[slug]/checkout/route.ts", "../src/app/api/webhooks/paystack/route.ts"];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal((source.match(/notifyOrderCustomer\(/g) ?? []).length, 1, file);
  }
});

// ─── Automation steps ─────────────────────────────────────────────────────────

test("automation steps: WhatsApp template steps parse and validate", () => {
  const step = flows.parseStep({ type: "send_whatsapp", template: "tpl_1", variables: ["first_name", "cart_link", 5], headerImageUrl: "javascript:alert(1)" });
  assert.deepEqual(step, { type: "send_whatsapp", message: "", template: "tpl_1", variables: ["first_name", "cart_link", ""] }, "bad header URLs are dropped");
  assert.equal(flows.parseStep({ type: "send_whatsapp", message: "  " }), null, "needs a template or a message");
  assert.deepEqual(flows.parseStep({ type: "send_whatsapp", message: "Hi {{name}}" }), { type: "send_whatsapp", message: "Hi {{name}}" });
  assert.deepEqual(flows.parseStep({ type: "send_sms", message: "Hi", template: "x" }), { type: "send_sms", message: "Hi" });

  const templates = [
    { id: "tpl_1", status: "APPROVED", variableCount: 2 },
    { id: "tpl_2", status: "PENDING", variableCount: 0 },
  ];
  assert.deepEqual(flows.stepProblems({ type: "send_whatsapp", message: "", template: "tpl_1", variables: ["first_name", "cart_link"] }, { templates }), []);
  assert.match(flows.stepProblems({ type: "send_whatsapp", message: "", template: "tpl_1", variables: ["first_name"] }, { templates }).join(), /\{\{2\}\}/);
  assert.match(flows.stepProblems({ type: "send_whatsapp", message: "", template: "tpl_2", variables: [] }, { templates }).join(), /isn't approved/);
  assert.match(flows.stepProblems({ type: "send_whatsapp", message: "", template: "gone", variables: [] }, { templates }).join(), /deleted/);
  assert.deepEqual(flows.stepProblems({ type: "send_whatsapp", message: "", template: "preset:abandoned_cart", variables: [] }, { templates }), [], "ready-made references are checked at send time");
  assert.match(flows.stepProblems({ type: "send_whatsapp", message: "", template: "tpl_1", variables: ["a", "b"] }, { templates, whatsappTemplates: false }).join(), /Connect WhatsApp/);
  assert.deepEqual(flows.stepProblems({ type: "send_whatsapp", message: "Hi" }), []);
  assert.match(flows.stepWarnings({ type: "send_whatsapp", message: "Hi" }).join(), /24 hours/);
  assert.match(flows.stepProblems({ type: "send_sms", message: "x".repeat(481) }).join(), /480/);
  assert.match(flows.stepProblems({ type: "condition", check: "in_segment", segmentId: null }).join(), /segment/);
  assert.equal(flows.describeStep({ type: "send_whatsapp", message: "", template: "preset:order_shipped" }), "WhatsApp template (order shipped)");
});

test("ready-made flows include WhatsApp variants: cart → WhatsApp after 1h → email after a day", () => {
  const cart = flows.presetByKey("abandoned_cart_whatsapp");
  assert.ok(cart);
  assert.equal(cart.trigger, "abandoned_checkout");
  const types = cart.steps.map((s) => s.type);
  assert.deepEqual(types, ["wait", "condition", "condition", "send_whatsapp", "wait", "condition", "send_email"]);
  assert.equal(cart.steps[0].minutes, 60);
  assert.equal(cart.steps[0].minutes + cart.steps[4].minutes, 24 * 60);
  assert.equal(cart.steps[3].template, "preset:abandoned_cart");
  for (const preset of flows.FLOW_PRESETS) {
    for (const step of preset.steps) {
      if (step.type === "send_whatsapp" || step.type === "send_sms") assert.deepEqual(flows.parseStep(step), step, `${preset.key} text steps survive a save`);
      else assert.ok(flows.parseStep(step), `${preset.key} ${step.type} step parses`);
      if (step.type === "send_whatsapp" && step.template?.startsWith("preset:")) {
        const template = tc.presetTemplate(step.template.slice(7));
        assert.ok(template, `${preset.key} uses a known ready-made template`);
        assert.equal(step.variables.length, tc.variableCount(template.content), `${preset.key} maps every variable`);
      }
    }
  }
  assert.ok(flows.presetByKey("order_updates_whatsapp"));
  assert.ok(flows.presetByKey("win_back_whatsapp"));
  assert.ok(!flows.presetByKey("abandoned_cart").steps.some((s) => s.type === "send_whatsapp"), "the email cart flow no longer sends free-form WhatsApp outside the 24-hour window");
});

test("campaign channel config is cleaned", () => {
  assert.deepEqual(config.readChannelConfig({ senderId: "  ADIRE  ", templateId: "t", variables: ["first_name", 1], headerImageUrl: "http://x", productId: "", discountCode: " DEC20 " }), {
    senderId: "ADIRE",
    templateId: "t",
    variables: ["first_name", ""],
    headerImageUrl: null,
    productId: null,
    discountCode: "DEC20",
  });
  assert.deepEqual(config.readChannelConfig(null).variables, []);
});
