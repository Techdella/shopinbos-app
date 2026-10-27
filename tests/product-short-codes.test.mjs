// Product short codes (BAG1, BAG2…) and Share to WhatsApp: the pure rules (shared/product-codes.ts), the API
// validation, every product create path assigning a code, the additive migration and its backfill, and where the
// phone, the web and the storefront show them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const m = await import("../shared/product-codes.ts");
const schemas = await import("../src/lib/schemas/index.ts").catch(() => null);
const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("prefix: a product word in the name, then the type, the category, the name's first word, else ITEM", () => {
  assert.equal(m.codePrefix({ name: "Leather bag" }), "BAG");
  assert.equal(m.codePrefix({ name: "Ankara dress" }), "DRS");
  assert.equal(m.codePrefix({ name: "Ankara maxi dresses" }), "DRS");
  assert.equal(m.codePrefix({ name: "T-shirt, plain white" }), "TEE");
  assert.equal(m.codePrefix({ name: "Bone straight wig 24\"" }), "WIG");
  // No product word: the type's prefix.
  assert.equal(m.codePrefix({ name: "Ankara", productType: "clothing" }), "CLO");
  assert.equal(m.codePrefix({ name: "Something", productType: "bags" }), "BAG");
  // No type (or "other"): the category's first word, else the name's.
  assert.equal(m.codePrefix({ name: "Something", productType: "other", categoryName: "Fashion & Apparel" }), "FSHN");
  assert.equal(m.codePrefix({ name: "Shea butter 500ml" }), "SHEA");
  assert.equal(m.codePrefix({ name: "Jewellery set" }), "JWLR");
  assert.equal(m.codePrefix({ name: "Leather" }), "LTHR");
  assert.equal(m.codePrefix({ name: "2 pack socks" }), "PACK");
});

test("prefix: accents dropped, uppercase letters only, at most 4, empty names get ITEM", () => {
  assert.equal(m.codePrefix({ name: "Échelle" }), "ECHL");
  assert.equal(m.codePrefix({ name: "Ọ̀ṣọ́ ìlẹ̀kẹ̀" }), "OSO");
  assert.equal(m.codePrefix({ name: "Àdìrẹ wrapper" }), "ADR");
  assert.equal(m.codePrefix({ name: "" }), "ITEM");
  assert.equal(m.codePrefix({ name: "   " }), "ITEM");
  assert.equal(m.codePrefix({ name: "123 !!!" }), "ITEM");
  assert.equal(m.codePrefix({ name: "a" }), "ITEM");
  assert.equal(m.codePrefix({}), "ITEM");
  for (const name of ["Ankara maxi dress", "Supercalifragilistic", "Ẹ̀wà àgànyìn", "x y z", "Ọmọ"]) {
    const prefix = m.codePrefix({ name });
    assert.match(prefix, /^[A-Z]{2,4}$/, name);
  }
  assert.equal(m.shortenWord("DRESS"), "DRS");
  assert.equal(m.shortenWord("AUDIO"), "AD");
  assert.equal(m.shortenWord("BAG"), "BAG");
});

test("numbering: the next number for the prefix in the store, ignoring other prefixes and odd codes", () => {
  assert.equal(m.nextShortCode("BAG", []), "BAG1");
  assert.equal(m.nextShortCode("BAG", ["BAG1", "BAG2"]), "BAG3");
  assert.equal(m.nextShortCode("BAG", ["BAG1", "BAG9", null, undefined]), "BAG10");
  // Gaps aren't reused (a deleted BAG2 stays retired); other prefixes and custom codes don't count.
  assert.equal(m.nextShortCode("BAG", ["BAG1", "BAG3", "BAGS2", "BAGX", "DRS7", "MYBAG1"]), "BAG4");
  assert.equal(m.nextShortCode("DRS", ["BAG1", "BAG2"]), "DRS1");
  assert.equal(m.codeNumber("BAG", "BAG12"), 12);
  assert.equal(m.codeNumber("BAG", "BAGS12"), null);
});

test("collisions: only a unique clash on the code is retried", () => {
  assert.equal(m.isShortCodeClash({ code: "P2002", meta: { target: ["storeId", "shortCode"] } }), true);
  assert.equal(m.isShortCodeClash({ code: "P2002", meta: { target: "StoreProduct_storeId_shortCode_key" } }), true);
  assert.equal(m.isShortCodeClash({ code: "P2002", meta: {} }), true);
  assert.equal(m.isShortCodeClash({ code: "P2002", meta: { target: ["slug"] } }), false);
  assert.equal(m.isShortCodeClash({ code: "P2025" }), false);
  assert.equal(m.isShortCodeClash(new Error("boom")), false);
  assert.equal(m.isShortCodeClash(null), false);

  const server = read("src/lib/products/short-code.server.ts");
  // Retries with a freshly read next number, then still makes the product (without a code) rather than failing.
  assert.match(server, /for \(let attempt = 0; attempt < ATTEMPTS; attempt \+= 1\)/);
  assert.match(server, /if \(!isShortCodeClash\(error\)\) throw error;/);
  assert.match(server, /return create\(null\);/);
  assert.match(server, /shortCode: \{ startsWith: prefix \}/);
});

