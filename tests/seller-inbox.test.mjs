// The seller's one chat inbox (founder's plan item 8, shared/seller-inbox.ts): customers, suppliers, delivery partners
// and the riders on the shop's deliveries in one list on the web (/home/messages) and the phone (Chats), kind chips
// (Creators hidden until there are creator chats), each thread with the order or delivery it belongs to, voice notes.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const inbox = await import("../shared/seller-inbox.ts");
const chats = await import("../apps/mobile/src/lib/chats-pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const has = (path) => existsSync(new URL(`../${path}`, import.meta.url));

const job = (patch) => ({ id: "j1", status: "in_transit", orderId: "o1", updatedAt: "2026-10-20T08:00:00Z", rider: { name: "Musa Bello", phone: "0803" }, logisticsPartner: { displayName: "Swift" }, ...patch });

test("rider chats: one per job a rider has, with the order, last message from the shop's side, unread; newest first", () => {
  const list = inbox.shopRiderChats(
    [
      job({}),
      job({ id: "j2", orderId: null, updatedAt: "2026-10-21T08:00:00Z", rider: { name: "Ada" } }),
      // Finished: listed only with messages.
      job({ id: "j3", status: "delivered", updatedAt: "2026-10-22T08:00:00Z" }),
      job({ id: "j4", status: "delivered", updatedAt: "2026-10-18T08:00:00Z" }),
      // No rider yet: never listed.
      job({ id: "j5", rider: null }),
    ],
    [
      { bookingId: "j1", body: "At the gate", fromRider: true, createdAt: "2026-10-22T09:00:00Z", readAt: null },
      { bookingId: "j1", body: "older", fromRider: false, createdAt: "2026-10-20T09:00:00Z", readAt: null },
      { bookingId: "j4", body: "Delivered, thanks", fromRider: false, createdAt: "2026-10-19T09:00:00Z", readAt: "2026-10-19T10:00:00Z" },
    ],
    new Map([["j1", 2]]),
    [{ id: "o1", orderNumber: "SIB-1042", status: "paid", total: 12500, currency: "NGN" }],
  );
  assert.deepEqual(list.map((chat) => chat.jobId), ["j1", "j2", "j4"]);
  const [first, second, done] = list;
  assert.equal(first.riderName, "Musa Bello");
  assert.equal(first.company, "Swift");
  assert.equal(first.unread, 2);
  assert.deepEqual(first.last, { text: "At the gate", mine: false, createdAt: "2026-10-22T09:00:00Z", seen: false });
  assert.deepEqual(first.order, { id: "o1", number: "SIB-1042", status: "paid", total: 12500, currency: "NGN" });
  assert.equal(first.deliveryStatus, "in_transit");
  assert.equal(first.active, true);
  assert.equal(second.order, null);
  assert.equal(second.last, null);
  assert.equal(second.at, "2026-10-21T08:00:00Z", "no messages yet: when the job last changed");
  assert.equal(done.active, false);
  assert.equal(done.last.mine, true);
  assert.equal(done.last.seen, true);
});

test("kind chips: All, Customers, Suppliers, Delivery, Riders, Unread; Creators only with creator chats; counts", () => {
  const rows = [
    { kind: "customer", unread: 2 },
    { kind: "supplier", unread: 0 },
    { kind: "delivery", unread: 1 },
    { kind: "rider", unread: 3 },
  ];
  assert.deepEqual(inbox.sellerInboxChips(rows), ["all", "customer", "supplier", "delivery", "rider", "unread"]);
  assert.deepEqual(inbox.sellerInboxChips([...rows, { kind: "creator", unread: 0 }]), ["all", "customer", "supplier", "delivery", "rider", "creator", "unread"]);
  // The old partners page's filter shows only while picked.
  assert.ok(inbox.sellerInboxChips(rows, "partners").includes("partners"));
  const counts = inbox.sellerInboxCounts(rows);
  assert.equal(counts.all, 6);
  assert.equal(counts.unread, 3);
  assert.equal(counts.rider, 3);
  assert.equal(counts.partners, 1);
  assert.equal(counts.creator, 0);
  assert.equal(inbox.matchesSellerInboxFilter({ kind: "delivery", unread: 0 }, "partners"), true);
  assert.equal(inbox.matchesSellerInboxFilter({ kind: "rider", unread: 0 }, "partners"), false);
  assert.equal(inbox.matchesSellerInboxFilter({ kind: "rider", unread: 0 }, "unread"), false);
  assert.equal(inbox.partnerChatKind("logistics_partner"), "delivery");
  assert.equal(inbox.partnerChatKind("supplier"), "supplier");
  assert.equal(inbox.asSellerInboxFilter("riders"), "rider");
  assert.equal(inbox.asSellerInboxFilter("Customers"), "customer");
  assert.equal(inbox.asSellerInboxFilter("nope"), null);
});

test("links: rider chats, and the old partners page redirects into the one inbox", () => {
  assert.equal(inbox.riderChatHref("job_1"), "/home/messages?r=job_1");
  assert.equal(inbox.riderChatParam("job_1"), "job_1");
  assert.equal(inbox.riderChatParam("../x"), null);
  assert.equal(inbox.partnersPageRedirect({ c: "conv_2" }), "/home/messages?p=conv_2");
  assert.equal(inbox.partnersPageRedirect({ with: "sup1", ctx: "product:p9" }), "/home/messages?with=sup1&ctx=product%3Ap9");
  assert.equal(inbox.partnersPageRedirect({}), "/home/messages?kind=partners");
  assert.equal(inbox.partnersPageRedirect({ c: "<script>" }), "/home/messages?kind=partners");
});

test("the order a chat belongs to: customer's order in progress else the latest; partner chats' latest linked order/delivery", () => {
  const orders = [
    { id: "a", status: "delivered" },
    { id: "b", status: "paid" },
  ];
  assert.equal(inbox.chatOrder(orders).id, "b");
  assert.equal(inbox.chatOrder([{ id: "a", status: "delivered" }]).id, "a");
  assert.equal(inbox.chatOrder([]), null);
  assert.equal(inbox.chatOrder(null), null);
  const linked = inbox.chatLinkedContext([
    { context: { kind: "order", id: "o1", label: "Order 1" } },
    { context: { kind: "booking", id: "b1", label: "Delivery X" } },
    { context: { kind: "product", id: "p1", label: "Bag" } },
    { context: null },
  ]);
  assert.equal(linked.id, "b1", "the latest order or delivery, never a product");
  assert.equal(inbox.chatLinkedContext([{ context: { kind: "product", id: "p" } }]), null);
});

test("server and API: the shop's rider threads, the list route and the job context with the messages", () => {
  const server = read("src/lib/logistics/rider-messages.server.ts");
  assert.match(server, /export async function listShopRiderThreads\(sellerUserId: string\): Promise<ShopRiderChat\[\]>/);
  assert.match(server, /sellerId: sellerUserId, riderId: \{ not: null \}/);
  assert.match(server, /audience: "shop"/);
  assert.match(server, /export async function shopRiderJob\(/);
  const route = read("src/app/api/mobile/delivery/rider-chats/route.ts");
  assert.match(route, /withSeller\(async \(_req, \{ user \}\) => ok\(await listShopRiderThreads\(user\.id\)\)\)/);
  const messages = read("src/app/api/mobile/delivery/jobs/[id]/messages/route.ts");
  assert.match(messages, /return ok\(\{ messages, job \}\)/);
});

test("web: one inbox with every kind, chips, search and unread; each thread shows its order or delivery", () => {
  const page = read("src/app/home/messages/page.tsx");
  assert.match(page, /listShopRiderThreads\(user\.id\)/);
  assert.match(page, /initialRiders=\{riders\}/);
  assert.match(page, /asSellerInboxFilter\(params\?\.kind\)/);
  const ui = read("src/app/home/messages/UnifiedInbox.tsx");
  assert.match(ui, /\/api\/mobile\/delivery\/rider-chats/);
  assert.match(ui, /sellerInboxChips\(rows, kind\)/);
  assert.match(ui, /sellerInboxCounts\(rows\)/);
  assert.match(ui, /<PartnerPane/);
  assert.match(ui, /<RiderPane/);
  assert.match(ui, /<InboxThread/);
  // Deep links keep working: ?c= customer, ?p= partner, ?r= rider, ?with= starts a partner chat.
  for (const key of ['"c"', '"p"', '"r"', '"with"', '"kind"']) assert.ok(ui.includes(key), key);
  assert.ok(!has("src/app/home/messages/PartnerThread.tsx"), "partner chats use the full conversation thread now");
  assert.match(read("src/app/home/messages/partners/page.tsx"), /redirect\(partnersPageRedirect\(await searchParams\)\)/);
  // Context bars.
  assert.match(read("src/app/home/messages/InboxThread.tsx"), /<OrderBar orders=\{data\.customer\.orders\} \/>/);
  assert.match(read("src/app/home/messages/PartnerPane.tsx"), /contextBar \/>/);
  assert.match(read("src/components/conversations/Thread.tsx"), /chatLinkedContext\(messages\)/);
  const rider = read("src/app/home/messages/RiderPane.tsx");
  assert.match(rider, /\/api\/mobile\/delivery\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/messages/);
  assert.match(rider, /<ChatContextBar order=/);
  assert.match(read("src/components/messaging/ChatContextBar.tsx"), /href=\{`\/home\/orders\/\$\{order\.id\}`\}/);
});

test("voice notes in every chat kind: the mic writes it down and sends; customers' audio plays", () => {
  // Web: customer thread (audio attachments play), partner thread and rider thread have the mic.
  const customer = read("src/app/home/messages/InboxThread.tsx");
  assert.match(customer, /<VoiceInputButton/);
  assert.match(customer, /<audio key=\{index\} controls/);
  assert.match(read("src/components/conversations/Thread.tsx"), /<VoiceInputButton variant="icon"[^>]*onSpoken/);
  assert.match(read("src/components/logistics/chats/RiderThread.tsx"), /\{voice && <VoiceInputButton variant="icon"[^>]*onSpoken=\{\(spoken\) => send\(spoken\)\}/);
  // Phone: the composer's mic everywhere the person has an account; riders (no account) don't get it.
  assert.match(read("apps/mobile/src/components/RiderChat.tsx"), /voice = false/);
  assert.match(read("apps/mobile/src/app/delivery/rider-chat.tsx"), /\n\s+voice\n/);
  assert.doesNotMatch(read("apps/mobile/src/app/rider/chat.tsx"), /\bvoice\b/);
  const thread = read("apps/mobile/src/app/inbox/[id].tsx");
  assert.match(thread, /<VoiceNoteBubble/);
  assert.match(read("apps/mobile/src/components/ChatContextBar.tsx"), /\/api\/app\/inbox\/media\/\$\{encodeURIComponent\(messageId\)\}\/\$\{index\}`, headers: await authHeader\(\)/);
});

test("phone: Chats lists riders too, with Delivery and Riders chips, and opens each kind's own screen with its context", () => {
  assert.deepEqual([...chats.SELLER_CHAT_FILTERS], ["all", "customers", "suppliers", "delivery", "riders", "unread"]);
  const list = chats.mergeSellerChats(
    [{ key: "c:1", source: "inbox", id: "1", channel: "whatsapp", name: "Ada", preview: "Hi", at: "2026-10-20T10:00:00Z", unread: 0, status: "open", avatarUrl: null, partner: null }],
    [{ id: "u", name: "Swift Logistics", kind: "logistics_partner", lastMessage: "Ok", lastMessageAt: "2026-10-19T00:00:00Z", unread: 0 }],
    [{ jobId: "j1", riderName: "Musa", deliveryStatus: "in_transit", order: { id: "o1", number: "SIB-1042" }, last: { text: "At the gate" }, unread: 1, at: "2026-10-21T10:00:00Z" }],
  );
  assert.deepEqual(list.map((chat) => chat.name), ["Musa", "Ada", "Swift Logistics"]);
  const rider = list[0];
  assert.equal(rider.kind, "rider");
  assert.equal(rider.id, "j1");
  assert.equal(rider.order.number, "SIB-1042");
  const names = (filter, q) => list.filter((chat) => chats.sellerChatMatches(chat, filter, q)).map((chat) => chat.name);
  assert.deepEqual(names("riders"), ["Musa"]);
  assert.deepEqual(names("delivery"), ["Swift Logistics"]);
  assert.deepEqual(names("all", "sib-1042"), ["Musa"]);
  assert.deepEqual(chats.sellerChatFilters(list), ["all", "customers", "suppliers", "delivery", "riders", "unread"]);
  assert.ok(chats.sellerChatFilters([...list, { kind: "creator" }]).includes("creators"));
  assert.equal(chats.asSellerChatFilter("riders"), "riders");
  const tab = read("apps/mobile/src/app/(tabs)/chats.tsx");
  assert.match(tab, /fetchRiderChats\(\)/);
  assert.match(tab, /pathname: "\/delivery\/rider-chat", params: \{ job: chat\.id, name: chat\.name \}/);
  assert.match(read("apps/mobile/src/lib/delivery.ts"), /"\/api\/mobile\/delivery\/rider-chats"/);
  // Each thread shows its order or delivery at the top.
  assert.match(read("apps/mobile/src/components/ChatScreen.tsx"), /\{context\}/);
  assert.match(read("apps/mobile/src/app/delivery/rider-chat.tsx"), /<ChatContextBar order=\{context\.order\} deliveryStatus=\{context\.deliveryStatus\}/);
  assert.match(read("apps/mobile/src/app/partners/[id].tsx"), /chatLinkedContext\(messages\.data \?\? \[\]\)/);
  assert.match(read("apps/mobile/src/app/inbox/[id].tsx"), /chatOrder\(data\?\.customer\?\.orders\)/);
});

test("words: the new chips, bars and voice notes exist in every language", () => {
  const web = ["uni.chip.rider", "uni.chip.creator", "uni.kind.delivery", "uni.ctx.orderLine", "uni.ctx.linkHint", "uni.noRiders"];
  const phone = ["chats.delivery", "chats.creators", "chats.riderOn", "ctx.orderLine", "ctx.job.in_transit", "voice.play"];
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const w = read(`shared/i18n/messages/inbox/${locale}.ts`);
    for (const key of web) assert.ok(w.includes(`"${key}":`), `inbox/${locale}: ${key}`);
    const p = read(`shared/i18n/messages/m_chats/${locale}.ts`);
    for (const key of phone) assert.ok(p.includes(`"${key}":`), `m_chats/${locale}: ${key}`);
  }
});
