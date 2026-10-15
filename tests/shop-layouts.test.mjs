// Shop page styles: filters column, category tiles, category rows and category bar (ShopBrowser), their address
// filters, category counts, builder settings and the guarantee that stores which never picked one look the same.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sb = await import("../src/components/storefront/shopper/shop-browse.ts");
const schema = await import("../src/components/builder/editor/section-schema.ts");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const product = (id, extra = {}) => ({ id, name: `Product ${id}`, images: [`https://img/${id}.jpg`], retailPrice: 1000, ...extra });
const bags = { id: "c1", name: "Bags", slug: "bags", imageUrl: "https://img/cat-bags.jpg" };
const shoes = { id: "c2", name: "Shoes", slug: "shoes", imageUrl: null };
const catalogue = [
  product("a", { category: bags, retailPrice: 5000, tags: ["Leather", "new"], avgRating: 4, reviewCount: 2 }),
  product("b", { category: bags, retailPrice: 15000, compareAtPrice: 20000, stock: { continueSelling: false, left: 0, lowAt: 5 } }),
  product("c", { category: shoes, retailPrice: 8000, tags: ["leather"], avgRating: 5, reviewCount: 9 }),
  product("d", { category: shoes, retailPrice: 2000, images: [] }),
  product("e", { retailPrice: 30000, supplierProduct: { stockQuantity: 0 } }),
];
const ids = (list) => list.map((entry) => entry.id);

test("shop address: filters read from and written to the URL, keeping other parameters", () => {
  const query = sb.parseShopQuery("category=bags&min=20000&max=5000&sort=price-low&instock=1&sale=true&tag=leather&tag=leather&tag=new&utm_source=wa");
  assert.equal(query.category, "bags");
  assert.equal(query.min, 5000, "a reversed price range is put the right way round");
  assert.equal(query.max, 20000);
  assert.equal(query.sort, "price-low");
  assert.equal(query.inStock, true);
  assert.equal(query.onSale, true);
  assert.deepEqual(query.tags, ["leather", "new"], "repeated tags count once");

  const params = sb.shopQueryParams(query, "utm_source=wa&category=old&view=all");
  assert.equal(params.get("utm_source"), "wa", "campaign tags survive");
  assert.equal(params.get("category"), "bags");
  assert.equal(params.get("view"), null, "picking a category leaves the all-products view");
  assert.deepEqual(sb.parseShopQuery(params), query, "write then read gives the same filters");

  // Junk and old values are ignored safely.
  const junk = sb.parseShopQuery("category=all&min=-5&max=abc&sort=cheapest&instock=0&collection=col1");
  assert.equal(junk.category, "");
  assert.equal(junk.collection, "col1");
  assert.equal(junk.min, null);
  assert.equal(junk.max, null);
  assert.equal(junk.sort, "");
  assert.equal(junk.inStock, false);
  assert.equal(sb.parseShopQuery("category=bags&collection=col1").collection, "", "a category and a collection never both apply");
  assert.equal(sb.parseShopQuery(`category=${"x".repeat(200)}`).category.length, 80);

  assert.equal(sb.shopQueryParams(sb.EMPTY_SHOP_QUERY, "q=red&min=1&tag=a").toString(), "q=red", "clearing removes every shop key, never the search");
  for (const key of ["category", "collection", "min", "max", "sort", "instock", "sale", "tag", "view"]) assert.ok(sb.SHOP_QUERY_KEYS.includes(key), key);
  assert.equal(sb.shopQueryParams({ ...sb.EMPTY_SHOP_QUERY, view: "all" }).get("view"), "all");
});

test("shop filters: category, collection, price, stock, sale and tags", () => {
  const q = (extra) => ({ ...sb.EMPTY_SHOP_QUERY, ...extra });
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ category: "bags" }))), ["a", "b"]);
  const collections = [{ id: "col1", name: "Gifts", imageUrl: null, productIds: ["c", "e", "missing"] }];
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ collection: "col1" }), collections)), ["c", "e"]);
  assert.equal(sb.filterShopProducts(catalogue, q({ collection: "gone" }), collections).length, 5, "an unknown collection filters nothing");
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ min: 5000, max: 15000 }))), ["a", "b", "c"]);
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ inStock: true }))), ["a", "c", "d"], "tracked stock at 0 and supplier stock at 0 are out");
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ onSale: true }))), ["b"]);
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ tags: ["LEATHER"] }))), ["a", "c"], "tags match whatever the case");
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ category: "shoes", min: 5000 }))), ["c"], "filters combine");
  assert.deepEqual(ids(sb.filterShopProducts(catalogue, q({ q: "shoes" }))), ["c", "d"], "the search box still works");
});