test("validation: 2–8 uppercase letters and digits, tidied before checking", () => {
  assert.deepEqual(m.checkShortCode(" bag2 "), { ok: true, code: "BAG2" });
  assert.deepEqual(m.checkShortCode("DRS10"), { ok: true, code: "DRS10" });
  assert.deepEqual(m.checkShortCode("AB"), { ok: true, code: "AB" });
  assert.deepEqual(m.checkShortCode("ABCDEFGH"), { ok: true, code: "ABCDEFGH" });
  for (const bad of ["", "A", "ABCDEFGHI", "BAG-2", "BAG 2", "ÉTÉ1", null, undefined]) assert.equal(m.checkShortCode(bad).ok, false, String(bad));
  if (schemas) {
    assert.equal(schemas.ShortCodeSchema.parse("bag2"), "BAG2");
    assert.equal(schemas.ShortCodeSchema.safeParse("b").success, false);
    assert.equal(schemas.ShortCodeSchema.safeParse("BAG_2").success, false);
    assert.equal(schemas.StoreProductUpdateSchema.parse({ shortCode: "drs3" }).shortCode, "DRS3");
    assert.equal(schemas.StoreProductUpdateSchema.safeParse({ shortCode: "TOOLONGCODE" }).success, false);
  }
  // A duplicate gets a friendly 409 on create and edit, which the forms turn into words.
  for (const path of ["src/app/api/store/products/route.ts", "src/app/api/store/products/[id]/route.ts", "src/app/api/app/store-products/route.ts"]) {
    assert.match(read(path), /apiError\("CODE_TAKEN", `Another product already uses the code/, path);
  }
  assert.match(read("src/app/components/ProductForm.tsx"), /err\?\.error\?\.code === "CODE_TAKEN"/);
  assert.match(read("apps/mobile/src/app/product/[id].tsx"), /e\.code === "CODE_TAKEN"/);
});

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

test("every product create path assigns a code", () => {
  const creators = sourceFiles("src").filter((path) => /storeProduct\.(create|createMany|upsert)\(/.test(read(path)));
  const expected = [
    "src/app/actions/imports.ts",
    "src/app/actions/sourcing.ts",
    "src/app/actions/workspace.ts",
    "src/app/api/app/dropship/start/route.ts",
    "src/app/api/app/store-products/add-from-supplier/route.ts",
    "src/app/api/app/store-products/route.ts",
    "src/app/api/mobile/marketplace/route.ts",
    "src/app/api/products/import/route.ts",
    "src/app/api/store/products/route.ts",
    "src/lib/ai/rex/build-store.ts",
  ];
  assert.deepEqual(creators.sort(), expected);
  for (const path of creators) {
    const source = read(path);
    assert.doesNotMatch(source, /storeProduct\.createMany\(/, `${path}: createMany can't number codes`);
    assert.match(source, /withShortCode\(/, `${path}: goes through withShortCode`);
    // Each create is the callback that receives the code.
    for (const match of source.matchAll(/storeProduct\.create\(/g)) {
      const before = source.slice(Math.max(0, match.index - 120), match.index);
      assert.match(before, /\(shortCode(: string \| null)?\) =>\s*db\.$/, `${path}: a create outside withShortCode`);
    }
    assert.match(source, /^\s+shortCode,$/m, `${path}: the code goes into the row`);
  }
  // The seed's demo products come with codes too.
  assert.match(read("prisma/seed.ts"), /shortCode: "BAG1"/);
});

test("the schema has the column and the per-store unique index", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model StoreProduct {"), schema.indexOf("\n}\n", schema.indexOf("model StoreProduct {")));
  assert.match(model, /\n  shortCode\s+String\?\n/);
  assert.match(model, /@@unique\(\[storeId, shortCode\]\)/);
});

test("the migration exists, is additive and backfills with the same rules", () => {
  const path = "docs/migrations/2026-11-28-product-short-codes.sql";
  assert.ok(existsSync(join(root, path)));
  const sql = read(path);
  const code = sql.replace(/--[^\n]*/g, "");
  assert.match(code, /ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;/);
  assert.match(code, /CREATE UNIQUE INDEX IF NOT EXISTS "StoreProduct_storeId_shortCode_key" ON "StoreProduct"\("storeId", "shortCode"\);/);
  for (const banned of [/\bDROP\b/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bRENAME\b/i, /ALTER\s+COLUMN/i, /SET\s+NOT\s+NULL/i]) assert.doesNotMatch(code, banned);
  // The only data change fills the new column, and only where it's still empty.
  const updates = code.match(/UPDATE\s+"\w+"/g) ?? [];
  assert.deepEqual(updates, ['UPDATE "StoreProduct"']);
  assert.match(code, /SET "shortCode" = numbered\.code\s+FROM numbered\s+WHERE sp\."id" = numbered\."id" AND sp\."shortCode" IS NULL;/);
  assert.match(code, /row_number\(\) OVER \(PARTITION BY x\."storeId", x\.prefix ORDER BY x\."createdAt", x\."id"\)/);
  // Its word and type lists are the ones the app uses.
  const pairs = (block) => Object.fromEntries([...block.matchAll(/\('([A-Za-z]+)', '([A-Z]+)'\)/g)].map((match) => [match[1], match[2]]));
  const nouns = code.slice(code.indexOf("nouns(word, prefix)"), code.indexOf("types(product_type, prefix)"));
  const types = code.slice(code.indexOf("types(product_type, prefix)"), code.indexOf("plain AS ("));
  assert.deepEqual(pairs(nouns), { ...m.PRODUCT_NOUNS });
  assert.deepEqual(pairs(types), { ...m.TYPE_PREFIX });
  assert.match(code, /'ITEM'/);
});

test("codes in a customer's message find the product (WhatsApp auto-reply and chat)", () => {
  assert.deepEqual(m.codesInText("Hi, I want bag2 and DRS 3 pls. bag2 again"), ["BAG2", "DRS3"]);
  assert.deepEqual(m.codesInText("How much is delivery to Lekki phase 1?"), ["PHASE1"]);
  assert.deepEqual(m.codesInText("no codes here"), []);
  assert.deepEqual(m.codesInText(""), []);
  const products = [{ id: "a", shortCode: "BAG2" }, { id: "b", shortCode: "DRS3" }];
  assert.deepEqual(m.productsByCodeInText(products, "dRs3 abeg").map((p) => p.id), ["b"]);
  assert.deepEqual(m.productsByCodeInText(products, "PHASE1"), []);
  const bot = read("src/lib/inbox/chatbot.server.ts");
  assert.match(bot, /codesInText\(last\)/);
  assert.match(bot, /shortCode: \{ in: codes \}/);
  assert.match(bot, /intent = \{ kind: "product", productId: named\.id \}/);
  assert.match(bot, /Products \(code \| name \| price \| stock/);
});

test("pickers: search by code puts the exact code first; find by code adds it", () => {
  const products = [
    { id: "1", name: "Small bag pouch", shortCode: "BAG1" },
    { id: "2", name: "Leather bag", shortCode: "BAG2" },
    { id: "3", name: "Ankara dress", shortCode: "DRS1" },
    { id: "4", name: "Old thing", shortCode: null },
  ];
  assert.deepEqual(m.searchProducts(products, "bag2").map((p) => p.id), ["2"]);
  assert.deepEqual(m.searchProducts(products, "bag").map((p) => p.id), ["1", "2"]);
  assert.deepEqual(m.searchProducts(products, "drs").map((p) => p.id), ["3"]);
  assert.deepEqual(m.searchProducts(products, "", 2).map((p) => p.id), ["1", "2"]);
  assert.equal(m.findByCode(products, " drs1 ")?.id, "3");
  assert.equal(m.findByCode(products, "BAG9"), null);
  assert.equal(m.findByCode(products, ""), null);

  const phone = read("apps/mobile/src/app/record-sale.tsx");
  assert.match(phone, /searchProducts\(products, search, 6\)/);
  assert.match(phone, /findByCode\(products, typed\)/);
  assert.match(phone, /fetchProductByCode\(typed\)/);
  assert.match(phone, /t\("sale\.codeFind"\)/);
  const web = read("src/app/home/orders/new/RecordSaleForm.tsx");
  assert.match(web, /searchProducts\(products, search, 8\)/);
  assert.match(web, /\/api\/store\/products\?code=/);
  assert.match(web, /<ProductCodeBadge code=\{product\.shortCode\} \/>/);
  const api = read("src/app/api/store/products/route.ts");
  assert.match(api, /if \(code\) where\.shortCode = normalizeShortCode\(code\)/);
  assert.match(api, /\{ shortCode: normalizeShortCode\(q\)/);
});

test("WhatsApp message: name – price, code, link with ?ref=wa, in the seller's words", () => {
  const message = m.productShareMessage(
    { name: "Ankara Maxi Dress ", price: "₦18,500", code: "DRS3", url: "https://ada.mybos.store/product/p1" },
    { code: "Code", orderHere: "Order here" },
  );
  assert.equal(message, "Ankara Maxi Dress – ₦18,500\nCode: DRS3\nOrder here: https://ada.mybos.store/product/p1?ref=wa");
  assert.equal(
    m.productShareMessage({ name: "Bag", price: null, code: null, url: "https://x.test/product/p?a=1" }, { code: "Kóòdù", orderHere: "Ra á níbí" }),
    "Bag\nRa á níbí: https://x.test/product/p?a=1&ref=wa",
  );
  assert.equal(m.whatsappShareLink("Hi & bye\nCode: BAG2"), "https://wa.me/?text=Hi%20%26%20bye%0ACode%3A%20BAG2");
  assert.equal(m.whatsappAppLink("Hi"), "whatsapp://send?text=Hi");
  assert.equal(m.storefrontProductUrl("https://ada.mybos.store/", "p 1"), "https://ada.mybos.store/product/p%201");
  // The tracking ref is the shared one.
  assert.match(read("shared/product-codes.ts"), /withChannelRef\(product\.url, "whatsapp"\)/);
});

test("Share to WhatsApp and the code show where sellers see products", () => {
  const share = read("apps/mobile/src/lib/share.ts");
  assert.match(share, /Linking\.openURL\(whatsappAppLink\(message\)\)/);
  assert.match(share, /catch \{\n\s+await shareText\(message\);/);
  assert.match(read("apps/mobile/src/components/seller/StockRows.tsx"), /<ShareProductIcon product=\{product\} \/>/);
  assert.match(read("apps/mobile/src/components/seller/StockRows.tsx"), /<CodeBadge code=\{product\.shortCode\} \/>/);
  const detail = read("apps/mobile/src/app/product/[id].tsx");
  assert.match(detail, /<ShareProductButton product=/);
  assert.match(detail, /<CodeBadge code=\{product\.shortCode\} \/>/);
  assert.match(detail, /t\("code\.label"\)/);
  assert.match(read("apps/mobile/src/app/order/[id].tsx"), /line\.shortCode \? <CodeBadge/);
  assert.match(read("apps/mobile/src/app/add-products.tsx"), /<ShareProductButton product=\{recent\[0\]\} \/>/);
  const component = read("apps/mobile/src/components/seller/ProductCode.tsx");
  assert.match(component, /t\("product\.code"\), orderHere: t\("product\.orderHere"\)/);

  const webList = read("src/app/products/page.tsx");
  assert.match(webList, /<ShareWhatsAppButton compact product=/);
  assert.match(webList, /<ProductCodeBadge code=\{p\.shortCode\} \/>/);
  assert.match(read("src/app/products/[id]/page.tsx"), /<ShareWhatsAppButton product=/);
  const button = read("src/components/products/ShareWhatsAppButton.tsx");
  assert.match(button, /href=\{whatsappShareLink\(message\)\}/);
  assert.match(button, /target="_blank"/);
  assert.match(read("src/app/home/orders/[id]/page.tsx"), /<ProductCodeBadge code=\{itemCodes\[item\.productId\]!\} \/>/);
  assert.match(read("src/app/api/app/orders/[id]/route.ts"), /withItemCodes\(store\.id/);
  // The storefront product page: "Code: BAG2", small, under the name.
  assert.match(read("src/components/storefront/boutique/pdp/BoutiquePdp.tsx"), /\{words\("product\.code"\)\}: <span className="font-mono/);
  assert.match(read("src/lib/storefront/product-page.server.ts"), /shortCode: true/);
});

test("share and code words exist in all five languages", async () => {
  for (const [ns, keys] of [
    ["common", ["product.code", "product.orderHere", "product.shareWhatsapp"]],
    ["products", ["code.label", "code.hint", "code.auto", "code.invalid", "code.taken", "code.sub"]],
    ["m_productedit", ["code.label", "code.hint", "code.format", "code.taken"]],
    ["orders", ["sale.codeFind", "sale.codePlaceholder", "sale.codeNone"]],
    ["m_orders", ["sale.codeFind", "sale.codePlaceholder", "sale.codeNone"]],
  ]) {
    const en = (await import(`../shared/i18n/messages/${ns}/en.ts`)).default;
    for (const lang of ["pcm", "yo", "ha", "ig"]) {
      const words = (await import(`../shared/i18n/messages/${ns}/${lang}.ts`)).default;
      for (const key of keys) {
        assert.ok(words[key] && en[key], `${ns}/${lang}: ${key}`);
        if (lang !== "pcm") assert.notEqual(words[key], en[key], `${ns}/${lang}: ${key} is translated`);
      }
    }
  }
});
