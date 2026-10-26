// The Expo app follows the build spec's section 8A "Simplicity rules": four tabs and a "+" sheet for sellers, Home
// with at most three "Do these next" items, the supplier app's four tabs, big clear buttons and plain dates and
// amounts. Feature names keep their standard commerce terms (Segments, Campaigns, Domain, Dropship, Quotes…).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../apps/mobile/src/", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

const home = await import("../apps/mobile/src/lib/home-pure.ts");
const supplier = await import("../apps/mobile/src/lib/supplier-pure.ts");
const friendly = await import("../apps/mobile/src/lib/friendly.ts");
const setupWords = await import("../apps/mobile/src/lib/setup-words.ts");

// ─── Structure ───────────────────────────────────────────────────────────────

test("seller tab bar: exactly Home, Orders, Chats, My shop, with the + in the middle", () => {
  const layout = read("app/(tabs)/_layout.tsx");
  const tabs = layout.slice(layout.indexOf("export const TABS"), layout.indexOf("];", layout.indexOf("export const TABS")));
  assert.deepEqual([...tabs.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["Home", "Orders", "Chats", "My shop"]);
  assert.deepEqual([...tabs.matchAll(/name: "([^"]+)"/g)].map((match) => match[1]), ["home", "orders", "chats", "shop"]);
  // The "+" sits between the first two tabs and the last two, and opens the create sheet.
  assert.match(layout, /plus=\{\{[^}]*testID: "create-button"/);
  // iPhone: the orange "+" between the first half of the tabs and the rest; Android: a floating button.
  assert.match(read("components/TabBar.tsx"), /items\.slice\(0, half\)[\s\S]*plus\.testID[\s\S]*items\.slice\(half\)/);
  assert.match(layout, /<CreateSheet /);
  // Old routes stay reachable but aren't in the bar.
  assert.match(layout, /name="products" options=\{\{ href: null \}\}/);
  assert.match(layout, /name="more" options=\{\{ href: null \}\}/);
  assert.match(read("app/(tabs)/more.tsx"), /<Redirect href="\/shop" \/>/);
  for (const name of ["home", "orders", "chats", "shop", "products", "more"]) assert.ok(existsSync(join(root, "app/(tabs)", `${name}.tsx`)), name);
});

test("the + sheet: Add a product, Record a sale, Send a pay link", () => {
  const sheet = read("components/CreateSheet.tsx");
  // The three titles are m_home catalog keys, shown in the app language ("Seller app" prototype sh.create).
  assert.match(sheet, /CREATE_ACTIONS = \["create\.addProduct", "create\.recordSale", "create\.payLink"\] as const/);
  const words = readFileSync(join(root, "../../../shared/i18n/messages/m_home/en.ts"), "utf8");
  for (const [key, title] of [["addProduct", "Add a product"], ["recordSale", "Record a sale"], ["payLink", "Send a pay link"]]) assert.ok(words.includes(`"create.${key}": "${title}"`), title);
  for (const index of [0, 1, 2]) assert.match(sheet, new RegExp(`title=\\{t\\(CREATE_ACTIONS\\[${index}\\]\\)\\}`));
  for (const path of ["/add-products", "/record-sale", "/payment-links/new"]) assert.match(sheet, new RegExp(`go\\("${path}"\\)`));
  // "Familiar app": Make a post or reel with Rex comes first.
  assert.ok(sheet.indexOf('go("/create")') < sheet.indexOf('go("/add-products")'), "Make a post first");
  assert.ok(words.includes('"create.post": "Make a post or reel"'));
});

test("My shop groups everything else by goal: Sell; Money and delivery; Look; You", () => {
  const shop = read("app/(tabs)/shop.tsx");
  const titles = [...shop.matchAll(/title: "([^"]+)",\n\s+links:/g)].map((match) => match[1]);
  assert.deepEqual(titles, ["Sell", "Money and delivery", "Look", "You"]);
  // Web address and Packaging are app screens (app/domain.tsx, app/packaging.tsx); nothing in My shop opens the web.
  assert.match(shop, /id: "domain"[^\n]+path: "app:\/domain"/);
  assert.match(shop, /id: "packaging"[^\n]+path: "app:\/packaging"/);
  assert.doesNotMatch(shop, /web:\/|openWeb/);
  // "Sell everywhere" isn't in the phone app's shop.
  assert.doesNotMatch(shop, /id: "channels"|app:\/channels/);
  // Payments, delivery and settings are app screens (no browser).
  for (const id of ["payments", "delivery", "settings"]) assert.match(shop, new RegExp(`path: "app:/${id}"`));
  // Getting more customers and sharing the shop left the + sheet; they stay one tap away.
  assert.match(shop, /id: "marketing"[^\n]+path: "app:\/marketing"/);
  assert.match(shop, /shareShop\(\)/);
  assert.doesNotMatch(shop, /ask-us|\/home\/inbox\/channels|developer|api-keys/);
});

test("Home shows at most three 'Do these next' items", () => {
  assert.equal(home.MAX_DO_NEXT, 3);
  const task = (key) => ({ key, icon: "truck", title: key, hint: "", href: "/home/orders" });
  assert.equal(home.doNextItems([task("a"), task("b"), task("c"), task("d"), task("e")], { key: "payments", title: "Pay", hint: "" }).length, 3);
  assert.deepEqual(home.doNextItems([task("a")], { key: "payments", title: "Pay", hint: "" }).map((item) => item.key), ["a", "setup:payments"]);
  assert.deepEqual(home.doNextItems(null, null), []);
  const screen = read("app/(tabs)/home.tsx");
  assert.match(screen, /doNextItems\(/);
  // Home: no week chart, big quick-action grid or best-seller carousel; "Needs you" shows three at most. The
  // "Familiar app" four round shortcuts and the four-step "Get your shop ready" list replace the old ones.
  assert.doesNotMatch(screen, /const ACTIONS|Selling fast|This week ·|Finish setting up|imports on the way/i);
  assert.match(screen, /todos\.slice\(0, NEEDS_MAX\)/);
  assert.match(screen, /const NEEDS_MAX = 3;/);
  assert.ok(home.peggyLine({ chatsToday: 2, ordersToday: 1 }).startsWith("Peggy"));
});

test("supplier app: tabs Home, Orders, Products, Chats, Money; orders New, In progress, Sent, Prices; self-delivery by code", () => {
  const layout = read("app/supplier/(tabs)/_layout.tsx");
  const tabs = layout.slice(layout.indexOf("SUPPLIER_TABS"), layout.indexOf("];", layout.indexOf("SUPPLIER_TABS")));
  assert.deepEqual([...tabs.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["Home", "Orders", "Products", "Chats", "Money"]);
  for (const hidden of ["quotes", "more"]) assert.match(layout, new RegExp(`name="${hidden}" options=\\{\\{ href: null \\}\\}`));
  const orders = read("app/supplier/(tabs)/orders.tsx");
  const words = readFileSync(new URL("../shared/i18n/messages/m_supplier/en.ts", import.meta.url), "utf8");
  for (const key of ['"orders.new"', '"orders.inProgress"', '"orders.sent"', '"orders.prices"']) assert.ok(orders.includes(key), key);
  for (const label of ['"orders.new": "New"', '"orders.sent": "Sent"']) assert.ok(words.includes(label), label);
  assert.equal(supplier.supplierOrderGroup({ status: "pending", next: ["accept", "decline"] }), "new");
  assert.equal(supplier.supplierOrderGroup({ status: "accepted", next: ["handed_over"] }), "pack");
  assert.equal(supplier.supplierOrderGroup({ status: "confirmed", next: ["packed"] }), "pack");
  assert.equal(supplier.supplierOrderGroup({ status: "shipped", next: ["delivered"] }), "sent");
  // A parcel the supplier delivers itself is finished with the customer's 4-digit code on a keypad.
  const code = read("app/supplier/order/code.tsx");
  assert.match(code, /<Keypad /);
  assert.match(code, /deliverWithCode\(/);
  assert.match(read("lib/supplier.ts"), /action: "delivered", code/);
});

test("supplier app, familiar design: Home pieces, product grid, city on orders, track, chat filters, money straight to bank", () => {
  const home = read("app/supplier/(tabs)/home.tsx");
  for (const piece of ["<LevelPill", "<StatusRow", "<Checklist", "<QuickActions", "<StoryViewer", '"/ask-peggy"', "privateCards"]) assert.ok(home.includes(piece), piece);
  for (const tone of ['tone: "peach"', 'tone: "butter"', 'tone: "lilac"', 'tone: "sky"']) assert.ok(home.includes(tone), tone);
  assert.match(read("app/supplier/(tabs)/products.tsx"), /products\.addSub/);
  assert.match(read("components/SupplierOrderRow.tsx"), /orderCity\(order\)/);
  assert.equal(supplier.orderCity({ kind: "dropship", label: { address: ["4 Bode St", "Ikeja, Lagos"] } }), "Ikeja");
  assert.equal(supplier.orderCity({ kind: "dropship", label: { address: ["Wuse, FCT", "Nigeria"] } }), "Wuse");
  assert.equal(supplier.orderCity({ kind: "wholesale", address: "12 Allen Ave, Ikeja, Lagos, Nigeria" }), "Ikeja");
  assert.equal(supplier.orderCity({ kind: "wholesale", address: "Aba" }), "Aba");
  assert.equal(supplier.orderCity({ kind: "wholesale", address: "" }), "");
  const now = Date.parse("2026-10-21T12:00:00Z");
  assert.deepEqual(supplier.weekSummary([{ amountKobo: 500000, status: "paid", createdAt: "2026-10-20T10:00:00Z" }, { amountKobo: 100000, status: "refunded", createdAt: "2026-10-20T10:00:00Z" }, { amountKobo: 900000, status: "paid", createdAt: "2026-10-01T10:00:00Z" }], [], now), { amount: 5000, count: 1 });
  assert.deepEqual(supplier.weekSummary([], [{ status: "delivered", createdAt: "2026-10-19T10:00:00Z", amount: 12000 }, { status: "cancelled", createdAt: "2026-10-19T10:00:00Z", amount: 9000 }], now), { amount: 12000, count: 1 });
  assert.equal(supplier.chatMatches({ role: "seller", unread: 0 }, "shops"), true);
  assert.equal(supplier.chatMatches({ role: "logistics_partner", unread: 0 }, "shops"), false);
  assert.equal(supplier.chatMatches({ role: "logistics_partner", unread: 2 }, "unread"), true);
  assert.deepEqual(supplier.supplierQuickReplies("seller").length, 3);
  // Track: hidden unless the tracking route answers; the shop's own (unguessable) link goes through the share sheet.
  assert.match(read("app/supplier/order/[id].tsx"), /fetchSupplierTrack\(/);
  const track = read("app/supplier/order/track.tsx");
  assert.match(track, /Share\.share\(/);
  assert.match(track, /shareUrl/);
  // Money goes straight to the bank: no withdraw, PIN or "held" money.
  const money = read("app/supplier/(tabs)/money.tsx");
  assert.doesNotMatch(money, /withdraw\(|\/withdraw|Withdraw to bank|Available to withdraw|pin\.|held by/i);
  assert.doesNotMatch(readFileSync(new URL("../shared/i18n/messages/m_supplier/en.ts", import.meta.url), "utf8"), /"money\.[^"]*": "[^"]*(withdraw|held by)/i);
  assert.match(money, /weekSummary\(/);
  const account = read("app/supplier/account.tsx");
  for (const piece of ["fetchCredits", '"/posts"', '"/rewards"']) assert.ok(account.includes(piece), piece);
  assert.doesNotMatch(account, /emailTopUp/, "credits are shown, never sold or pointed to");
});

test("every screen frame has Help, and Help offers a person and Peggy", () => {
  for (const frame of ["components/Screen.tsx", "components/TabScreen.tsx", "components/ChatScreen.tsx", "components/OnboardingFrame.tsx"]) assert.match(read(frame), /<HelpButton \/>/, frame);
  const help = read("components/Help.tsx");
  assert.match(help, /t\("sheet\.personWhatsApp"\)/);
  assert.match(help, /title=\{t\("sheet\.askPeggy"\)\}/);
  const helpWords = readFileSync(join(root, "../../../shared/i18n/messages/m_help/en.ts"), "utf8");
  assert.match(helpWords, /"sheet\.personWhatsApp": "Chat with a person on WhatsApp"/);
  assert.match(helpWords, /"sheet\.askPeggy": "Ask Peggy"/);
  assert.match(read("lib/support.ts"), /TODO: set EXPO_PUBLIC_SUPPORT_WHATSAPP/);
  for (const screen of ["app/(tabs)/home.tsx", "app/(tabs)/shop.tsx", "app/add-products.tsx", "app/peggy.tsx", "app/supplier/(tabs)/home.tsx", "app/supplier/(tabs)/money.tsx"]) {
    assert.match(read(screen), /HelpButton|<Screen\b|<TabScreen\b/, screen);
  }
  // Help and Ask us are open to suppliers too.
  const pure = read("lib/partner-pure.ts");
  assert.match(pure, /SHARED = \["\/help", "\/ask-us"[,\]]/);
});

test("one main button per screen is 56 tall", () => {
  assert.match(read("components/ui.tsx"), /size === "lg" \? 56/);
});

test("dates and amounts in plain words", () => {
  const now = new Date("2026-10-12T15:00:00Z"); // Monday afternoon in Lagos
  assert.equal(friendly.friendlyDay("2026-10-12T08:00:00Z", now), "today");
  assert.equal(friendly.friendlyDay("2026-10-11T08:00:00Z", now), "yesterday");
  assert.equal(friendly.friendlyDay("2026-10-09T08:00:00Z", now), "Friday");
  assert.equal(friendly.friendlyDay("2026-09-30T08:00:00Z", now), "30 Sep");
  assert.equal(friendly.friendlyTime("2026-10-12T13:30:00Z", now), "today at 2:30pm");
  // Setup steps keep the server's standard titles; only where a step goes on a phone changes its button.
  const domainStep = setupWords.stepWords({ key: "domain", title: "Use your own domain", hint: "Optional. A .com", done: false, action: { label: "Connect" } });
  assert.equal(domainStep.title, "Use your own domain");
  assert.equal(domainStep.label, "Ask us");
  assert.equal(supplier.waitingLabel(new Date(Date.parse("2026-10-12T12:00:00Z")).toISOString(), Date.parse("2026-10-12T15:00:00Z")), "Waiting 3 hours");
});