test("shop sort: featured, newest, price both ways and best rated", () => {
  assert.deepEqual(ids(sb.sortShopProducts(catalogue, "newest")), ["a", "b", "c", "d", "e"], "the store's own (newest first) order");
  assert.deepEqual(ids(sb.sortShopProducts(catalogue, "featured")), ["a", "c", "d", "b", "e"], "sold-out products go last");
  assert.deepEqual(ids(sb.sortShopProducts(catalogue, "price-low")), ["d", "a", "c", "b", "e"]);
  assert.deepEqual(ids(sb.sortShopProducts(catalogue, "price-high")), ["e", "b", "c", "a", "d"]);
  assert.deepEqual(ids(sb.sortShopProducts(catalogue, "rating")).slice(0, 2), ["c", "a"]);
  assert.deepEqual(ids(catalogue), ["a", "b", "c", "d", "e"], "sorting never changes the list it was given");
  const browsed = sb.browseShop(catalogue, { ...sb.EMPTY_SHOP_QUERY, category: "bags" }, [], "price-high");
  assert.deepEqual(ids(browsed), ["b", "a"], "no sort picked: the section's default sort");
  assert.deepEqual(ids(sb.browseShop(catalogue, { ...sb.EMPTY_SHOP_QUERY, sort: "price-low" }, [], "price-high")).slice(0, 1), ["d"], "the shopper's sort wins");
});

test("category counts follow the other filters; tiles get a picture", () => {
  const groups = sb.shopGroups(catalogue, [{ id: "col1", name: "Gifts", imageUrl: null, productIds: ["c", "e"] }, { id: "empty", name: "Empty", imageUrl: null, productIds: [] }]);
  assert.deepEqual(groups.map((group) => [group.kind, group.key, group.count, group.total]), [
    ["collection", "col1", 2, 2],
    ["category", "bags", 2, 2],
    ["category", "shoes", 2, 2],
  ], "collections first, empty ones left out, uncategorised products in no category");
  assert.equal(groups[1].image, "https://img/a.jpg", "the category's first product photo");
  const noPhotos = sb.shopGroups([product("x", { category: bags, images: [] })], []);
  assert.equal(noPhotos[0].image, "https://img/cat-bags.jpg", "else the category's own picture");

  const inStockOnly = sb.shopGroups(catalogue, [], { ...sb.EMPTY_SHOP_QUERY, inStock: true, category: "shoes" });
  assert.deepEqual(inStockOnly.map((group) => [group.key, group.count]), [["bags", 1], ["shoes", 2]], "counts ignore the picked category but respect other filters");

  const tags = sb.shopTags(catalogue);
  assert.deepEqual(tags.map((entry) => [entry.tag, entry.total]), [["Leather", 2], ["new", 1]], "tags merge across case");
  assert.deepEqual(sb.priceBounds(catalogue), { min: 2000, max: 30000 });
  assert.equal(sb.priceBounds([]), null);
});

test("active filter chips remove one filter; Clear all keeps the sort", () => {
  const query = { ...sb.EMPTY_SHOP_QUERY, category: "bags", min: 100, inStock: true, onSale: true, tags: ["red"], sort: "price-low" };
  const active = sb.activeShopFilters(query);
  assert.deepEqual(active.map((entry) => entry.id), ["group", "price", "instock", "sale", "tag:red"]);
  assert.equal(sb.withoutFilter(query, "group").category, "");
  assert.equal(sb.withoutFilter(query, "price").min, null);
  assert.deepEqual(sb.withoutFilter(query, "tag:red").tags, []);
  assert.deepEqual(sb.clearShopFilters(query), { ...sb.EMPTY_SHOP_QUERY, sort: "price-low" });
  assert.deepEqual(sb.withGroup({ ...query, view: "all" }, { kind: "collection", key: "col" }), { ...query, category: "", collection: "col", view: "" });
});

