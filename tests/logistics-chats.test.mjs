// A delivery partner's chats in one place (shared/logistics-chats.ts): riders next to shops and suppliers on the web
// Messages page (/logistics/inbox), the Today cards (web and phone), the phone's Chats tab, and the Riders app's
// "Messages" card. Pure helpers, deep links and the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const c = await import("../shared/logistics-chats.ts");
const n = await import("../shared/notifications.ts");

const at = (minutes) => new Date(Date.UTC(2026, 9, 30, 9, minutes)).toISOString();

test("rider threads: last message from the company's side, unread counts, recent first, idle riders after", () => {
  const riders = [
    { id: "r1", name: "Tunde Bello", phone: "0803", status: "active" },
    { id: "r2", name: "Ada Obi", status: "active" },
    { id: "r3", name: "Bayo", status: "inactive" },
    { id: "r4", name: "Chidi", status: "inactive" },
  ];
  const rows = [
    { riderId: "r1", body: "Old", fromRider: true, createdAt: new Date(at(1)), readAt: new Date(at(2)) },
    { riderId: "r1", body: "At the gate", fromRider: true, createdAt: new Date(at(5)), readAt: null },
    { riderId: "r3", body: "Thanks boss", fromRider: false, createdAt: new Date(at(3)), readAt: new Date(at(4)) },
  ];
  const list = c.riderThreadSummaries(riders, rows, new Map([["r1", 2]]));
  // Bayo left but keeps his chat; Chidi left with no chat and drops out; Ada (never messaged) goes last.
  assert.deepEqual(list.map((item) => item.riderId), ["r1", "r3", "r2"]);
  assert.deepEqual(list[0].last, { text: "At the gate", mine: false, createdAt: at(5), seen: false });
  assert.equal(list[0].unread, 2);
  assert.equal(list[0].phone, "0803");
  assert.deepEqual(list[1].last, { text: "Thanks boss", mine: true, createdAt: at(3), seen: true });
  assert.equal(list[1].active, false);
  assert.equal(list[2].last, null);
  assert.equal(list[2].unread, 0);
});

test("riders and conversations merge newest first; filters, search and chip counts", () => {
  const riders = [
    { riderId: "r1", name: "Tunde", phone: null, active: true, last: { text: "On my way", mine: false, createdAt: at(10), seen: false }, unread: 1 },
    { riderId: "r2", name: "Ada", phone: null, active: true, last: null, unread: 0 },
  ];
  const conversations = [
    { id: "c1", with: { name: "Kemi Store", role: "seller", logoUrl: "https://x/logo.png" }, lastMessage: { text: "Pickup at 3?", mine: false, createdAt: at(20), seen: false }, unread: 3, updatedAt: at(20) },
    { id: "c2", with: { name: "Lagos Textiles", role: "supplier", logoUrl: null }, lastMessage: { text: "Done", mine: true, createdAt: at(5), seen: true }, unread: 0, updatedAt: at(5) },
  ];
  const items = c.mergeChatList(conversations, riders);
  assert.deepEqual(items.map((item) => item.key), ["c:c1", "r:r1", "c:c2", "r:r2"]);
  assert.equal(items[0].kind, "seller");
  assert.equal(items[0].logoUrl, "https://x/logo.png");
  assert.equal(items[1].kind, "rider");
  assert.deepEqual(c.filterChatList(items, "rider").map((item) => item.id), ["r1", "r2"]);
  assert.deepEqual(c.filterChatList(items, "seller").map((item) => item.id), ["c1"]);
  assert.deepEqual(c.filterChatList(items, "supplier").map((item) => item.id), ["c2"]);
  assert.deepEqual(c.filterChatList(items, "unread").map((item) => item.id), ["c1", "r1"]);
  assert.deepEqual(c.filterChatList(items, "all", "on my").map((item) => item.id), ["r1"]);
  assert.deepEqual(c.filterChatList(items, "all", "textiles").map((item) => item.id), ["c2"]);
  assert.deepEqual(c.chatFilterCounts(items), { all: 4, rider: 1, seller: 3, supplier: 0, unread: 2 });
  assert.equal(c.totalUnread(items), 4);
  assert.deepEqual([...c.CHAT_FILTERS], ["all", "rider", "seller", "supplier", "unread"]);
});

test("the Today card: unread first, then the latest, only chats with messages, capped", () => {
  const items = [
    { key: "a", unread: 0, at: at(30) },
    { key: "b", unread: 2, at: at(10) },
    { key: "c", unread: 0, at: "" },
    { key: "d", unread: 1, at: at(20) },
    { key: "e", unread: 0, at: at(25) },
  ];
  assert.deepEqual(c.recentChats(items, 3).map((item) => item.key), ["d", "b", "a"]);
  assert.deepEqual(c.recentChats(items, 10).map((item) => item.key), ["d", "b", "a", "e"]);
  assert.deepEqual(c.recentChats([], 5), []);
});

