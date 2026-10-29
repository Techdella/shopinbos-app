// Store buttons that link inside the store (Discover more, Explore …) kept no side padding: the in-page link button
// reset padding inline, which beat .bq-btn. The reset is now the zero-specificity .bq-plain class.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("in-page link buttons keep .bq-btn padding", () => {
  const shared = read("src/components/storefront/boutique/blocks/shared.tsx");
  const fn = shared.slice(shared.indexOf("export function ItemLink"), shared.indexOf("export function itemLink"));
  assert.doesNotMatch(fn, /padding: 0/);
  assert.match(fn, /bq-plain/);
  const storefront = read("src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.doesNotMatch(storefront, /border: 0, padding: 0, textAlign: "left"/);
  const css = read("src/components/storefront/boutique/look.ts");
  assert.match(css, /:where\(\.bq-plain\)\{[^}]*padding:0/);
  assert.ok(css.indexOf(":where(.bq-plain)") < css.indexOf(".bq-btn{display:inline-flex"));
  assert.match(css, /\.bq-btn\{[^}]*padding:0 22px/);
});
