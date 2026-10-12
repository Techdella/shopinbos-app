// The Expo app follows the build spec's section 8A "Simplicity rules": four tabs and a "+" sheet for sellers, Home
// with at most three "Do these next" items, the supplier app's four tabs, and none of the words on the spec's
// "Don't say" list in what sellers and suppliers read.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

test("the + sheet: Add a product, Record a sale, Get more customers, Share my shop", () => {
  const sheet = read("components/CreateSheet.tsx");
  assert.match(sheet, /CREATE_ACTIONS = \["Add a product", "Record a sale", "Get more customers", "Share my shop"\] as const/);
  for (const index of [0, 1, 2, 3]) assert.match(sheet, new RegExp(`title=\\{CREATE_ACTIONS\\[${index}\\]\\}`));
  for (const path of ["/add-products", "/record-sale", "/marketing"]) assert.match(sheet, new RegExp(`go\\("${path}"\\)`));
  assert.match(sheet, /shareShop\(\)/);
});

test("My shop groups everything else by goal: Sell; Get paid and deliver; Grow", () => {
  const shop = read("app/(tabs)/shop.tsx");
  const titles = [...shop.matchAll(/title: "([^"]+)",\n\s+links:/g)].map((match) => match[1]);
  assert.deepEqual(titles.slice(0, 3), ["Sell", "Get paid and deliver", "Grow"]);
  // Technical set-up goes to "Ask us", not to the web pages with records and keys.
  assert.match(shop, /app:\/ask-us\?what=web-address/);
  assert.match(shop, /app:\/ask-us\?what=channels/);
  assert.doesNotMatch(shop, /\/home\/domain|\/home\/inbox\/channels|developer|api-keys/);
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
  for (const label of ['"New"', '"To pack"', '"Sent"', "You get", 'title="Accept"']) assert.ok(orders.includes(label), label);
  assert.equal(supplier.supplierOrderGroup({ status: "pending", next: ["accept", "decline"] }), "new");
  assert.equal(supplier.supplierOrderGroup({ status: "accepted", next: ["handed_over"] }), "pack");
  assert.equal(supplier.supplierOrderGroup({ status: "confirmed", next: ["packed"] }), "pack");
  assert.equal(supplier.supplierOrderGroup({ status: "shipped", next: ["delivered"] }), "sent");
  const order = read("app/supplier/order/[id].tsx");
  for (const words of ["Pack it with this label", "I've packed it", "Show it on my phone", "Write it by hand"]) assert.ok(order.includes(words), words);
  const request = read("app/supplier/quote/[id].tsx");
  for (const words of ["When can it be ready?", "Send my price", "The shop pays first. We keep the money safe"]) assert.ok(request.includes(words), words);
});

test("every screen frame has Help, and Help offers a person and Peggy", () => {
  for (const frame of ["components/Screen.tsx", "components/TabScreen.tsx", "components/ChatScreen.tsx", "components/OnboardingFrame.tsx"]) assert.match(read(frame), /<HelpButton \/>/, frame);
  const help = read("components/Help.tsx");
  assert.match(help, /Chat with a person on WhatsApp/);
  assert.match(help, /title="Ask Peggy"/);
  assert.match(read("lib/support.ts"), /TODO: set EXPO_PUBLIC_SUPPORT_WHATSAPP/);
  for (const screen of ["app/(tabs)/home.tsx", "app/(tabs)/shop.tsx", "app/add-products.tsx", "app/peggy.tsx", "app/supplier/(tabs)/home.tsx", "app/supplier/(tabs)/money.tsx"]) {
    assert.match(read(screen), /HelpButton|<Screen\b|<TabScreen\b/, screen);
  }
  // Help and Ask us are open to suppliers too.
  const pure = read("lib/partner-pure.ts");
  assert.match(pure, /SHARED = \["\/help", "\/ask-us"\]/);
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
  assert.equal(setupWords.stepWords({ key: "domain", title: "Use your own domain", hint: "Optional. A .com", done: false, action: { label: "Connect" } }).title, "Get your own web address");
  assert.equal(supplier.waitingLabel(new Date(Date.parse("2026-10-12T12:00:00Z")).toISOString(), Date.parse("2026-10-12T15:00:00Z")), "Waiting 3 hours");
});