test("bubbles group into runs by side and time", () => {
  const messages = [
    { id: "1", mine: false, createdAt: at(0) },
    { id: "2", mine: false, createdAt: at(2) },
    { id: "3", mine: true, createdAt: at(3) },
    { id: "4", mine: true, createdAt: at(30) },
  ];
  const runs = c.bubbleRuns(messages);
  assert.deepEqual(runs.get("1"), { first: true, last: false });
  assert.deepEqual(runs.get("2"), { first: false, last: true });
  assert.deepEqual(runs.get("3"), { first: true, last: true });
  assert.deepEqual(runs.get("4"), { first: true, last: true });
});

test("the rider's summary: company and each job's shop, unread from the other side only", () => {
  const rows = [
    { bookingId: null, audience: "company", body: "Come to the office", fromRider: false, createdAt: at(10), readAt: null },
    { bookingId: null, audience: "company", body: "OK", fromRider: true, createdAt: at(11), readAt: null },
    { bookingId: "job1", audience: "shop", body: "Is it fragile?", fromRider: true, createdAt: at(5), readAt: null },
    { bookingId: "job1", audience: "shop", body: "Yes, careful", fromRider: false, createdAt: at(6), readAt: null },
    { bookingId: "job2", audience: "shop", body: "Thanks", fromRider: false, createdAt: at(8), readAt: at(9) },
  ];
  const summary = c.riderInboxSummary(rows, "Swift Riders", new Map([["job1", "Kemi Store"], ["job2", "Ade Shoes"]]));
  assert.equal(summary.company.name, "Swift Riders");
  assert.equal(summary.company.unread, 1);
  assert.deepEqual(summary.company.last, { text: "OK", mine: true, createdAt: at(11) });
  assert.deepEqual(summary.shops.map((shop) => [shop.jobId, shop.name, shop.unread]), [["job2", "Ade Shoes", 0], ["job1", "Kemi Store", 1]]);
  assert.equal(summary.unread, 2);
  assert.equal(c.riderInboxSummary(rows, "X", {}, 1).shops.length, 1);
});

test("deep links: rider and conversation chats, the old couriers ?chat= link, and the phone", () => {
  assert.equal(c.riderInboxHref("rider_1"), "/logistics/inbox?rider=rider_1");
  assert.equal(c.conversationInboxHref("conv_1"), "/logistics/inbox?c=conv_1");
  assert.equal(c.chatHref({ kind: "rider", id: "r9" }), "/logistics/inbox?rider=r9");
  assert.equal(c.chatHref({ kind: "seller", id: "c9" }), "/logistics/inbox?c=c9");
  assert.equal(c.legacyRiderChatRedirect("rider_1"), "/logistics/inbox?rider=rider_1");
  assert.equal(c.legacyRiderChatRedirect(""), null);
  assert.equal(c.legacyRiderChatRedirect(undefined), null);
  assert.equal(c.legacyRiderChatRedirect("../x?y"), null);
  assert.equal(c.riderParam(" r1 "), "r1");
  assert.equal(c.riderParam("<script>"), null);
  // The phone opens the chat with that rider, from the new link and the old one.
  assert.deepEqual(n.appRouteFor("/logistics/inbox?rider=rider_1"), { pathname: "/logistics/team/chat/[id]", params: { id: "rider_1" } });
  assert.deepEqual(n.appRouteFor("/logistics/couriers?chat=rider_1"), { pathname: "/logistics/team/chat/[id]", params: { id: "rider_1" } });
  assert.deepEqual(n.appRouteFor("/logistics/inbox?c=c4"), { pathname: "/logistics/chat/[id]", params: { id: "c4" } });
  // "<rider> sent a message" now links to the Messages page.
  const server = read("src/lib/logistics/rider-messages.server.ts");
  assert.match(server, /link: `\/logistics\/inbox\?rider=\$\{data\.riderId\}`/);
  assert.doesNotMatch(server, /\/logistics\/couriers\?chat=/);
});

