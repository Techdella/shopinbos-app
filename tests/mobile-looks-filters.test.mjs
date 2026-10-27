// Shop looks on the phone (apps/mobile/src/app/templates.tsx, GET /api/mobile/looks, the public /theme-demo/<id>
// page) and the filters on the phone's lists that have them on the web: Find products, Products, Orders, Customers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mobile = (path) => read(`apps/mobile/src/${path}`);

const looksServer = await import("../src/lib/store-templates/mobile-looks.ts");
const library = await import("../src/lib/store-templates/theme-library.ts");
const looksPure = await import("../apps/mobile/src/lib/looks-pure.ts");
const find = await import("../apps/mobile/src/lib/find-pure.ts");
const productFilters = await import("../apps/mobile/src/lib/product-filters-pure.ts");
const orderFilters = await import("../apps/mobile/src/lib/order-filters-pure.ts");

test("GET /api/mobile/looks: every web theme, real sample photos, the plan a locked look needs and never a price", () => {
  const result = looksServer.mobileLooks({ tier: "basic", owned: ["noir"] }, "adire", "ada");
  assert.equal(result.looks.length, library.THEME_LIBRARY.length, "the same themes as /builder/templates");
  assert.deepEqual(result.chips, library.themeCategoryChips().map((chip) => chip.id));
  for (const look of result.looks) {
    assert.ok(look.demo.hero?.startsWith("https://images.unsplash.com/"), `${look.id} has a banner photo`);
    assert.equal(look.demo.products.length, 2, `${look.id} has two product photos`);
    assert.equal(look.demoPath, `/theme-demo/${look.id}`);
  }
  const by = Object.fromEntries(result.looks.map((look) => [look.id, look]));
  assert.equal(by.breeze.lockedPlan, null, "basic themes come with every plan");
  assert.equal(by.ewa.lockedPlan, "Starter", "premium needs Starter");
  assert.equal(by.oba.lockedPlan, "Growth", "platinum needs Growth");
  assert.equal(by.noir.lockedPlan, null, "a bought theme is usable");
  assert.equal(by.adire.lockedPlan, null, "the shop's own theme stays usable");
  assert.equal(by.adire.current, true);
  assert.doesNotMatch(JSON.stringify(result), /"prices?"|₦|NGN/, "no prices for the app");

  const route = read("src/app/api/mobile/looks/route.ts");
  assert.match(route, /withSeller\(/);
  assert.match(route, /loadSellerThemeAccess\(user\.id\)/);
});

test("/theme-demo/<id> renders the theme's sample store at phone width, for themes in the library only", () => {
  const page = read("src/app/theme-demo/[id]/page.tsx");
  assert.match(page, /isBoutiqueTheme\(id\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /noindex/);
  const demo = read("src/app/theme-demo/[id]/ThemeDemo.tsx");
  assert.match(demo, /previewData\(themeId, null\)/, "sample data, never a real store");
  assert.match(demo, /device="mobile"/);
  // Not behind a sign-in: the in-app browser has no web session.
  assert.doesNotMatch(read("src/lib/auth/route-access.ts"), /prefix: "\/theme-demo"/);
});

test("Shop looks screen: grid, filters, full-screen preview, live demo, Use this look through the web's route", () => {
  const screen = mobile("app/templates.tsx");
  for (const piece of ["<FilterBar", "<FilterSheet", "<LookCard", "<MiniShop", "<Modal", 'presentationStyle="fullScreen"', 'testID="look-use"', 'testID="look-live"', 'testID="look-rex"']) assert.ok(screen.includes(piece), piece);
  assert.match(screen, /WebBrowser\.openBrowserAsync\(lookDemoUrl\(look\)\)/, "the live demo in the in-app browser");
  assert.match(screen, /await applyLook\(look\.id\)/);
  assert.match(screen, /pathname: "\/rex"/, "Let Rex build one opens Rex");
  // A locked look only says "Not on your plan": no plan name, price, upgrade link or website (app store payment
  // rules, tests/store-payments.test.mjs). While every theme is free, nothing is locked.
  assert.match(screen, /t\("notOnPlan"\)/);
  assert.doesNotMatch(screen, /openWeb\(PLANS_PATH\)|needsPlan/);
  assert.doesNotMatch(screen, /purchase|Paystack|₦|buyTheme|price/i);
  assert.doesNotMatch(screen, /openWeb\("\/builder/, "no trip to the web builder");
  const lib = mobile("lib/templates.ts");
  assert.match(lib, /"\/api\/store\/templates\/apply"/);
  assert.doesNotMatch(lib, /purchase/);
  // react-native-webview is installed only as the peer Kora's face check SDK needs (app/face-check.tsx).
  assert.doesNotMatch(screen, /react-native-webview|<WebView/, "no WebView: the demo opens in the in-app browser");
});

test("Shop looks filters: category, plan, light or dark, search with accents folded, usable and new", () => {
  const looks = looksServer.mobileLooks({ tier: "basic", owned: [] }, null).looks;
  const none = looksPure.NO_LOOK_FILTERS;
  assert.equal(looksPure.filterLooks(looks, "all", none).length, looks.length);
  assert.ok(looksPure.filterLooks(looks, "beauty", none).every((look) => look.categories.includes("beauty")));
  assert.ok(looksPure.filterLooks(looks, "all", { ...none, tier: "platinum" }).every((look) => look.tier === "platinum"));
  const dark = looksPure.filterLooks(looks, "all", { ...none, tone: "dark" });
  assert.ok(dark.length && dark.every((look) => look.preview.dark));
  assert.ok(looksPure.filterLooks(looks, "all", { ...none, usable: true }).every((look) => !look.lockedPlan));
  assert.deepEqual(looksPure.filterLooks(looks, "all", { ...none, q: "afefe" }).map((look) => look.id), ["breeze"], "Afẹ́fẹ́ found without its accents");
  assert.ok(looksPure.filterLooks(looks, "all", { ...none, q: "wigs" }).some((look) => look.id === "suku"), "industries are searched");
  assert.equal(looksPure.lookFilterCount({ ...none, tier: "premium", isNew: true }), 2);
});

test("Find products: filters like the web (category, dropship or wholesale, cost, city, verified) and no web hand-offs", () => {
  const product = (over) => ({ name: "Bag", description: "", category: "Fashion", cost: 4000, dropship: true, wholesale: false, supplier: { name: "Ada", city: "Lagos", verificationStatus: "verified" }, ...over });
  const list = [product({ name: "Red bag" }), product({ name: "Shoe", category: "Shoes", cost: 25000, dropship: false, wholesale: true, supplier: { name: "Bisi", city: "Kano", verificationStatus: "pending" } })];
  const none = find.NO_FIND_FILTERS;
  assert.equal(find.filterFind(list, none).length, 2);
  assert.deepEqual(find.filterFind(list, { ...none, way: "wholesale" }).map((p) => p.name), ["Shoe"]);
  assert.deepEqual(find.filterFind(list, { ...none, price: "under5" }).map((p) => p.name), ["Red bag"]);
  assert.deepEqual(find.filterFind(list, { ...none, price: "20to50" }).map((p) => p.name), ["Shoe"]);
  assert.deepEqual(find.filterFind(list, { ...none, city: "kano" }).map((p) => p.name), ["Shoe"]);
  assert.deepEqual(find.filterFind(list, { ...none, verified: true }).map((p) => p.name), ["Red bag"]);
  assert.deepEqual(find.filterFind(list, { ...none, q: "red bags" }).map((p) => p.name), ["Red bag"]);
  assert.deepEqual(find.findCities(list), ["Kano", "Lagos"]);
  assert.equal(find.findFilterCount({ ...none, way: "dropship", verified: true, category: "Shoes" }), 2);

  const screen = mobile("app/find/index.tsx") + mobile("app/find/[slug].tsx");
  for (const piece of ['testID="find-filters"', "<FilterSheet", "filterFind(products, filters)"]) assert.ok(screen.includes(piece), piece);
  assert.doesNotMatch(screen, /openWeb\(/, "Find stays in the app");
  assert.doesNotMatch(screen, /tab=china|"china"/, "China imports aren't open, so there's no China tab");
});

test("Products: the web's status chips as API params, plus category and order in the Filters sheet", () => {
  const path = (show, extra = {}) => new URL(productFilters.productListPath({ ...productFilters.DEFAULT_PRODUCT_QUERY, show, ...extra }), "https://x").searchParams;
  assert.equal(path("all").get("status"), "!archived");
  assert.equal(path("live").get("status"), "active,published");
  assert.equal(path("draft").get("status"), "draft");
  assert.equal(path("archived").get("status"), "archived");
  assert.equal(path("low").get("lowStock"), "true");
  assert.equal(path("low").get("inventoryType"), "seller");
  assert.equal(path("dropship").get("inventoryType"), "dropshipping");
  assert.equal(path("all", { categoryId: "c1", sort: "sales" }).get("categoryId"), "c1");
  assert.equal(path("all", { sort: "sales" }).get("sort"), "sales");
  assert.equal(productFilters.productFilterCount({ show: "live", categoryId: "c1", sort: "name" }), 2);

  const route = read("src/app/api/store/products/route.ts");
  assert.match(route, /status\?\.startsWith\("!"\)\) where\.status = \{ not: status\.slice\(1\) \}/);
  assert.match(route, /where\.status = \{ in: status\.split\(","\)/);
  const screen = mobile("app/(tabs)/products.tsx");
  for (const piece of ['testID="products-filters"', "<FilterSheet", "fetchProductList(next)"]) assert.ok(screen.includes(piece), piece);
});

test("Orders and Customers: one sideways chip row plus a Filters sheet", () => {
  const orders = [
    { status: "pending", buyer: "Ada", summary: "Red bag", orderNumber: "SB-1001" },
    { status: "packed", buyer: "Bisi", summary: "Shoes", orderNumber: "SB-1002" },
    { status: "delivered", buyer: "Chi", summary: "Wig", orderNumber: "SB-1003" },
  ];
  const none = orderFilters.NO_ORDER_FILTERS;
  assert.deepEqual(orderFilters.filterOrders(orders, { ...none, pay: "unpaid" }).map((o) => o.buyer), ["Ada"]);
  assert.deepEqual(orderFilters.filterOrders(orders, { ...none, pay: "toSend" }).map((o) => o.buyer), ["Bisi"]);
  assert.deepEqual(orderFilters.filterOrders(orders, { ...none, q: "#sb-1003" }).map((o) => o.buyer), ["Chi"]);
  assert.match(mobile("app/(tabs)/orders.tsx"), /testID="orders-filters"/);
  const customers = mobile("app/customers/index.tsx");
  assert.match(customers, /testID="customers-filters"/);
  assert.match(customers, /<FilterSheet/);
  assert.match(mobile("components/FilterBar.tsx"), /horizontal/);
});

test("Every new word is in all five languages", () => {
  const keys = (ns, lang) => [...read(`shared/i18n/messages/${ns}/${lang}.ts`).matchAll(/^ {2}"([^"]+)":/gm)].map((match) => match[1]);
  for (const [ns, prefix] of [["m_looks", ""], ["m_find", "filters."], ["m_products", "filters."], ["m_orders", "filters."], ["m_customers", "filters."]]) {
    const english = keys(ns, "en").filter((key) => key.startsWith(prefix));
    assert.ok(english.length, ns);
    for (const lang of ["pcm", "yo", "ha", "ig"]) {
      const have = new Set(keys(ns, lang));
      for (const key of english) assert.ok(have.has(key), `${ns}/${lang}: ${key}`);
    }
  }
  assert.match(read("shared/i18n/catalog.ts"), /import m_looks from "\.\/messages\/m_looks\/index\.ts";/);
});
