// Ready-made store blocks (src/components/storefront/boutique/blocks): the registry is complete, every block's starter
// content fits its inspector fields, the builder offers each one in the right group, and the pure logic behind the
// blocks (free-delivery progress, hotspot pins, recent-sales privacy, pop-up frequency, recently viewed, product
// lists, comparison rows, size finder, FAQ search) behaves.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const catalog = await import("../src/components/storefront/boutique/blocks/block-catalog.ts");
const logic = await import("../src/components/storefront/boutique/blocks/block-logic.ts");
const viewed = await import("../src/lib/storefront/recently-viewed.ts");
const editor = await import("../src/components/builder/editor/editor-logic.ts");
const schema = await import("../src/components/builder/editor/section-schema.ts");
const en = (await import("../shared/i18n/messages/builder/en.ts")).default;

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const THEMES = ["breeze", "noir", "plain", "ounje", "asoebi"];
const product = (id, extra = {}) => ({ id, name: `Product ${id}`, images: [`https://img/${id}.jpg`], retailPrice: 10000, currency: "NGN", ...extra });

test("registry: every block has a renderer file, a registry entry and an Insert-panel entry; kinds never clash", () => {
  const registry = read("../src/components/storefront/boutique/blocks/registry.tsx");
  const kinds = catalog.STORE_BLOCK_KINDS;
  assert.ok(kinds.length >= 20, "the library ships at least 20 blocks");
  assert.equal(new Set(kinds).size, kinds.length, "kinds are unique");
  for (const kind of kinds) {
    const match = registry.match(new RegExp(`"${kind}": (\\w+),`));
    assert.ok(match, `${kind} is registered with a renderer`);
    assert.match(registry, new RegExp(`import \\{[^}]*\\b${match[1]}\\b[^}]*\\} from "\\./(\\w+)"`), `${kind}: ${match[1]} is imported`);
    const file = registry.match(new RegExp(`import \\{[^}]*\\b${match[1]}\\b[^}]*\\} from "\\./(\\w+)"`))[1];
    assert.ok(existsSync(new URL(`../src/components/storefront/boutique/blocks/${file}.tsx`, import.meta.url)), `${kind}: its renderer has its own file`);
  }
  const registered = [...registry.matchAll(/^ {2}"([a-z-]+)": \w+,$/gm)].map((entry) => entry[1]);
  assert.deepEqual([...registered].sort(), [...kinds].sort(), "no renderer without a catalog entry");

  const builtIn = editor.INSERT_CATALOG.filter((item) => !item.icon).map((item) => item.kind);
  for (const kind of kinds) assert.ok(!builtIn.includes(kind), `${kind} doesn't reuse a theme section kind`);
  for (const block of catalog.STORE_BLOCKS) {
    const item = editor.INSERT_CATALOG.find((entry) => entry.kind === block.kind);
    assert.ok(item, `${block.kind} is in the Insert panel`);
    assert.deepEqual(item.renderers, ["boutique"], `${block.kind}: 2026 themes only`);
    assert.equal(item.group, block.category);
    assert.ok(block.description.length > 10 && block.description.length <= 90, `${block.kind}: a short description`);
    assert.equal(editor.insertLabel(block.kind), block.label);
  }
  // The BoutiqueStorefront hook stays small: one import and one check before the theme sections.
  const storefront = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(storefront, /if \(isStoreBlock\(section\.kind\)\) return <StoreBlock ctx=\{blockContext\(section\)\} \/>;/);
});