test("shop page style settings: stores that never picked one keep the classic grid", () => {
  for (const settings of [undefined, {}, { layout: "grid" }, { layout: "grid", shopView: "list", columns: "5", filterPlacement: "sidebar", pageSize: "12" }, { shopLayout: "nonsense" }]) {
    assert.equal(sb.readShopLayoutOptions(settings).layout, "classic", JSON.stringify(settings));
  }
  const defaults = sb.readShopLayoutOptions({ shopLayout: "filters" });
  assert.deepEqual(defaults, { layout: "filters", columns: 3, filters: ["category", "price", "instock", "sale"], defaultSort: "featured", showCounts: true, carouselRows: 6, carouselProducts: 8, pageSize: 24 });
  assert.equal(sb.readShopLayoutOptions({ shopLayout: "tiles" }).columns, 4);
  assert.equal(sb.readShopLayoutOptions({ shopLayout: "chips", columns: "5" }).columns, 4, "the classic grid's 5 a row becomes 4");
  assert.equal(sb.readShopLayoutOptions({ shopLayout: "chips", columns: "2" }).columns, 2);
  assert.deepEqual(sb.readShopLayoutOptions({ shopLayout: "filters", shopFilters: ["tags", "bogus", "price"] }).filters, ["tags", "price"], "the seller's order, unknown keys dropped");
  assert.deepEqual(sb.readShopLayoutOptions({ shopLayout: "filters", shopFilters: [] }).filters, []);
  const rows = sb.readShopLayoutOptions({ shopLayout: "carousels", carouselRows: 40, carouselProducts: "2", defaultSort: "rating", showCounts: false, pageSize: "all" });
  assert.equal(rows.carouselRows, 12);
  assert.equal(rows.carouselProducts, 4);
  assert.equal(rows.defaultSort, "rating");
  assert.equal(rows.showCounts, false);
  assert.equal(rows.pageSize, null, "All of them");
  assert.equal(sb.readShopLayoutOptions({ shopLayout: "tiles", pageSize: "36" }).pageSize, 36);

  // The renderers only switch to ShopBrowser for a picked style.
  const boutique = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(boutique, /const browse = readShopLayoutOptions\(section\.settings\);\n\s+if \(browse\.layout !== "classic"\) \{/);
  const classic = read("../src/components/storefront/TemplateStorefrontSurface.tsx");
  assert.match(classic, /const browse = currentPage === "products" \? readShopLayoutOptions\(kindSection\.settings\) : null;\n\s+if \(browse && browse\.layout !== "classic"\)/);
});

test("builder: shop page style picker, its settings, and translations in every language", async () => {
  assert.deepEqual(schema.SHOP_LAYOUT_OPTIONS.map((option) => option.value), sb.SHOP_LAYOUTS);
  assert.deepEqual(schema.SHOP_SORT_OPTIONS.map((option) => option.value), sb.SHOP_SORTS);
  assert.deepEqual(schema.SHOP_SORT_OPTIONS.map((option) => option.label), sb.SHOP_SORTS.map((sort) => sb.SHOP_SORT_LABELS[sort]));

  const fp = (settings) => ({ id: "p", kind: "featured-products", name: "Products", visible: true, blocks: [], settings });
  const ids = (settings, renderer = "boutique", page) => schema.visibleFields(fp(settings), renderer, "breeze", "settings", page).map((field) => field.id);
  const classicGrid = ids({ layout: "grid" });
  assert.ok(classicGrid.includes("shopLayout"));
  for (const id of ["shopView", "columns", "filterPlacement", "pageSize"]) assert.ok(classicGrid.includes(id), `classic grid keeps ${id}`);
  for (const id of ["shopFilters", "defaultSort", "carouselRows", "pageSize-browse"]) assert.ok(!classicGrid.includes(id), `classic grid hides ${id}`);
  assert.ok(!ids({ layout: "carousel" }).includes("shopLayout"), "home rails have no shop style");

  const filters = ids({ layout: "grid", shopLayout: "filters" });
  for (const id of ["columns-filters", "shopFilters", "defaultSort", "showCounts", "pageSize-browse"]) assert.ok(filters.includes(id), id);
  for (const id of ["shopView", "columns", "filterPlacement", "pageSize", "carouselRows"]) assert.ok(!filters.includes(id), `filters column hides ${id}`);
  const rows = ids({ layout: "grid", shopLayout: "carousels" });
  for (const id of ["columns-browse", "carouselRows", "carouselProducts", "defaultSort"]) assert.ok(rows.includes(id), id);
  assert.ok(!rows.includes("shopFilters"));

  // Classic templates: only on the shop page.
  assert.ok(!ids({ layout: "grid" }, "classic", "home").includes("shopLayout"));
  assert.ok(ids({ layout: "grid" }, "classic", "products").includes("shopLayout"));
  assert.ok(ids({ layout: "grid", shopLayout: "tiles" }, "classic", "products").includes("shop-style-note"));
  assert.ok(!ids({ layout: "grid", shopLayout: "tiles" }, "classic", "products").includes("columns"), "the classic column count steps aside");

  const all = schema.allFields(schema.sectionSchema("featured-products", "boutique", "breeze"));
  const picker = all.find((field) => field.id === "shopLayout");
  assert.equal(picker.type, "cards");
  assert.equal(picker.thumbs, "shop");
  assert.equal(picker.fallback, "classic");
  const thumb = read("../src/components/builder/editor/ShopLayoutThumb.tsx");
  for (const option of schema.SHOP_LAYOUT_OPTIONS) if (option.value !== "classic") assert.ok(thumb.includes(`case "${option.value}"`), `${option.value} has a thumbnail`);
  assert.match(read("../src/components/builder/editor/Inspector.tsx"), /fieldVisible\(section, field, page\?\.pageType\)/);

  const strings = new Set();
  for (const [renderer, theme] of [["boutique", "breeze"], ["classic", ""]]) {
    const groups = schema.sectionSchema("featured-products", renderer, theme);
    for (const group of [...groups.settings, ...groups.style]) {
      if (group.title) strings.add(group.title);
      for (const field of group.fields) {
        if (!["shopLayout", "columns-filters", "columns-browse", "shopFilters", "defaultSort", "showCounts", "carouselRows", "carouselProducts", "pageSize-browse", "shop-style-note"].includes(field.id)) continue;
        strings.add(field.label);
        if (field.help) strings.add(field.help);
        for (const option of field.options ?? []) {
          strings.add(option.label);
          if (option.hint) strings.add(option.hint);
        }
      }
    }
  }
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const catalog = (await import(`../shared/i18n/messages/builder/${locale}.ts`)).default;
    for (const text of strings) assert.ok(catalog[`ed.${text}`], `${locale}: "${text}"`);
  }
});