// ─── Words ───────────────────────────────────────────────────────────────────

/** Seller and supplier screens, and the components and helpers they show words from. Delivery partner and rider screens have their own owner. */
const SKIP = [/^app\/logistics\//, /^app\/rider\//, /^app\/partners\//, /^components\/SetupHelpRequest\.tsx$/, /^components\/JobCard\.tsx$/, /^lib\/(logistics|rider|partner-pure|api|supabase|session|role)\.ts$/];

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** Removes `${…}` from template literals (with nesting), so only the words around them are checked. */
function dropInterpolations(code) {
  let out = "";
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "$" && code[index + 1] === "{") {
      let depth = 1;
      index += 2;
      while (index < code.length && depth) {
        if (code[index] === "{") depth += 1;
        else if (code[index] === "}") depth -= 1;
        index += 1;
      }
      index -= 1;
      out += " ";
    } else out += code[index];
  }
  return out;
}

/** Text people read: JSX text, and string literals that look like words (a space, or a capital first letter). */
export function uiStrings(source) {
  const code = dropInterpolations(
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
      .join("\n")
      .replace(/^\s*(import|export \* from) .*$/gm, ""),
  );
  const out = [];
  for (const match of code.matchAll(/(?<![=>])>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    const text = match[1].trim();
    if (/[;=()]|\bconst\b|\breturn\b/.test(text)) continue; // generics like useState<string | null>(null)
    if (/^(:|&&|\|\|)|\?$/.test(text)) continue; // between two elements of a ternary: {a ? <X /> : b ? <Y /> : null}
    out.push(text);
  }
  for (const match of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const text = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!/[A-Za-z]/.test(text) || /^[/@#.]|:\/\//.test(text)) continue;
    if (!(/\s/.test(text) || /^[A-Z][a-z]/.test(text))) continue; // keys like "dropship" or "pending"
    out.push(text);
  }
  return out;
}

// The spec's "Don't say" column. "Error, failed, invalid" means: say the reason and what to do instead.
const BANNED = /\b(domains?|dns|cname|ssl|skus?|variants?|inventory|fulfil\w*|dropship\w*|cod|cash on delivery|payouts?|settlements?|escrow|balance held|checkout|cart abandonment|abandoned|integrations?|api|webhooks?|campaigns?|ctr|roas|budgets?|segments?|audiences?|analytics|dashboards?|themes?|templates?|sections?|errors?|failed|invalid)\b/i;
// Suppliers also never see "white label" or "quote" (spec 8A, suppliers).
const SUPPLIER_BANNED = /\b(white[ -]label|quotes?|wholesale)\b/i;

/** What suppliers read: their screens and the pieces only they use. */
const SUPPLIER_FILES = /^(app\/supplier\/|components\/(SupplierOrderRow|VerificationScreen|PartnerMessages)\.tsx$|lib\/supplier(-pure)?\.ts$)/;

/** Strings that are allowed though they match: code, not words people read. */
const ALLOW = [
  /^Error$/, // `instanceof Error`
];

test("seller and supplier screens don't use the words on the 'Don't say' list", () => {
  const hits = [];
  for (const file of sourceFiles(root)) {
    const path = relative(root, file);
    if (SKIP.some((pattern) => pattern.test(path))) continue;
    for (const text of uiStrings(readFileSync(file, "utf8"))) {
      if (ALLOW.some((pattern) => pattern.test(text))) continue;
      if (BANNED.test(text)) hits.push(`${path}: ${text.slice(0, 120)}`);
      if (SUPPLIER_FILES.test(path) && SUPPLIER_BANNED.test(text)) hits.push(`${path} (supplier): ${text.slice(0, 120)}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("the word check itself finds UI text and skips code", () => {
  const sample = `import { x } from "@/lib/dropship";
    const a = useState<string | null>(null);
    const label = "Dropship";
    const key = "dropship";
    <T>Your payout is ready</T>
    <T>{\`Not sent\${message.error ? \`: \${message.error}\` : ""}\`}</T>`;
  const strings = uiStrings(sample);
  assert.ok(strings.includes("Dropship"));
  assert.ok(strings.includes("Your payout is ready"));
  assert.ok(!strings.some((text) => text === "dropship" || text.includes("useState")));
  assert.ok(!strings.some((text) => /message\.error/.test(text)));
});
