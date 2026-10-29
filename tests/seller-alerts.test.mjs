// Seller alerts from the storefront: "someone is on your store" (push and the bell, once per store every 15 minutes)
// and a shopper starting a live chat (push, email and WhatsApp), the "Live chat and visitors" notification category,
// and the store's WhatsApp chat window that keeps shoppers on the store instead of sending them to wa.me.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const n = await import("../shared/notifications.ts");
const a = await import("../src/lib/storefront/seller-alerts.ts");
const wt = await import("../src/lib/notifications/whatsapp-templates.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("category: sellers get Live chat and visitors with push, email and WhatsApp on by default", () => {
  assert.ok(n.categoriesFor("seller").some((c) => c.key === "livechat"));
  for (const role of ["supplier", "logistics_partner", "admin"]) assert.ok(!n.categoriesFor(role).some((c) => c.key === "livechat"), role);
  const prefs = n.resolvePreferences([], "seller");
  assert.deepEqual(prefs.livechat, { push: true, email: true, sms: false, whatsapp: true });
  assert.equal(n.resolvePreferences([{ eventKey: "notify.livechat", push: true, email: false, sms: false, whatsapp: false }], "seller").livechat.whatsapp, false, "the seller can turn it off");
  assert.equal(n.eventInfo("livechat.started").category, "livechat");
  assert.equal(n.eventInfo("store.visitor").category, "livechat");
  assert.equal(n.androidChannelFor("livechat"), "messages");
});

test("delivery: a new live chat goes out on every channel; quiet hours hold the push and skip WhatsApp", () => {
  const prefs = n.resolvePreferences([], "seller");
  assert.deepEqual(n.planDelivery({ category: "livechat", urgent: false, prefs, quiet: false, email: "notification" }), { push: "send", email: true, sms: false, whatsapp: true });
  assert.deepEqual(n.planDelivery({ category: "livechat", urgent: false, prefs, quiet: true, email: "notification" }), { push: "hold", email: true, sms: false, whatsapp: false });
  // Visitor alerts: no email asked for and phoneHandled, so push only.
  assert.deepEqual(n.planDelivery({ category: "livechat", urgent: false, prefs, quiet: false, email: null, phoneHandled: true }), { push: "send", email: false, sms: false, whatsapp: false });
});

test("visitor alert: once per store per 15 minutes, with the count and where they came from", () => {
  const t0 = new Date(Date.UTC(2026, 9, 29, 10, 0));
  assert.equal(a.visitorAlertKey("s1", t0), a.visitorAlertKey("s1", new Date(t0.getTime() + 14 * 60_000)));
  assert.notEqual(a.visitorAlertKey("s1", t0), a.visitorAlertKey("s1", new Date(t0.getTime() + 15 * 60_000)));
  assert.notEqual(a.visitorAlertKey("s1", t0), a.visitorAlertKey("s2", t0));

  const one = a.visitorAlertText({ count: 1, source: "instagram", storeName: "Kemi's Fabrics", chatOn: true });
  assert.equal(one.title, "Someone is on your store");
  assert.match(one.description, /^Just arrived from Instagram\. They're looking around Kemi's Fabrics right now\./);
  assert.match(one.description, /comes to your inbox/);
  const many = a.visitorAlertText({ count: 3, source: "", storeName: "Kemi's Fabrics", chatOn: false });
  assert.equal(many.title, "3 people are on your store");
  assert.match(many.description, /Turn on live chat/);
  assert.equal(a.visitorAlertText({ count: 0, storeName: "S", chatOn: true }).title, "Someone is on your store");
  assert.doesNotMatch(a.visitorAlertText({ count: 1, source: "newsletter2", storeName: "S", chatOn: true }).description, /arrived/, "unknown sources aren't named");
});

test("live chat: first message, or the first after 6 hours, starts a chat; the alert says what they wrote", () => {
  const now = new Date(Date.UTC(2026, 9, 29, 12, 0));
  assert.equal(a.startsLiveChat({ isNew: true, lastInboundAt: null }, now), true);
  assert.equal(a.startsLiveChat({ isNew: false, lastInboundAt: new Date(now.getTime() - 5 * 60_000) }, now), false);
  assert.equal(a.startsLiveChat({ isNew: false, lastInboundAt: new Date(now.getTime() - 6 * 60 * 60_000) }, now), true);

  const chat = a.liveChatAlertText({ who: "Ada", preview: "Do you have size 42?", via: "chat", page: "/s/kemi/product/abc" });
  assert.equal(chat.title, "New live chat from Ada");
  assert.equal(chat.description, '"Do you have size 42?" (on /s/kemi/product/abc) Reply now while they\'re still on your store.');
  assert.equal(a.liveChatAlertText({ preview: "Hi", via: "whatsapp" }).title, "New WhatsApp chat on your store");
});

test("WhatsApp alert for a live chat uses the approved new-message template", () => {
  const base = { title: "New live chat from Ada", description: "Hi", url: "https://app.shopinbos.com/home/messages?c=1", name: "Kemi", business: "Kemi's Fabrics" };
  assert.equal(wt.notifyWhatsAppTemplate({ ...base, event: "livechat.started", category: "livechat" }).template.name, "shopinbos_new_message");
});

test("wiring: visit beacon, inbox and widget", () => {
  const visit = read("src/app/api/public/store/[slug]/visit/route.ts");
  assert.match(visit, /alertStoreVisit\(/, "the visit beacon alerts the seller");
  assert.match(visit, /isStoreOwner\(/, "not for the seller's own visits");
  const alerts = read("src/lib/storefront/seller-alerts.server.ts");
  assert.match(alerts, /event: "store\.visitor"/);
  assert.match(alerts, /phoneHandled: true/, "visitor alerts never go to WhatsApp or SMS");
  assert.doesNotMatch(alerts, /email: true/, "or email");

  const inbox = read("src/lib/inbox/service.ts");
  assert.match(inbox, /event: "livechat\.started"/);
  assert.match(inbox, /email: true/);

  const chat = read("src/app/api/public/store/[slug]/chat/route.ts");
  assert.match(chat, /via: z\.enum\(\["chat", "whatsapp"\]\)/);

  const widget = read("src/components/messaging/LiveChatWidget.tsx");
  assert.match(widget, /OPEN_STORE_WHATSAPP_EVENT/, "theme WhatsApp buttons open the window on the store");
  assert.match(widget, /via: wa \? "whatsapp" : "chat"/);
  assert.doesNotMatch(widget, /<a\s+href=\{whatsappHref\(config\.whatsappNumber, config\.whatsappGreeting\)\}\s+target="_blank"\s+rel="noopener noreferrer"\s+aria-label="Chat with us on WhatsApp"/, "the floating button no longer leaves the store");
  const theme = read("src/components/storefront/TemplateStorefrontSurface.tsx");
  assert.match(theme, /openStoreWhatsApp\(/);
  assert.doesNotMatch(theme, /window\.open\(`https:\/\/wa\.me\/\?text=/);
});
