// Customers list and drawer: the URL query (page, search, filter, sort, open customer), page numbers, VIP and
// badges, the customer key, the WhatsApp 24-hour rule for one-to-one messages, filling a template's variables
// for one customer, and the wiring that keeps the drawer's messages in the inbox. Pure TypeScript, Node strips
// the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const c = await import("../src/lib/customers/pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the list query comes from the URL, with safe defaults", () => {
  assert.deepEqual(c.parseCustomerListQuery({}), { page: 1, q: "", show: "all", sort: "recent", customer: null });
  assert.deepEqual(c.parseCustomerListQuery(new URLSearchParams("page=3&q=%20ada%20%20obi%20&show=vip&sort=spent&customer=ada@x.com")), {
    page: 3,
    q: "ada obi",
    show: "vip",
    sort: "spent",
    customer: "ada@x.com",
  });
  // Junk falls back instead of erroring.
  const junk = c.parseCustomerListQuery({ page: "-2", show: "everyone", sort: "cheapest", q: ["first", "second"] });
  assert.equal(junk.page, 1);
  assert.equal(junk.show, "all");
  assert.equal(junk.sort, "recent");
  assert.equal(junk.q, "first");
  assert.equal(c.parseCustomerListQuery({ page: "abc" }).page, 1);
  assert.equal(c.parseCustomerListQuery({ page: "2.9" }).page, 2);
  assert.equal(c.parseCustomerListQuery({ q: "x".repeat(300) }).q.length, 100);
  for (const show of ["all", "new", "returning", "vip", "whatsapp"]) assert.equal(c.parseCustomerListQuery({ show }).show, show);
  for (const sort of ["recent", "spent", "orders"]) assert.equal(c.parseCustomerListQuery({ sort }).sort, sort);
});

test("list links leave defaults out and keep the rest", () => {
  assert.equal(c.customerListHref({ page: 1, q: "", show: "all", sort: "recent", customer: null }), "/home/customers");
  assert.equal(c.customerListHref({ page: 2, q: "ada", show: "new", sort: "orders" }), "/home/customers?q=ada&show=new&sort=orders&page=2");
  assert.equal(c.customerListHref({ page: 1, customer: "ada@x.com" }), "/home/customers?customer=ada%40x.com");
  // Round trip.
  const query = { page: 4, q: "08031234567", show: "whatsapp", sort: "spent", customer: "2348031234567" };
  assert.deepEqual(c.parseCustomerListQuery(new URLSearchParams(c.customerListHref(query).split("?")[1])), query);
});

