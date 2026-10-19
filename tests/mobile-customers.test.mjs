// The Expo app's Customers screens (apps/mobile/src/app/customers): the list query and "Show more" paging, phone
// links, which way the seller can write to a customer (the same rules as the web drawer) and the message body sent
// to POST /api/app/customers/message. Pure helpers are loaded directly (Node strips the types).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pure = await import("../apps/mobile/src/lib/customers-pure.ts");
const web = await import("../src/lib/customers/pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("filters and sorts are the web's, and the list URL leaves the defaults out", () => {
  assert.deepEqual([...pure.CUSTOMER_FILTERS], [...web.CUSTOMER_FILTERS]);
  assert.deepEqual([...pure.CUSTOMER_SORTS], [...web.CUSTOMER_SORTS]);
  assert.equal(pure.customersPath({ q: "", show: "all", sort: "recent", page: 1 }), "/api/app/customers?limit=30");
  assert.equal(pure.customersPath({ q: "  Ada   O ", show: "vip", sort: "spent", page: 3 }), "/api/app/customers?q=Ada+O&show=vip&sort=spent&page=3&limit=30");
  // The server reads the same params the web page does.
  const parsed = web.parseCustomerListQuery(new URL(`http://x${pure.customersPath({ q: "Ada", show: "whatsapp", sort: "orders", page: 2 })}`).searchParams);
  assert.deepEqual(parsed, { page: 2, q: "Ada", show: "whatsapp", sort: "orders", customer: null });
});

test("Show more joins pages without showing anyone twice", () => {
  const row = (key) => ({ key, name: key, email: null, phone: null, orders: 1, spent: 0, badge: "new", firstAt: "", lastAt: "" });
  const stats = { customers: 3, returning: 0, orders: 3, counts: { all: 3, new: 3, returning: 0, vip: 0, whatsapp: 0 } };
  const first = { items: [row("a"), row("b")], page: 1, pages: 2, total: 3, currency: "NGN", stats };
  assert.equal(pure.hasMore(first), true);
  const joined = pure.joinPages(first, { ...first, items: [row("b"), row("c")], page: 2 });
  assert.deepEqual(joined.items.map((c) => c.key), ["a", "b", "c"]);
  assert.equal(pure.hasMore(joined), false);
  // A fresh first page replaces the list.
  assert.deepEqual(pure.joinPages(joined, first).items.map((c) => c.key), ["a", "b"]);
});

test("Call and WhatsApp links", () => {
  assert.equal(pure.whatsappLink("0803 123 4567"), "https://wa.me/2348031234567");
  assert.equal(pure.whatsappLink("+234 803 123 4567"), "https://wa.me/2348031234567");
  assert.equal(pure.whatsappLink("12345"), null);
  assert.equal(pure.whatsappLink(null), null);
  assert.equal(pure.callLink("+234 (803) 123-4567"), "tel:+2348031234567");
  assert.equal(pure.callLink(""), null);
  assert.equal(pure.money(12500.4), "₦12,500");
  assert.equal(pure.money(1200, "GHS"), "GHS 1,200");
});

function profile(overrides = {}) {
  return {
    key: "ada@example.com",
    name: "Ada",
    email: "ada@example.com",
    phone: "08031234567",
    place: null,
    currency: "NGN",
    stats: { orders: 1, paidOrders: 1, spent: 100, average: 100, firstAt: "", lastAt: "" },
    orders: [],
    emailChannel: { address: "ada@example.com", connected: true, provider: "gmail", from: "me@gmail.com", ready: true, recommended: null, setupHref: "/home/inbox/email", conversationId: null, messages: [], ...(overrides.emailChannel ?? {}) },
    whatsapp: {
      phone: "+2348031234567",
      composer: { mode: "template" },
      conversationId: null,
      messages: [],
      setupHref: "/home/inbox/chatbot?tab=whatsapp",
      templatesHref: "/home/marketing/templates",
      templates: [{ id: "t1", name: "order_update", language: "en", imageHeader: false, content: { header: { format: "NONE" }, body: "Hi {{1}}, from {{2}}" }, variables: [{ n: 1, key: "first_name", value: "Ada" }, { n: 2, key: "store_name", value: "Adire" }], preview: "Hi Ada, from Adire" }],
      ...(overrides.whatsapp ?? {}),
    },
  };
}