test("insert panel: blocks are grouped by category, searchable, and never offered to older templates", () => {
  const groups = editor.insertOptions({ renderer: "boutique", target: "template", existingKinds: [] });
  assert.deepEqual(groups.map((group) => group.group), ["Banners", "Products", "Trust", "Story", "Grow", "Extras"]);
  const kindsIn = (name) => groups.find((group) => group.group === name).items.map((item) => item.kind);
  assert.ok(kindsIn("Banners").includes("split-hero") && kindsIn("Banners").includes("ticker-bar"));
  assert.ok(kindsIn("Products").includes("shop-the-look") && kindsIn("Trust").includes("sales-pop"));
  assert.ok(kindsIn("Grow").includes("shipping-progress") && kindsIn("Extras").includes("size-finder"));
  assert.deepEqual(editor.insertOptions({ renderer: "boutique", target: "template", existingKinds: [], query: "hotspot pins" }), [], "search matches words shown to the seller");
  assert.deepEqual(editor.insertOptions({ renderer: "boutique", target: "template", existingKinds: [], query: "pins" }).flatMap((group) => group.items.map((item) => item.kind)), ["shop-the-look"]);
  const classic = editor.insertOptions({ renderer: "classic", target: "template", existingKinds: [] }).flatMap((group) => group.items.map((item) => item.kind));
  for (const kind of catalog.STORE_BLOCK_KINDS) assert.ok(!classic.includes(kind), `${kind} isn't offered to older templates`);
  assert.deepEqual(editor.insertOptions({ renderer: "boutique", target: "header", existingKinds: ["header"] }).flatMap((group) => group.items.map((item) => item.kind)), ["announcement-bar"], "blocks go in the page body");
});

test("defaults: every block inserts with starter content that fits its own inspector fields", () => {
  for (const block of catalog.STORE_BLOCKS) {
    const section = editor.newBoutiqueSection(block.kind, `s-${block.kind}`);
    assert.equal(section.kind, block.kind);
    assert.equal(section.name, block.label);
    assert.equal(section.visible, true);
    assert.equal(section.blocks[0].type, "copy");
    assert.notEqual(editor.newBoutiqueSection(block.kind, "other").blocks[0].content, section.blocks[0].content, "sections never share starter objects");
    for (const theme of THEMES) {
      const full = schema.sectionSchema(block.kind, "boutique", theme);
      assert.deepEqual(full.settings, block.schema(theme), `${block.kind}: the panel shows the block's own fields`);
      const fields = schema.allFields(full);
      for (const field of fields) {
        assert.ok(en[`ed.${field.label}`], `${block.kind}: "${field.label}" has an English builder key`);
        if (field.help) assert.ok(en[`ed.${field.help}`], `${block.kind}: help text has a key`);
        if (!("target" in field) || field.target.scope !== "settings") continue;
        const value = section.settings?.[field.target.key];
        if (value === undefined) continue;
        if (field.type === "select" || field.type === "segmented") assert.ok(field.options.some((option) => option.value === value), `${block.kind}.${field.id}: starter "${value}" is an option`);
        if (field.type === "number") assert.ok(value >= field.min && value <= field.max, `${block.kind}.${field.id}: starter ${value} in range`);
        if (field.type === "toggle") assert.equal(typeof value, "boolean", `${block.kind}.${field.id}: starter is a switch value`);
      }
      // Same rules as tests/builder-section-settings.test.mjs: unique fields, one list on section.items at a time.
      const choices = fields.filter((field) => (field.type === "select" || field.type === "segmented" || field.type === "toggle") && field.target?.scope === "settings");
      const variants = [section.settings ?? {}, ...choices.flatMap((field) => (field.type === "toggle" ? [true, false] : field.options.map((option) => option.value)).map((value) => ({ ...(section.settings ?? {}), [field.target.key]: value })))];
      for (const settings of variants) {
        const visible = schema.visibleFields({ ...section, settings }, "boutique", theme);
        assert.equal(new Set(visible.map((field) => field.id)).size, visible.length, `${block.kind}: no duplicate fields`);
        const lists = visible.filter((field) => ["repeater", "items", "faq", "products", "media"].includes(field.type));
        assert.ok(lists.length <= 1, `${block.kind} ${JSON.stringify(settings)}: at most one list edits section.items (${lists.map((field) => field.id)})`);
      }
    }
    for (const field of schema.allFields(schema.sectionSchema(block.kind, "boutique", "breeze")).filter((entry) => entry.type === "repeater")) {
      assert.ok(field.max > 0 && field.itemName && field.addLabel && field.fields.length, `${block.kind}: ${field.id} is a complete list`);
      assert.equal(new Set(field.fields.map((item) => item.key)).size, field.fields.length);
      for (const item of field.fields) {
        assert.ok(en[`ed.${item.label}`], `${block.kind}: list field "${item.label}" has a key`);
        const key = item.type === "media" ? "imageUrl" : item.key;
        assert.ok(key in field.template, `${block.kind}: new ${field.itemName} has ${key}`);
      }
      assert.ok((section.items ?? []).length <= field.max, `${block.kind}: starter list fits`);
    }
    assert.doesNotThrow(() => editor.sectionBlocks(section), `${block.kind}: the sections tree can list it`);
  }
  assert.ok(en["ed.Trust"] && en["ed.Extras"], "new Insert groups are translatable");
});