test("pages of 50, with page numbers around the current one", () => {
  assert.equal(c.CUSTOMERS_PAGE_SIZE, 50);
  assert.equal(c.pageCount(0), 1);
  assert.equal(c.pageCount(50), 1);
  assert.equal(c.pageCount(51), 2);
  assert.equal(c.pageCount(1000), 20);
  assert.deepEqual(c.pageNumbers(1, 1), [1]);
  assert.deepEqual(c.pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(c.pageNumbers(1, 20), [1, 2, "gap", 20]);
  assert.deepEqual(c.pageNumbers(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
  assert.deepEqual(c.pageNumbers(20, 20), [1, "gap", 19, 20]);
  // A one-page gap is filled with the page itself rather than "…".
  assert.deepEqual(c.pageNumbers(3, 20), [1, 2, 3, 4, "gap", 20]);
  assert.deepEqual(c.pageNumbers(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  // Out of range pages are clamped.
  assert.deepEqual(c.pageNumbers(99, 3), [1, 2, 3]);
});

test("search escapes LIKE wildcards and matches phone digits", () => {
  assert.equal(c.searchPattern("  "), null);
  assert.deepEqual(c.searchPattern("ada"), { like: "%ada%", digits: null });
  assert.deepEqual(c.searchPattern("50%_off\\"), { like: "%50\\%\\_off\\\\%", digits: null });
  // A local number with the trunk zero still finds +234…
  assert.deepEqual(c.searchPattern("0803 123 4567"), { like: "%0803 123 4567%", digits: "8031234567" });
  assert.equal(c.searchPattern("12").digits, null);
});

test("one key per customer: email, else phone digits, else name", () => {
  assert.equal(c.customerKey({ buyerEmail: " Ada@Example.COM ", buyerPhone: "+234 803", buyerName: "Ada" }), "ada@example.com");
  assert.equal(c.customerKey({ buyerEmail: "", buyerPhone: "+234 803-123-4567", buyerName: "Ada" }), "2348031234567");
  assert.equal(c.customerKey({ buyerEmail: "", buyerPhone: null, buyerName: " Mama Tobi " }), "name:mama tobi");
  assert.equal(c.customerKeyKind("ada@example.com"), "email");
  assert.equal(c.customerKeyKind("2348031234567"), "phone");
  assert.equal(c.customerKeyKind("name:mama tobi"), "name");
  // The SQL that groups orders uses the same rule.
  const sql = read("src/lib/customers/queries.server.ts");
  assert.match(sql, /COALESCE\(NULLIF\(lower\(btrim\("buyerEmail"\)\), ''\), NULLIF\(regexp_replace\(coalesce\("buyerPhone", ''\), '\[\^0-9\]', '', 'g'\), ''\), 'name:' \|\| lower\(btrim\("buyerName"\)\)\)/);
});

test("VIP: the top 10% by money spent, or 6+ orders in a small shop", () => {
  assert.deepEqual(c.vipRule(9, 50_000), { kind: "orders", min: 6 });
  assert.deepEqual(c.vipRule(10, 50_000), { kind: "spend", min: 50_000 });
  assert.deepEqual(c.vipRule(500, 0), { kind: "orders", min: 6 });
  assert.deepEqual(c.vipRule(500, null), { kind: "orders", min: 6 });
  const spend = c.vipRule(100, 40_000);
  assert.equal(c.customerBadge({ orders: 1, spent: 45_000 }, spend), "vip");
  assert.equal(c.customerBadge({ orders: 3, spent: 10_000 }, spend), "repeat");
  assert.equal(c.customerBadge({ orders: 1, spent: 10_000 }, spend), "new");
  const small = c.vipRule(3, 1_000);
  assert.equal(c.customerBadge({ orders: 6, spent: 0 }, small), "vip");
  assert.equal(c.customerBadge({ orders: 5, spent: 999_999 }, small), "repeat");
});

test("a WhatsApp number has 10 to 15 digits", () => {
  assert.equal(c.hasWhatsAppNumber("+234 803 123 4567"), true);
  assert.equal(c.hasWhatsAppNumber("08031234567"), true);
  assert.equal(c.hasWhatsAppNumber("12345"), false);
  assert.equal(c.hasWhatsAppNumber(null), false);
  assert.equal(c.hasWhatsAppNumber("1".repeat(16)), false);
});

test("WhatsApp: free text only inside the 24-hour window, else an approved template", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const base = { phone: "+2348031234567", connected: true, hasAccount: true, approvedTemplates: 2, now };
  const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000);

  const open = c.whatsAppComposer({ ...base, lastInboundAt: hoursAgo(2) });
  assert.equal(open.mode, "free");
  assert.equal(open.closesAt, "2026-10-16T10:00:00.000Z");
  assert.equal(open.templates, true);
  assert.equal(c.whatsAppComposer({ ...base, approvedTemplates: 0, lastInboundAt: hoursAgo(2) }).templates, false);
  // Just inside and just outside the window.
  assert.equal(c.whatsAppComposer({ ...base, lastInboundAt: hoursAgo(23.9) }).mode, "free");
  assert.deepEqual(c.whatsAppComposer({ ...base, lastInboundAt: hoursAgo(24) }), { mode: "template" });
  assert.deepEqual(c.whatsAppComposer({ ...base, lastInboundAt: hoursAgo(72) }), { mode: "template" });
  // Never messaged the store: the window was never open.
  assert.deepEqual(c.whatsAppComposer({ ...base, lastInboundAt: null }), { mode: "template" });
  assert.deepEqual(c.whatsAppComposer({ ...base, lastInboundAt: hoursAgo(30).toISOString() }), { mode: "template" });

  // Plain reasons instead of a dead button.
  assert.deepEqual(c.whatsAppComposer({ ...base, phone: "", lastInboundAt: hoursAgo(1) }), { mode: "blocked", reason: "no_phone" });
  assert.deepEqual(c.whatsAppComposer({ ...base, connected: false, lastInboundAt: hoursAgo(1) }), { mode: "blocked", reason: "not_connected" });
  assert.deepEqual(c.whatsAppComposer({ ...base, hasAccount: false, lastInboundAt: null }), { mode: "blocked", reason: "no_account" });
  assert.deepEqual(c.whatsAppComposer({ ...base, approvedTemplates: 0, lastInboundAt: null }), { mode: "blocked", reason: "no_templates" });
  // Inside the window, no business account is needed for free text.
  assert.equal(c.whatsAppComposer({ ...base, hasAccount: false, approvedTemplates: 0, lastInboundAt: hoursAgo(1) }).mode, "free");
});

test("template variables are filled with the customer's details, then the seller's edits", () => {
  const values = c.customerTemplateValues({
    name: "  Ada Obi ",
    storeName: "Adire House",
    storeLink: "https://adire.shopinbos.com",
    lastOrder: { orderNumber: "SIB-1042", total: "₦24,500", link: "https://adire.shopinbos.com/order/o1", trackingCode: null, trackingLink: null },
  });
  assert.equal(values.first_name, "Ada");
  assert.equal(values.store_name, "Adire House");
  assert.equal(values.order_number, "SIB-1042");
  assert.equal(values.tracking_code, "SIB-1042");
  assert.equal(values.tracking_link, "https://adire.shopinbos.com/order/o1");
  assert.equal(c.customerTemplateValues({ name: "Ada", storeName: "S", storeLink: "https://s" }).order_number, undefined);

  const template = {
    content: { header: { format: "TEXT", text: "Hello from {{2}}" }, body: "Hi {{1}}, your order {{3}} from {{2}} is on its way.", footer: "Reply STOP to opt out", buttons: [] },
    variables: ["first_name", "store_name", "order_number"],
  };
  const filled = c.fillCustomerTemplate(template, values);
  assert.deepEqual(filled.params, ["Ada", "Adire House", "SIB-1042"]);
  assert.equal(filled.count, 3);
  assert.deepEqual(filled.missing, []);
  assert.match(filled.text, /Hi Ada, your order SIB-1042 from Adire House is on its way\./);

  // The seller's edit wins; an empty edit keeps the default; newlines are flattened for Meta.
  const edited = c.fillCustomerTemplate(template, values, ["Mrs Obi\nplease", "", null]);
  assert.deepEqual(edited.params, ["Mrs Obi please", "Adire House", "SIB-1042"]);

  // A missing name becomes "there" (Meta refuses empty parameters) and is reported.
  const noName = c.fillCustomerTemplate(template, c.customerTemplateValues({ name: "", storeName: "Adire House", storeLink: "https://a" }));
  assert.equal(noName.params[0], "there");
  assert.deepEqual(noName.missing, ["first_name", "order_number"]);
});

test("the place comes from the delivery address, without repeats", () => {
  assert.equal(c.addressPlace({ street: "1 Allen Ave", city: "Ikeja", state: "Lagos", country: "Nigeria" }), "Ikeja, Lagos, Nigeria");
  assert.equal(c.addressPlace({ city: "Lagos", state: "lagos", country: "" }), "Lagos");
  assert.equal(c.addressPlace({}), null);
  assert.equal(c.addressPlace(null), null);
  assert.equal(c.readPrivateNote({ privateNote: "Likes evening delivery" }), "Likes evening delivery");
  assert.equal(c.readPrivateNote({ privateNote: 3 }), "");
  assert.equal(c.readPrivateNote(null), "");
});

test("drawer messages go through the inbox, on the customer's own threads, and every route checks the store", () => {
  const drawer = read("src/lib/customers/drawer.server.ts");
  // Reuses the inbox's send-and-record path and the inbound thread key (email address / E.164 phone).
  assert.match(drawer, /from "@\/lib\/inbox\/service"/);
  assert.match(drawer, /sendReply\(/);
  assert.match(drawer, /sendRecorded\(/);
  assert.match(drawer, /storeId_channel_externalThreadId/);
  assert.match(drawer, /normalisePhone\(contact\.phone\)/);
  // Every lookup starts from the seller's store.
  assert.match(drawer, /customerContact\(storeId, key\)/);
  const service = read("src/lib/inbox/service.ts");
  assert.match(service, /export async function sendRecorded/);
  assert.match(service, /return sendRecorded\(input,/);

  for (const route of ["profile", "message", "marketing"]) {
    const src = read(`src/app/api/app/customers/${route}/route.ts`);
    assert.match(src, /withSeller\(/, route);
    assert.match(src, /from "zod"/, route);
    assert.match(src, /userId: user\.id|sellerStore\(user\.id\)/, route);
  }
  assert.match(read("src/app/api/app/customers/message/route.ts"), /checkRateLimitShared\(/);

  // The page never loads every order: it pages in SQL.
  const page = read("src/app/home/customers/page.tsx");
  assert.doesNotMatch(page, /retailOrder\.findMany/);
  assert.match(read("src/lib/customers/queries.server.ts"), /LIMIT \$\{size\} OFFSET/);
});