test("email: needs an address and a connected email, as on the web", () => {
  assert.deepEqual(pure.composerState(profile(), "email"), { kind: "write", channel: "email", subject: true });
  assert.equal(pure.composerState(profile({ emailChannel: { address: null } }), "email").reason, "noEmail");
  assert.equal(pure.composerState(profile({ emailChannel: { connected: false } }), "email").reason, "connectEmail");
  assert.equal(pure.composerState(profile({ emailChannel: { ready: false } }), "email").reason, "emailNotReady");
  // A thread already started: no subject box (replies keep the thread).
  assert.equal(pure.composerState(profile({ emailChannel: { messages: [{ id: "m" }] } }), "email").subject, false);
});

test("WhatsApp: free text in the 24-hour window, else an approved template, else a plain reason", () => {
  assert.deepEqual(pure.composerState(profile(), "whatsapp"), { kind: "template" });
  const free = profile({ whatsapp: { composer: { mode: "free", closesAt: "2026-10-15T12:00:00Z", templates: true } } });
  assert.equal(pure.composerState(free, "whatsapp").kind, "write");
  assert.equal(pure.composerState(free, "whatsapp").canUseTemplate, true);
  assert.equal(pure.composerState(free, "whatsapp", true).kind, "template");
  for (const [reason, expected] of [["no_phone", "noPhone"], ["not_connected", "waNotConnected"], ["no_account", "waNoAccount"], ["no_templates", "waNoTemplates"]]) {
    assert.equal(pure.composerState(profile({ whatsapp: { composer: { mode: "blocked", reason } } }), "whatsapp").reason, expected);
  }
  // Starts on email when it can be used; else WhatsApp.
  assert.equal(pure.firstChannel(profile()), "email");
  assert.equal(pure.firstChannel(profile({ emailChannel: { connected: false } })), "whatsapp");
});

test("the message body matches POST /api/app/customers/message", () => {
  const p = profile();
  assert.equal(pure.messageBody(p.key, pure.composerState(p, "email"), { body: "  " }), null);
  assert.deepEqual(pure.messageBody(p.key, pure.composerState(p, "email"), { subject: " Hi ", body: " Your bag is ready " }), { key: p.key, channel: "email", subject: "Hi", body: "Your bag is ready" });
  const free = profile({ whatsapp: { composer: { mode: "free", closesAt: null, templates: false } } });
  assert.deepEqual(pure.messageBody(p.key, pure.composerState(free, "whatsapp"), { body: "Hello" }), { key: p.key, channel: "whatsapp", body: "Hello" });
  const template = p.whatsapp.templates[0];
  assert.deepEqual(pure.messageBody(p.key, { kind: "template" }, { template, edits: ["", "My shop"] }), { key: p.key, channel: "whatsapp_template", templateId: "t1", params: ["Ada", "My shop"] });
  assert.equal(pure.templatePreview(template, ["Bola"]), "Hi Bola, from Adire");
  assert.equal(pure.messageBody(p.key, { kind: "blocked", reason: "noEmail" }, { body: "x" }), null);
  assert.equal(pure.sendErrorKey("OPTED_OUT"), "chat.err.OPTED_OUT");
  assert.equal(pure.sendErrorKey("SEND_FAILED"), "chat.err.sendFailed");
  assert.equal(pure.sendErrorKey("SOMETHING"), null);
  // Those keys exist in the web's customers words.
  const words = read("shared/i18n/messages/customers/en.ts");
  for (const code of pure.SEND_CODES) assert.match(words, new RegExp(`"chat\\.err\\.${code}"`), code);
});

test("Customers is in My shop, and the list route is the seller's own", () => {
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /id: "customers", label: "Customers", icon: "users", path: "app:\/customers"/);
  assert.match(read("apps/mobile/src/lib/web.ts"), /"\/home\/customers": "\/customers"/);
  const route = read("src/app/api/app/customers/route.ts");
  assert.match(route, /withSeller\(/);
  assert.match(route, /listCustomers\(store\.id, query, stats\.vip, limit\)/);
  // The detail screen messages through the same route the web drawer uses.
  assert.match(read("apps/mobile/src/lib/customers.ts"), /"\/api\/app\/customers\/message"/);
});
