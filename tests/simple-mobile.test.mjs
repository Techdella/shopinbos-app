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
  assert.match(layout, /TABS\.slice\(0, 2\)\.map\(button\)[\s\S]*testID="create-button"[\s\S]*TABS\.slice\(2\)\.map\(button\)/);
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
});

test("My shop groups everything else by goal: Sell; Money and delivery; Look; You", () => {
  const shop = read("app/(tabs)/shop.tsx");
  const titles = [...shop.matchAll(/title: "([^"]+)",\n\s+links:/g)].map((match) => match[1]);
  assert.deepEqual(titles, ["Sell", "Money and delivery", "Look", "You"]);
  // The domain opens the web domain page, which connects in one tap (buy, or Entri for one bought elsewhere): no
  // records and no "Ask us". Sell everywhere opens the one-tap connect page.
  assert.match(shop, /web:\/home\/domain/, "Domain opens the self-serve domain page");
  // Sell everywhere, payments, delivery and settings are app screens now (no browser).
  for (const id of ["channels", "payments", "delivery", "settings"]) assert.match(shop, new RegExp(`path: "app:/${id}"`));
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
  // Day-one Home: no week chart, quick-action grid, checklist or best-seller carousel.
  assert.doesNotMatch(screen, /const ACTIONS|Selling fast|This week ·|Finish setting up|imports on the way/i);
  assert.ok(home.peggyLine({ chatsToday: 2, ordersToday: 1 }).startsWith("Peggy"));
  // Supplier Home follows the same limit.
  assert.match(read("app/supplier/(tabs)/home.tsx"), /next\.slice\(0, MAX_DO_NEXT\)/);
});

test("supplier app: tabs Home, Orders, Products, Money; orders New, To pack, Sent", () => {
  const layout = read("app/supplier/(tabs)/_layout.tsx");
  const tabs = layout.slice(layout.indexOf("SUPPLIER_TABS"), layout.indexOf("};", layout.indexOf("SUPPLIER_TABS")));
  assert.deepEqual([...tabs.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["Home", "Orders", "Products", "Money"]);
  for (const hidden of ["quotes", "messages", "more"]) assert.match(layout, new RegExp(`name="${hidden}" options=\\{\\{ href: null \\}\\}`));
  const orders = read("app/supplier/(tabs)/orders.tsx");
  // Supplier words are in the app-language catalog (shared/i18n/messages/m_supplier); the screens use the keys.
  const words = readFileSync(new URL("../shared/i18n/messages/m_supplier/en.ts", import.meta.url), "utf8");
  for (const key of ['t("orders.new")', 't("orders.pack")', 't("orders.sent")', 't("orders.youGet"', 'title={t("accept")}']) assert.ok(orders.includes(key), key);
  for (const label of ['"orders.new": "New"', '"orders.pack": "To pack"', '"orders.sent": "Sent"', '"orders.youGet": "You get {amount}"', 'accept: "Accept"']) assert.ok(words.includes(label), label);
  assert.equal(supplier.supplierOrderGroup({ status: "pending", next: ["accept", "decline"] }), "new");
  assert.equal(supplier.supplierOrderGroup({ status: "accepted", next: ["handed_over"] }), "pack");
  assert.equal(supplier.supplierOrderGroup({ status: "confirmed", next: ["packed"] }), "pack");
  assert.equal(supplier.supplierOrderGroup({ status: "shipped", next: ["delivered"] }), "sent");
  const order = read("app/supplier/order/[id].tsx");
  for (const key of ['t("order.packWithLabel")', 't("order.packed")', "t(`order.way.${option.key}`)"]) assert.ok(order.includes(key), key);
  for (const line of ["Pack it with this label", "I've packed it", "Show it on my phone", "Write it by hand"]) assert.ok(words.includes(`"${line}"`), line);
  const request = read("app/supplier/quote/[id].tsx");
  for (const key of ['t("quote.whenReady")', 't("quote.send")', 't("quote.escrow")']) assert.ok(request.includes(key), key);
  for (const line of ["When can it be ready?", "Send my quote", "The shop pays first. We hold the money in escrow"]) assert.ok(words.includes(line), line);
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
