// Peggy's opener on the product page follows the product's type and what's still empty: an electronics product is
// asked for brand, model and price, never sizes; a dress is asked for sizes and colours (shared/peggy-opener.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const opener = await import("../shared/peggy-opener.ts");
const en = (await import("../shared/i18n/messages/productTypes/en.ts")).default;
const types = await import("../shared/product-types.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const t = (key, vars = {}) => (en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
const form = (patch) => ({ name: "", description: "", productType: null, basePrice: null, options: [], variants: [], details: {}, customDetails: [], ...patch });

test("electronics: Peggy asks for brand, model and condition, not sizes", () => {
  const result = opener.peggyOpener(form({ productType: "electronics", name: "Hisense 43 inch TV" }), t);
  assert.equal(result.greeting, "I'm here to help with this product. Tell me the brand, model, condition and price, and I'll fill them in. A photo of the item or its label works too.");
  assert.doesNotMatch(`${result.greeting} ${result.examples.join(" ")} ${result.placeholder}`, /size/i);
  assert.equal(result.examples[0], en["peggy.example.electronics"]);
  assert.equal(result.placeholder, "Tell Peggy the brand, model…");
  // Filled details drop out; what's left is asked.
  const later = opener.peggyOpener(form({ productType: "electronics", basePrice: 250000, details: { brand: "Hisense", model: "43A6", condition: "Brand new" } }), t);
  assert.match(later.greeting, /Tell me the power and warranty,/);
});

test("clothing and phones ask for the versions that fit them", () => {
  const dress = opener.peggyOpener(form({ productType: "clothing", basePrice: 15000, details: { material: "Cotton", fit: "Slim fit", gender: "Women", care: "Hand wash" } }), t);
  assert.match(dress.greeting, /Tell me the size and colour,/);
  const phone = opener.missingThings(form({ productType: "phones", basePrice: 300000, details: { model: "iPhone 13", condition: "UK used", ram: "6GB", battery: "88%", warranty: "3 months" } }));
  assert.deepEqual(phone, [{ kind: "option", key: "Storage" }, { kind: "option", key: "Colour" }, { kind: "option", key: "Condition" }]);
  // Services never get sizes or colours.
  for (const thing of opener.missingThings(form({ productType: "service" }))) assert.notEqual(thing.kind, "option");
});

test("no type, everything filled, and a description already there", () => {
  assert.equal(opener.peggyOpener(form({}), t).greeting, en["peggy.greetNone"]);
  const full = Object.fromEntries(types.productTypeDef("books").fields.map((field) => [field.key, "x"]));
  const done = opener.peggyOpener(form({ productType: "books", basePrice: 5000, details: full, description: "A novel." }), t);
  assert.equal(done.greeting, en["peggy.greetDone"]);
  assert.equal(done.examples[1], en["peggy.exampleImprove"]);
  assert.equal(done.placeholder, en["peggy.placeholderAny"]);
});

test("every type has an example in every language, and the old size-only lines are gone", async () => {
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const messages = (await import(`../shared/i18n/messages/productTypes/${lang}.ts`)).default;
    for (const key of [...types.PRODUCT_TYPE_KEYS.map((type) => `peggy.example.${type}`), "peggy.example.none", "peggy.greetType", "peggy.greetNone", "peggy.greetDone", "peggy.list", "peggy.price", "peggy.placeholderFor", "peggy.placeholderAny", "peggy.exampleImprove"]) {
      assert.ok(messages[key], `${lang} ${key}`);
    }
    for (const key of ["peggy.greeting", "peggy.example1", "peggy.placeholder"]) assert.equal(messages[key], undefined, `${lang} ${key}`);
  }
  const peggy = read("src/app/components/product-form/ProductPeggy.tsx");
  assert.match(peggy, /peggyOpener\(getState\(\)/);
  assert.match(peggy, /context=\{opener\.voiceContext\}/);
  // The model is told to fit the product, and the fallback example follows the type too.
  assert.match(read("shared/product-assistant.ts"), /Never ask a TV, phone, book or service seller about clothing sizes/);
  assert.equal(opener.peggyExampleEn("electronics"), en["peggy.example.electronics"]);
  assert.match(read("src/lib/products/assistant.server.ts"), /peggyExampleEn\(state\.productType\)/);
});