test("defaults: starter content never invents reviews, sales, press or offers for shoppers", () => {
  const blank = (kind) => editor.newBoutiqueSection(kind, "x");
  for (const kind of ["review-carousel", "press-logos", "ugc-grid", "sales-pop", "shop-the-look", "compare-table", "shoppable-story"]) {
    assert.deepEqual(blank(kind).items ?? [], [], `${kind} starts empty (the builder shows a marked sample)`);
  }
  assert.equal(blank("sales-pop").settings.consent, false, "recent sales stay off until the seller confirms they are real");
  assert.equal(blank("promo-popup").blocks[0].content.discountCode, "", "no discount code the seller didn't create");
  assert.doesNotMatch(JSON.stringify(blank("promo-popup")), /\d+%/, "no made-up percentage offer");
  assert.deepEqual(blank("trust-badges").items.filter((item) => item.source).map((item) => item.source), ["delivery", "payment", "whatsapp"], "delivery, payment and chat promises come from the settings");
});

test("faq: the Questions section gains an optional search box instead of a second FAQ block", () => {
  const faq = { id: "f", kind: "faq", name: "Questions", visible: true, blocks: [], items: [] };
  const ids = (settings) => schema.visibleFields({ ...faq, settings }, "boutique", "breeze").map((field) => field.id);
  assert.ok(ids({}).includes("searchable") && !ids({}).includes("searchPlaceholder"));
  assert.ok(ids({ searchable: true }).includes("searchPlaceholder"));
  assert.ok(!catalog.STORE_BLOCK_KINDS.some((kind) => /faq|question/.test(kind)), "no duplicate FAQ block");
  const items = [{ question: "How fast is delivery?", answer: "Lagos in 1-2 days." }, { question: "Can I return it?", answer: "Yes, within 7 days." }, { question: "Do you ship to Abuja?", answer: "Yes. Délivery takes 3 days." }];
  assert.deepEqual(logic.filterFaq(items, "").length, 3);
  assert.deepEqual(logic.filterFaq(items, "DELIVERY").map((item) => item.question), ["How fast is delivery?", "Do you ship to Abuja?"], "any case, accents ignored, answers searched");
  assert.deepEqual(logic.filterFaq(items, "return 7").map((item) => item.question), ["Can I return it?"], "every word must match");
  assert.deepEqual(logic.filterFaq(items, "refund"), []);
});

test("free-delivery bar: progress math, store threshold first, messages", () => {
  assert.deepEqual(logic.shippingProgress(15000, 40000), { threshold: 40000, remaining: 25000, percent: 37, reached: false });
  assert.deepEqual(logic.shippingProgress(0, 40000), { threshold: 40000, remaining: 40000, percent: 0, reached: false });
  assert.equal(logic.shippingProgress(39999.5, 40000).percent, 99, "never shows full before it is");
  assert.equal(logic.shippingProgress(39999.5, 40000).remaining, 1, "rounds what's left up");
  assert.deepEqual(logic.shippingProgress(52000, 40000), { threshold: 40000, remaining: 0, percent: 100, reached: true });
  assert.equal(logic.shippingProgress(-5, 40000).percent, 0);
  assert.equal(logic.shippingProgress(1000, 0), null);
  assert.equal(logic.shippingProgress(1000, null), null);
  assert.deepEqual(logic.freeShippingThreshold(30000, "50000"), { amount: 30000, source: "store" }, "the store's delivery settings win");
  assert.deepEqual(logic.freeShippingThreshold(null, "₦50,000"), { amount: 50000, source: "block" });
  assert.equal(logic.freeShippingThreshold(null, "free"), null);
  assert.equal(logic.fillAmount("You're {amount} away", "₦5,000"), "You're ₦5,000 away");
  assert.equal(logic.fillAmount("Almost there", "₦5,000"), "Almost there");
});