test("the server: thread lists with unread counts, the rider's summary and read ticks", () => {
  const server = read("src/lib/logistics/rider-messages.server.ts");
  assert.match(server, /export async function listRiderThreads\(partnerId: string\)/);
  assert.match(server, /distinct: \["riderId"\]/);
  assert.match(server, /fromRider: true, readAt: null/);
  assert.match(server, /export async function riderInbox\(/);
  assert.match(server, /read: mine \? Boolean\(row\.readAt\) : true/);
  const list = read("src/app/api/mobile/logistics/rider-chats/route.ts");
  assert.match(list, /withLogistics/);
  assert.match(list, /listRiderThreads\(partner\.id\)/);
  const summary = read("src/app/api/mobile/logistics/rider/messages/summary/route.ts");
  assert.match(summary, /riderFromToken\(req\.headers\.get\("x-rider-token"\)/);
  assert.match(summary, /riderInbox\(/);
  // The sidebar/top bar badge counts the riders' unread too for delivery partners.
  assert.match(read("src/app/api/conversations/unread/route.ts"), /user\.role === "logistics_partner" \? ridersUnread\(user\.id\)/);
});

test("the web: one Messages page with riders, shops and suppliers; Today card; Riders page button; nav", () => {
  const page = read("src/app/logistics/inbox/page.tsx");
  assert.match(page, /<LogisticsMessenger initial=\{initial\} \/>/);
  assert.match(page, /riderParam\(params\.rider\)/);
  const messenger = read("src/components/logistics/chats/LogisticsMessenger.tsx");
  assert.match(messenger, /"\/api\/mobile\/logistics\/rider-chats"/);
  assert.match(messenger, /"\/api\/conversations"/);
  assert.match(messenger, /mergeChatList\(conversations, riders\)/);
  assert.match(messenger, /CHAT_FILTERS\.map/);
  assert.match(messenger, /url\.searchParams\.set\("rider", next\.id\)/);
  assert.match(messenger, /<Thread/);
  assert.match(messenger, /<RiderThread/);
  const thread = read("src/components/logistics/chats/RiderThread.tsx");
  assert.match(thread, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(thread, /RIDER_THREAD_POLL_MS/);
  assert.match(thread, /groupByDay\(lines\)/);
  assert.match(thread, /bubbleRuns\(lines\)/);
  const today = read("src/app/logistics/dashboard/page.tsx");
  assert.match(today, /<MessagesCard items=\{chats\.items\}/);
  assert.match(read("src/components/logistics/chats/MessagesCard.tsx"), /href=\{chatHref\(item\)\}/);
  const nav = read("src/lib/nav.ts");
  assert.match(nav, /\{ id: "inbox", label: "Messages", icon: "chat", href: "\/logistics\/inbox", core: true \}/);
  assert.match(read("shared/i18n/messages/nav/en.ts"), /"logistics\.inbox": "Messages"/);
  // The web Riders app shows unread messages on Today.
  const riderApp = read("src/app/rider/[token]/RiderApp.tsx");
  assert.match(riderApp, /<RiderMessagesCard token=\{token\}/);
  assert.match(read("src/components/logistics/chats/RiderMessagesCard.tsx"), /\/api\/mobile\/logistics\/rider\/messages\/summary/);
});

test("the phone: riders in Chats with a Riders chip, the Jobs card and the Riders app card", () => {
  const tab = read("apps/mobile/src/components/PartnerMessages.tsx");
  assert.match(tab, /fetchRiderChats\(\)/);
  assert.match(tab, /pathname: "\/logistics\/team\/chat\/\[id\]"/);
  assert.match(tab, /rider: "chats\.filter\.rider"/);
  assert.match(read("apps/mobile/src/lib/logistics.ts"), /\/api\/mobile\/logistics\/rider-chats/);
  assert.match(read("apps/mobile/src/app/logistics/(tabs)/jobs.tsx"), /<LogisticsChatsCard \/>/);
  const card = read("apps/mobile/src/components/LogisticsChatsCard.tsx");
  assert.match(card, /recentChats\(all, limit\)/);
  assert.match(card, /router\.navigate\("\/logistics\/messages"\)/);
  const riderToday = read("apps/mobile/src/app/rider/(tabs)/index.tsx");
  assert.match(riderToday, /fetchRiderMessageSummary/);
  assert.match(riderToday, /params: \{ with: "shop", job: shop\.jobId/);
  assert.match(read("apps/mobile/src/lib/rider.ts"), /"\/messages\/summary"/);
});

test("new words exist in all five languages", () => {
  const sets = {
    logistics: ["chats.title", "chats.filter.rider", "chats.role.rider", "chats.card.title", "chats.riderMissing", "riders.messageShort"],
    rider: ["msgs.title", "msgs.new", "msgs.company", "msgs.shop"],
    m_rider: ["msgs.title", "msgs.new", "msgs.company", "msgs.shop"],
    m_partner: ["chats.filter.rider", "chat.role.rider", "chat.you", "home.chats", "home.chatsAll", "home.chatsUnread"],
    nav: ["logistics.inbox"],
  };
  for (const [ns, keys] of Object.entries(sets)) {
    for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
      const file = read(`shared/i18n/messages/${ns}/${lang}.ts`);
      for (const key of keys) assert.ok(file.includes(`"${key}":`), `${ns}/${lang} has ${key}`);
    }
  }
});