test("shop browser: accessible drawer and rows, reduced motion, and address handling", () => {
  const browser = read("../src/components/storefront/shopper/ShopBrowser.tsx");
  assert.match(browser, /role="dialog" aria-modal="true"/);
  assert.match(browser, /event\.key === "Escape"/);
  assert.match(browser, /event\.key !== "Tab"/, "focus stays inside the drawer");
  assert.match(browser, /previous\?\.focus\?\.\(\)/, "focus goes back to the Filters button");
  assert.match(browser, /role="region" aria-label=\{`\$\{group\.name\} products`\} tabIndex=\{0\}/, "rows scroll with the keyboard");
  assert.match(browser, /prefers-reduced-motion/);
  assert.match(browser, /Show \{results\.length\} \{results\.length === 1 \? "product" : "products"\}/);
  assert.match(browser, /<legend>Category<\/legend>/);
  assert.match(browser, /<legend>Price<\/legend>/);

  const hook = read("../src/components/storefront/shopper/useShopQuery.ts");
  assert.match(hook, /addEventListener\("popstate", read\)/, "Back and Forward re-read the filters");
  assert.match(hook, /window\.history\.pushState/);
  assert.match(hook, /window\.history\.replaceState/);
  const client = read("../src/app/s/[slug]/StorefrontClient.tsx");
  assert.match(client, /for \(const key of SHOP_QUERY_KEYS\) params\.delete\(key\);/, "other pages drop the shop's filters");
  const boutique = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(boutique, /useShopQuery\(\{ live, onShopPage: current === "products" \}\)/);
  assert.match(boutique, /function shopCategory\(slug: string\) \{\n\s+setFilter\(\(prev\) => withGroup\(prev, \{ kind: "category", key: slug \}\)\);\n\s+go\("products"\);/, "a home category tile opens the shop filtered");
  assert.match(read("../src/lib/storefront/public-store.server.ts"), /category: \{ select: \{ id: true, name: true, slug: true, imageUrl: true \} \}/);
});
