// The phone app's Chats tab for every role (chats only, a filter row, partner chats merged into a seller's list,
// nothing opens the web) and Refer & earn on Rewards (GET /api/mobile/referrals). Pure helpers run directly.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chats = await import("../apps/mobile/src/lib/chats-pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mobile = (path) => read(`apps/mobile/src/${path}`);

const inboxItem = (patch) => ({ key: "c:1", source: "inbox", id: "1", channel: "whatsapp", name: "Ada", preview: "Hi", at: "2026-10-20T10:00:00Z", unread: 0, status: "open", avatarUrl: null, partner: null, ...patch });

test("seller chats: customers and partners in one list, newest first, each partner once", () => {
  const merged = chats.mergeSellerChats(
    [
      inboxItem({}),
      inboxItem({ key: "p:x", source: "partner", id: "conv", channel: "partner", name: "Kola Supplies", preview: "old", at: "2026-10-21T09:00:00Z", unread: 1, partner: { contactUserId: "u_sup", role: "supplier" } }),
      inboxItem({ key: "c:2", id: "2", name: "Bola", at: "2026-10-19T08:00:00Z", status: "closed" }),
    ],
    [
      { id: "u_sup", name: "Kola Supplies", kind: "supplier", lastMessage: "Restocked", lastMessageAt: "2026-10-22T09:00:00Z", unread: 3 },
      { id: "u_rider", name: "Swift Riders", kind: "logistics_partner", lastMessage: null, lastMessageAt: null, unread: 0 },
    ],
  );
  assert.deepEqual(merged.map((chat) => chat.name), ["Kola Supplies", "Ada", "Bola", "Swift Riders"]);
  const supplier = merged[0];
  assert.equal(supplier.kind, "partner");
  assert.equal(supplier.id, "u_sup", "opens the partner thread by the other user's id");
  assert.equal(supplier.preview, "Restocked");
  assert.equal(supplier.unread, 3);
  assert.equal(merged.filter((chat) => chat.id === "u_sup").length, 1);
  // Works with either half missing.
  assert.equal(chats.mergeSellerChats(null, [{ id: "u", name: "S", kind: "supplier", lastMessage: "x", lastMessageAt: null, unread: 0 }]).length, 1);
  assert.equal(chats.mergeSellerChats([inboxItem({})], null).length, 1);
});

test("seller chat filters: All, Customers, Riders, Suppliers, Unread (board A-Seller-Chats); done chats only when searching", () => {
  assert.deepEqual([...chats.SELLER_CHAT_FILTERS], ["all", "customers", "riders", "suppliers", "unread"]);
  const list = chats.mergeSellerChats(
    [inboxItem({ unread: 2 }), inboxItem({ key: "c:2", id: "2", name: "Bola", status: "closed", unread: 1 })],
    [
      { id: "u", name: "Kola", kind: "supplier", lastMessage: "Hi", lastMessageAt: "2026-10-01T00:00:00Z", unread: 0 },
      { id: "r", name: "Swift Riders", kind: "logistics_partner", lastMessage: "Picked up", lastMessageAt: "2026-09-30T00:00:00Z", unread: 0 },
    ],
  );
  const names = (filter, q) => list.filter((chat) => chats.sellerChatMatches(chat, filter, q)).map((chat) => chat.name);
  assert.deepEqual(names("all"), ["Ada", "Kola", "Swift Riders"]);
  assert.deepEqual(names("customers"), ["Ada"]);
  assert.deepEqual(names("riders"), ["Swift Riders"]);
  assert.deepEqual(names("suppliers"), ["Kola"]);
  // Old links with ?filter=partners still open both kinds.
  assert.deepEqual(names("partners"), ["Kola", "Swift Riders"]);
  assert.deepEqual(names("unread"), ["Ada"]);
  assert.deepEqual(names("all", "bola"), ["Bola"]);
  assert.equal(chats.asSellerChatFilter("partners"), "partners");
  assert.equal(chats.asSellerChatFilter("nope"), null);
});

test("supplier and delivery partner chats filter by the other side's role", () => {
  assert.deepEqual(chats.roleChatFilters("supplier"), ["all", "seller", "logistics_partner", "unread"]);
  // Delivery partners also see their riders' chats in the same list.
  assert.deepEqual(chats.roleChatFilters("logistics_partner"), ["all", "rider", "seller", "supplier", "unread"]);
  const contact = { name: "Ada Shop", role: "seller", unread: 0, lastMessage: "50 pairs" };
  assert.equal(chats.roleChatMatches(contact, "seller"), true);
  assert.equal(chats.roleChatMatches(contact, "supplier"), false);
  assert.equal(chats.roleChatMatches(contact, "unread"), false);
  assert.equal(chats.roleChatMatches(contact, "all", "pairs"), true);
  const words = read("shared/i18n/messages/m_partner/en.ts");
  assert.match(words, /"chats\.filter\.seller": "Shops"/);
  assert.match(words, /"chats\.filter\.logistics_partner": "Delivery partners"/);
});

test("Chats screens are chats only and never open the web", () => {
  const seller = mobile("app/(tabs)/chats.tsx");
  assert.match(seller, /fetchPartnerContacts\(\)/);
  assert.match(seller, /pathname: "\/partners\/\[id\]"/);
  assert.match(seller, /icon="settings"/);
  assert.doesNotMatch(seller, /Mascot|\/peggy"|partnersHint|list\.allHere/);
  assert.match(mobile("app/partners/index.tsx"), /<Redirect href=\{\{ pathname: "\/chats", params: \{ filter: "partners" \} \}\}/);
  assert.match(mobile("app/supplier/(tabs)/messages.tsx"), /<MessagesTab base="\/supplier" \/>/);
  for (const file of ["app/(tabs)/chats.tsx", "app/partners/[id].tsx", "app/partners/index.tsx", "components/PartnerMessages.tsx", "components/ChatList.tsx", "app/supplier/(tabs)/messages.tsx", "app/logistics/(tabs)/messages.tsx", "app/inbox/auto-replies.tsx", "app/inbox/chatbot.tsx"]) {
    assert.doesNotMatch(mobile(file), /openWeb|web=\{\{/, file);
  }
  // Opening hours, keyword replies and the chatbot's questions are edited in the app.
  assert.match(mobile("app/inbox/auto-replies.tsx"), /<HoursEditor\b/);
  assert.match(mobile("app/inbox/auto-replies.tsx"), /<PairsEditor\b/);
  assert.match(mobile("app/inbox/chatbot.tsx"), /<PairsEditor\b/);
});

test("Refer & earn on Rewards: link with Copy and Share, what you earn, who joined; never cash", () => {
  const route = read("src/app/api/mobile/referrals/route.ts");
  assert.match(route, /referralOverview\(user\.id\)/);
  assert.match(route, /https:\/\/app\.shopinbos\.com/);
  assert.match(route, /\["seller", "supplier", "logistics_partner"\]/);
  assert.match(mobile("lib/referrals.ts"), /optional\(api<Referrals>\("\/api\/mobile\/referrals"\)\)/);
  const card = mobile("components/familiar/ReferCard.tsx");
  assert.match(card, /Clipboard\.setStringAsync\(data\.link\)/);
  assert.match(card, /shareText\(/);
  assert.match(card, /if \(!data\) return null/);
  assert.match(mobile("app/rewards.tsx"), /<ReferCard \/>/);
  const words = read("shared/i18n/messages/m_familiar/en.ts");
  assert.match(words, /"ref\.noCash": "[^"]*never cash/);
  assert.match(mobile("lib/web.ts"), /"\/home\/refer": "\/rewards"/);
});