test("shop the look: pins are clamped inside the photo, point at real products, and cards open inward", () => {
  assert.equal(logic.clampHotspot(-20), logic.HOTSPOT_MIN);
  assert.equal(logic.clampHotspot(140), logic.HOTSPOT_MAX);
  assert.equal(logic.clampHotspot("42.26%"), 42.3);
  assert.equal(logic.clampHotspot("abc"), 50);
  assert.equal(logic.clampHotspot(undefined, 30), 30);
  const pins = logic.readHotspots([
    { link: { type: "product", value: "p1" }, x: "10", y: "120", label: "Bag" },
    { link: { type: "product", value: "gone" }, x: "50", y: "50" },
    { link: { type: "page", value: "products" }, x: "50", y: "50" },
    { productId: "p2", x: 70, y: 20 },
  ], new Set(["p1", "p2"]));
  assert.deepEqual(pins, [
    { index: 0, x: 10, y: 97, productId: "p1", label: "Bag" },
    { index: 3, x: 70, y: 20, productId: "p2", label: "" },
  ], "deleted products and page links are dropped; positions clamped");
  assert.deepEqual(logic.hotspotTooltipPlacement(90, 90), { horizontal: "left", vertical: "above" });
  assert.deepEqual(logic.hotspotTooltipPlacement(10, 10), { horizontal: "right", vertical: "below" });
  assert.deepEqual(logic.hotspotTooltipPlacement(50, 40), { horizontal: "center", vertical: "below" });
});

test("recent sales pop: only a first name and a city, never contact details, and only real products", () => {
  assert.equal(logic.safeFirstName("adaeze okafor"), "Adaeze");
  assert.equal(logic.safeFirstName("Ṣọlá Adébáyọ̀"), "Ṣọlá", "any alphabet");
  assert.equal(logic.safeFirstName("ada@shop.ng"), "");
  assert.equal(logic.safeFirstName("08034127790"), "");
  assert.equal(logic.safeFirstName("+234 803 412 7790"), "");
  assert.equal(logic.safeFirstName("Ada, Lekki"), "Ada");
  assert.equal(logic.safeFirstName("Christabelleeeeeeeeeeee"), "Christabelleeeee", "capped");
  assert.equal(logic.safeCity("Lagos"), "Lagos");
  assert.equal(logic.safeCity("Port Harcourt, Rivers"), "Port Harcourt");
  assert.equal(logic.safeCity("12 Allen Avenue, Ikeja"), "", "no street addresses");
  assert.equal(logic.safeCity("www.example.com"), "");
  const pops = logic.readSalePops([
    { name: "Ada Okafor", city: "Lagos", link: { type: "product", value: "p1" }, when: "2 hours ago" },
    { name: "", city: "Abuja", link: { type: "product", value: "p2" } },
    { name: "Bola", city: "", link: { type: "product", value: "p1" } },
    { name: "Chi", city: "Enugu", link: { type: "product", value: "deleted" } },
  ], new Set(["p1", "p2"]));
  assert.deepEqual(pops.map((pop) => [pop.firstName, pop.city, pop.productId]), [["Ada", "Lagos", "p1"], ["", "Abuja", "p2"]]);
  assert.equal(logic.salePopSentence(pops[0]), "Ada in Lagos just bought");
  assert.equal(logic.salePopSentence(pops[1]), "Someone in Abuja just bought");
  assert.doesNotMatch(JSON.stringify(pops), /Okafor/);
});

