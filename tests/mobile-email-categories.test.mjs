// The phone app's Email channel card (apps/mobile/src/app/channels.tsx), email conversations in Chats
// (apps/mobile/src/app/(tabs)/chats.tsx, inbox/[id].tsx) and product categories (products tab chips and the
// product editor's category picker). Pure helpers are loaded directly (Node strips the types).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const channels = await import("../apps/mobile/src/lib/channels-pure.ts");
const inbox = await import("../apps/mobile/src/lib/inbox-pure.ts");
const categories = await import("../apps/mobile/src/lib/categories-pure.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const view = (patch = {}) => ({
  connected: false,
  provider: null,
  address: null,
  lastError: null,
  domain: null,
  gmail: null,
  ready: { google: true, encryption: true },
  ...patch,
});

test("email card: connected address, attention, a domain still waiting, or off", () => {
  assert.deepEqual(channels.emailCardState(view({ connected: true, provider: "gmail", address: "ada@gmail.com" })), { kind: "connected", provider: "gmail", address: "ada@gmail.com" });
  assert.deepEqual(channels.emailCardState(view({ connected: true, provider: "gmail", address: "ada@gmail.com", lastError: "invalid_grant" })), { kind: "attention", provider: "gmail", address: "ada@gmail.com" });
  assert.deepEqual(channels.emailCardState(view({ connected: true, provider: null, address: "ada@inbox.shopinbos.com" })), { kind: "connected", provider: "platform", address: "ada@inbox.shopinbos.com" });
  assert.deepEqual(channels.emailCardState(view({ domain: { name: "adashop.com", status: "pending" } })), { kind: "domainWaiting", domain: "adashop.com" });
  assert.deepEqual(channels.emailCardState(view({ domain: { name: "adashop.com", status: "verified" } })), { kind: "off" });
  assert.deepEqual(channels.emailCardState(view()), { kind: "off" });
});

test("email card: Gmail needs Google sign-in and the token lock; only a connected email disconnects", () => {
  assert.equal(channels.gmailAvailable(view()), true);
  assert.equal(channels.gmailAvailable(view({ ready: { google: false, encryption: true } })), false);
  assert.equal(channels.gmailAvailable(view({ ready: { google: true, encryption: false } })), false);
  assert.equal(channels.canDisconnectEmail({ kind: "connected", provider: "gmail", address: null }), true);
  assert.equal(channels.canDisconnectEmail({ kind: "attention", provider: "resend_domain", address: null }), true);
  assert.equal(channels.canDisconnectEmail({ kind: "off" }), false);
  assert.equal(channels.canDisconnectEmail({ kind: "domainWaiting", domain: "x.com" }), false);
});

test("Gmail connect and own-domain email open the web's routes, which exist", () => {
  assert.equal(channels.GMAIL_CONNECT_PATH, "/api/app/inbox/email/gmail/connect");
  assert.match(read("src/app/api/app/inbox/email/gmail/connect/route.ts"), /export const GET/);
  assert.match(read("src/app/api/app/inbox/email/route.ts"), /export const DELETE/);
  assert.equal(channels.EMAIL_SETUP_PATH, "/home/inbox/email");
  // Email from an own domain is set up on the website; the phone no longer links to it (web-only.tsx is admin only).
  assert.doesNotMatch(read("apps/mobile/src/app/web-only.tsx"), /emailDomain/);
  assert.doesNotMatch(read("apps/mobile/src/app/channels.tsx"), /what: "emailDomain"/);
});

test("email replies keep the web's Re: subject", () => {
  assert.equal(inbox.replySubject("Order #123"), "Re: Order #123");
  assert.equal(inbox.replySubject("RE: Order #123"), "RE: Order #123");
  assert.equal(inbox.replySubject("  "), null);
  assert.equal(inbox.replySubject(null), null);
  assert.equal(inbox.repliesByEmail("email"), true);
  assert.equal(inbox.repliesByEmail("form"), true);
  assert.equal(inbox.repliesByEmail("whatsapp"), false);
  // The web builds the same subject when it sends (src/lib/inbox/channels/email.ts).
  assert.match(read("src/lib/inbox/channels/email.ts"), /\/\^re:\/i\.test\(input\.subject\) \? input\.subject : `Re: \$\{input\.subject\}`/);
});

test("inbox search finds an email by its subject; chats without one still match as before", () => {
  const items = [
    { channel: "email", status: "open", unread: 0, name: "Ada", preview: "Hello", sub: "ada@x.com", subject: "Where is my bag?" },
    { channel: "whatsapp", status: "open", unread: 1, name: "Bola", preview: "Hi", sub: "+234" },
  ];
  assert.deepEqual(inbox.filterInbox(items, { view: "open", channel: "", q: "bag" }).map((i) => i.name), ["Ada"]);
  assert.deepEqual(inbox.filterInbox(items, { view: "open", channel: "", q: "hi" }).map((i) => i.name), ["Bola"]);
});

test("the inbox list sends each conversation's subject", () => {
  assert.match(read("src/lib/inbox/queries.ts"), /subject: c\.subject \?\? null/);
});

test("category chips: only ones with products, biggest first, then A–Z", () => {
  const chips = categories.categoryChips([
    { id: "a", name: "Shoes", slug: "shoes", productCount: 2 },
    { id: "b", name: "Bags", slug: "bags", productCount: 5 },
    { id: "c", name: "Caps", slug: "caps", productCount: 2 },
    { id: "d", name: "Empty", slug: "empty", productCount: 0 },
  ]);
  assert.deepEqual(chips.map((c) => c.id), ["b", "c", "a"]);
});

test("category picker: the shop's own first, then the rest, each once, searchable", () => {
  const own = [{ id: "2", name: "Shoes" }, { id: "1", name: "Bags" }];
  const all = [{ id: "3", name: "Accessories" }, { id: "1", name: "Bags" }, { id: "4", name: "Shirts" }];
  assert.deepEqual(categories.categoryOptions(own, all).map((c) => `${c.name}:${c.own}`), ["Bags:true", "Shoes:true", "Accessories:false", "Shirts:false"]);
  assert.deepEqual(categories.categoryOptions(own, all, "sh").map((c) => c.name), ["Shoes", "Shirts"]);
});

test("new category names: 2 to 60 characters, and a twin is picked instead of made", () => {
  assert.equal(categories.cleanCategoryName("  Wax   prints "), "Wax prints");
  assert.equal(categories.cleanCategoryName("a"), null);
  assert.equal(categories.cleanCategoryName("--"), null);
  assert.equal(categories.cleanCategoryName("x".repeat(61)), null);
  assert.deepEqual(categories.sameNameCategory([{ id: "1", name: "Shoes" }], " shoes "), { id: "1", name: "Shoes" });
  assert.equal(categories.sameNameCategory([{ id: "1", name: "Shoes" }], "Bags"), null);
});

test("the product editor gets the category and saves it with the web's update route", () => {
  assert.match(read("src/app/api/app/store-products/[id]/route.ts"), /categoryId: true/);
  assert.match(read("src/lib/schemas/index.ts"), /categoryId: z\.string\(\)\.optional\(\)/);
  assert.match(read("apps/mobile/src/app/product/[id].tsx"), /categoryId: category\.id/);
});
