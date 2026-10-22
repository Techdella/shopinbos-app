// "Rex is here to help" on the store pages and in the builder.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every Your store page (and brand kit, media, templates, domain) has Rex help with a page-specific action", () => {
  const strip = read("src/components/learn/RexHelpStrip.tsx");
  for (const path of ["/home/store", "/home/pages", "/home/navigation", "/home/cms", "/home/checkout", "/home/commerce/cart", "/home/seo", "/home/legal", "/home/brand-kit", "/home/media", "/home/domain", "/builder/templates"]) {
    assert.ok(strip.includes(`["${path}", {`), path);
  }
  assert.match(strip, /\/seller\/store\/builder\?rex=menu/);
  assert.match(read("src/components/seller/SellerPage.tsx"), /<RexHelpStrip className="mb-5" \/>/);
  const en = read("shared/i18n/messages/learn/en.ts");
  for (const key of ["menus", "pages", "content", "checkout", "cart", "seo", "legal", "brand", "media", "domain", "templates", "store"]) assert.match(en, new RegExp(`"rexhelp\\.page\\.${key}"`), key);
});

test("the store builder says Rex is there and opens him in one tap", () => {
  const builder = read("src/components/builder/editor/Builder.tsx");
  assert.match(builder, /tx\("Rex is here to help\."\)/);
  assert.match(builder, /onClick=\{\(\) => setPanel\("rex"\)\}/);
  assert.match(builder, /REX_HINT_KEY/);
});