test("sign-up pop-up: frequency cap, exit intent on computers, delay on phones, one valid contact", () => {
  const now = Date.UTC(2026, 9, 15);
  const day = 86_400_000;
  assert.equal(logic.promoPopupDue({ lastShownAt: null, shownThisSession: false, signedUp: false }, 7, now), true);
  assert.equal(logic.promoPopupDue({ lastShownAt: now - 3 * day, shownThisSession: false, signedUp: false }, 7, now), false, "within the frequency period");
  assert.equal(logic.promoPopupDue({ lastShownAt: now - 7 * day, shownThisSession: false, signedUp: false }, 7, now), true);
  assert.equal(logic.promoPopupDue({ lastShownAt: null, shownThisSession: true, signedUp: false }, 7, now), false, "once a visit");
  assert.equal(logic.promoPopupDue({ lastShownAt: null, shownThisSession: false, signedUp: true }, 7, now), false, "never after signing up");
  assert.equal(logic.promoPopupTrigger(true, "exit"), "delay", "phones have no exit intent");
  assert.equal(logic.promoPopupTrigger(false, "exit"), "exit");
  assert.equal(logic.promoPopupTrigger(false, "delay"), "delay");
  assert.deepEqual(logic.leadField(" ada@shop.ng ", "either"), { email: "ada@shop.ng" });
  assert.deepEqual(logic.leadField("0803 412 7790", "either"), { phone: "0803 412 7790" });
  assert.equal(logic.leadField("0803 412 7790", "email"), null);
  assert.equal(logic.leadField("ada@shop.ng", "phone"), null);
  assert.equal(logic.leadField("hello", "either"), null);
  // Signs up through the same subscriber API as the Newsletter section.
  const popup = read("../src/components/storefront/boutique/blocks/PromoPopup.tsx");
  assert.match(popup, /\/api\/public\/store\/\$\{encodeURIComponent\(store\.slug\)\}\/forms/);
  assert.match(popup, /type: "newsletter"/);
});

test("recently viewed: newest first, no repeats, capped, recorded by product pages", () => {
  let list = [];
  for (const id of ["a", "b", "a", "c"]) list = viewed.pushRecentlyViewed(list, id);
  assert.deepEqual(list, ["c", "a", "b"]);
  assert.deepEqual(viewed.pushRecentlyViewed("junk", "x"), ["x"]);
  assert.deepEqual(viewed.pushRecentlyViewed([1, null, "a", "a"], ""), ["a"], "junk and repeats dropped");
  const many = Array.from({ length: 20 }, (_, i) => `p${i}`).reduce((acc, id) => viewed.pushRecentlyViewed(acc, id), []);
  assert.equal(many.length, viewed.RECENTLY_VIEWED_MAX);
  assert.equal(many[0], "p19");
  assert.deepEqual(viewed.viewedProducts(["c", "gone", "a"], [{ id: "a" }, { id: "c" }], "a").map((entry) => entry.id), ["c"], "deleted and current products are left out");
  assert.deepEqual(viewed.readRecentlyViewed(""), [], "no store, no list");
  assert.doesNotThrow(() => viewed.rememberRecentlyViewed("shop", "p1"), "storage that isn't there is never an error");
  assert.match(read("../src/lib/analytics/storefront-events.ts"), /rememberRecentlyViewed\(storeSlug, productId\)/, "every product page view is remembered");
});

test("product lists: tabs, sources, sale order and recommendations by category, type and tags", () => {
  const products = [
    product("new1"),
    product("sale-small", { compareAtPrice: 11000 }),
    product("best", { reviewCount: 12, avgRating: 4.8 }),
    product("sale-big", { compareAtPrice: 20000 }),
  ];
  assert.deepEqual(logic.tabProducts(products, "new", 2).map((entry) => entry.id), ["new1", "sale-small"], "new arrivals keep the store's newest-first order");
  assert.equal(logic.tabProducts(products, "best", 1)[0].id, "best");
  assert.deepEqual(logic.tabProducts(products, "sale", 5).map((entry) => entry.id), ["sale-big", "sale-small"], "biggest discount first");
  assert.equal(logic.percentOff(products[3]), 50);
  assert.equal(logic.percentOff(products[0]), 0);
  assert.deepEqual(logic.blockProducts({ products, source: "picked", pickedIds: ["sale-big", "missing", "new1"], limit: 5 }).map((entry) => entry.id), ["sale-big", "new1"]);
  assert.deepEqual(logic.blockProducts({ products, source: "sale", pickedIds: ["new1"], limit: 5 }).map((entry) => entry.id), ["new1", "sale-small", "sale-big"], "picked first, then the source");
  assert.deepEqual(logic.blockProducts({ products, source: "collection", pickedIds: [], collectionProductIds: ["best"], limit: 5 }).map((entry) => entry.id), ["best"]);
  assert.equal(logic.blockProducts({ products, source: "best-sellers", pickedIds: [], limit: 2 }).length, 2);

  const shoes = { id: "c1", name: "Shoes", slug: "shoes" };
  const catalogue = [
    product("seed", { category: shoes, tags: ["Leather"] }),
    product("same-cat", { category: shoes }),
    product("same-tag", { tags: ["leather"] }),
    product("popular", { reviewCount: 30, avgRating: 5 }),
    product("other"),
  ];
  const picks = logic.recommendProducts(["seed"], catalogue, 3).map((entry) => entry.id);
  assert.deepEqual(picks.slice(0, 2).sort(), ["same-cat", "same-tag"], "related products first");
  assert.equal(picks[2], "popular", "then best sellers");
  assert.ok(!picks.includes("seed"), "never recommends what they already have");
  assert.equal(logic.recommendProducts([], catalogue, 2)[0].id, "popular", "new visitors get best sellers");
});

