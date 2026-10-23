// The seller screens of the "Familiar app" design (apps/mobile): Home's tour and checklist, Money straight to the
// bank, tracking links that stay unguessable, Discover's "Add to my shop" through the Dropship agreement, Peggy's
// reply drafts and the in-app shop looks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mobile = (path) => read(`apps/mobile/src/${path}`);

test("Home: level ring, Status, checklist, money card, shortcuts, Rex and Peggy, and a once-per-seller tour", () => {
  const home = mobile("app/(tabs)/home.tsx");
  for (const piece of ["<LevelPill ", "<StatusRow", "<Checklist", "<DarkCard", "<QuickActions", 'testID="home-ask-rex"', 'testID="home-ask-peggy"', "<Tour", "<StoryViewer"]) assert.ok(home.includes(piece), piece);
  for (const step of ['"tour.1.title"', '"tour.2.title"', '"tour.3.title"']) assert.ok(home.includes(step), step);
  // Done is remembered on the phone and on the account (preferences introsSeen).
  const lib = mobile("lib/seller-home.ts");
  assert.match(lib, /TOUR_INTRO = "app-home-tour"/);
  assert.match(lib, /introsSeen: \[TOUR_INTRO\]/);
  const words = read("shared/i18n/messages/m_home/en.ts");
  for (const line of ["Add things with +", "Money and shortcuts", "Ask Rex or Peggy", "Add your bank, so you can get paid", "Share your shop on WhatsApp"]) assert.ok(words.includes(line), line);
});

test("Money says what's coming to the bank: no balance, Withdraw or PIN", () => {
  const wallet = mobile("app/wallet.tsx");
  assert.match(wallet, /t\("w\.coming"\)/);
  assert.match(wallet, /upcomingPayout\(view\.settlements\)/);
  assert.doesNotMatch(wallet, /withdraw|wPin|Withdraw/);
  const words = read("shared/i18n/messages/m_money/en.ts");
  assert.ok(words.includes('"w.coming": "Coming to your bank"'));
  // The sales money ("w.*") is never held or withdrawn; only the separate prepaid wallet card ("bal.*",
  // components/WalletBalanceCard.tsx) has a balance to withdraw.
  const salesWords = words.split("\n").filter((line) => !line.trim().startsWith('"bal.')).join("\n");
  assert.doesNotMatch(salesWords, /held by|withdraw/i);
});

test("Share tracking sends the storefront order page (an unguessable id), never a map or the rider's place", () => {
  const route = read("src/app/api/app/orders/[id]/route.ts");
  assert.match(route, /trackingUrl: storeUrl\(store, `\/order\/\$\{order\.id\}`\)/);
  assert.doesNotMatch(route, /\/t\/|orderNumber\}/);
  const screen = mobile("app/order/[id].tsx");
  assert.match(screen, /order\.trackingUrl/);
  assert.doesNotMatch(screen, /MapView|latitude|riderLocation/);
  const delivery = read("src/app/api/mobile/delivery/orders/[orderId]/route.ts");
  assert.doesNotMatch(delivery, /lastLat|lastLng|latitude/);
});

test("Discover: swipe cards first; Add to my shop opens the product and its Dropship agreement", () => {
  const find = mobile("app/find/index.tsx");
  assert.match(find, /useState<"cards" \| "list">/);
  assert.match(find, /testID="find-add"[^\n]*router\.push\(\{ pathname: "\/find\/\[slug\]", params: \{ slug: current\.slug \} \}\)/);
  assert.doesNotMatch(find, /addToStore\(/, "never adds without the agreement");
  assert.match(mobile("lib/seller-home.ts"), /case "add_product":\n\s+if \(slug\) router\.push\(\{ pathname: "\/find\/\[slug\]"/);
});

test("Chats: filters by channel and Peggy's draft reply with Send and Edit", () => {
  const chats = mobile("app/(tabs)/chats.tsx");
  for (const key of ['"filter.all"', '"view.unread"', '"filter.whatsapp"', '"filter.instagram"', '"filter.facebook"']) assert.ok(chats.includes(key), key);
  const thread = mobile("app/inbox/[id].tsx");
  assert.match(thread, /suggestReply\(conversationId\)/);
  assert.match(thread, /t\("thread\.peggySend"\)/);
  assert.match(thread, /t\("thread\.peggyEdit"\)/);
  assert.match(mobile("lib/inbox.ts"), /\/suggest`, \{ method: "POST"/);
});

test("Shop looks are an app screen; Rex's credits top up by email, never a sale", () => {
  assert.match(mobile("app/(tabs)/shop.tsx"), /id: "themes"[^\n]+path: "app:\/templates"/);
  const looks = mobile("lib/templates.ts");
  for (const route of ['"/api/store/templates"', '"/api/store/templates/apply"', '"/api/store/templates/recommend"']) assert.ok(looks.includes(route), route);
  const rex = mobile("app/rex.tsx");
  assert.match(rex, /emailTopUp\(\)/);
  assert.match(rex, /fetchCredits\(\)/);
  assert.doesNotMatch(rex, /price list|₦\d/);
});