test("comparison table: rows from the products' own details, empty rows dropped, chosen rows in order", () => {
  const products = [
    product("a", { category: { id: "1", name: "Bags", slug: "bags" }, specifications: [{ name: "Material", value: "Leather" }, { name: "Origin", value: "Aba" }] }),
    product("b", { category: { id: "1", name: "Bags", slug: "bags" }, specifications: [{ name: "material", value: "Canvas" }, { name: "Strap", value: "Long" }] }),
  ];
  const rows = logic.comparisonRows(products);
  assert.deepEqual(rows.map((row) => row.label), ["Category", "Material", "Origin", "Strap"]);
  assert.deepEqual(rows.find((row) => row.label === "Material").values, ["Leather", "Canvas"], "labels match in any case");
  assert.deepEqual(rows.find((row) => row.label === "Strap").values, ["", "Long"]);
  assert.deepEqual(logic.comparisonRows(products, ["strap", "material", "colour"]).map((row) => row.label), ["Strap", "Material"], "only the rows asked for, that exist");
  assert.deepEqual(logic.comparisonRows([product("x"), product("y")]), []);
});

test("size finder: exact match, closest size when between, one or two measurements", () => {
  const starter = editor.newBoutiqueSection("size-finder", "s").items;
  const chart = logic.readSizeChart(starter);
  assert.equal(chart.length, 5);
  assert.deepEqual(logic.recommendSize(chart, [88, 69]), { size: "M (10)", exact: true });
  assert.deepEqual(logic.recommendSize(chart, [91, null]), { size: "L (12)", exact: true }, "one measurement is enough");
  assert.deepEqual(logic.recommendSize(chart, [89.5, 70]), { size: "M (10)", exact: false }, "between sizes picks the closest");
  assert.deepEqual(logic.recommendSize(chart, [120, 100]), { size: "XXL (16)", exact: false });
  assert.equal(logic.recommendSize(chart, [null, null]), null);
  assert.equal(logic.recommendSize([], [90]), null);
  assert.deepEqual(logic.readSizeChart([{ size: "" }, { size: "One size", min1: "", max1: "" }]).map((row) => row.ranges[0]), [{ min: null, max: null }]);
});

test("motion and settings helpers: tickers keep reading speed, carousels wrap, settings stay in range", () => {
  assert.ok(logic.tickerSeconds(200, "slow") > logic.tickerSeconds(200, "normal") && logic.tickerSeconds(200, "normal") > logic.tickerSeconds(200, "fast"));
  assert.equal(logic.tickerSeconds(0, "normal"), 12, "never too fast");
  assert.equal(logic.tickerSeconds(10_000, "slow"), 120, "never painfully slow");
  assert.equal(logic.wrapIndex(-1, 4), 3);
  assert.equal(logic.wrapIndex(5, 4), 1);
  assert.equal(logic.wrapIndex(2, 0), 0);
  assert.equal(logic.intSetting("7", 2, 5, 4), 5);
  assert.equal(logic.intSetting(undefined, 2, 5, 4), 4);
  assert.equal(logic.boolSetting("false", true), false);
  assert.equal(logic.choice("diagonal", ["left", "right"], "left"), "left");
  // Tickers, carousels and pop-ups respect reduced motion.
  for (const file of ["TickerBar", "ReviewCarousel", "ProductCarousel", "ParallaxBanner", "VideoHero", "CollectionGrid"]) {
    assert.match(read(`../src/components/storefront/boutique/blocks/${file}.tsx`), /prefers-reduced-motion|useReducedMotion/, `${file} respects reduced motion`);
  }
});
