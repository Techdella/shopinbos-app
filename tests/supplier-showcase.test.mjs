// Supplier public page extras (shared/supplier-showcase.ts): the Shopinbos store link, the website, "Meet the team",
// and "Ask for a price" opening a chat instead of sending signed-in sellers to sign in again.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const showcase = await import("../shared/supplier-showcase.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

test("links: https added, only http(s) with a real host", () => {
  assert.equal(showcase.cleanLink("kalospice.mybos.store"), "https://kalospice.mybos.store/");
  assert.equal(showcase.cleanLink(" https://www.kalospice.com/shop "), "https://www.kalospice.com/shop");
  for (const bad of ["", null, "javascript:alert(1)", "mailto:a@b.com", "kalospice", "http://localhost"]) assert.equal(showcase.cleanLink(bad), null, String(bad));
  assert.equal(showcase.linkLabel("https://www.kalospice.com/shop/"), "kalospice.com/shop");
  assert.equal(showcase.linkLabel("https://kalospice.mybos.store/"), "kalospice.mybos.store");
});

test("team: named people with a photo, at most eight", () => {
  const member = (i, extra = {}) => ({ id: `m${i}`, name: `Person ${i}`, role: "Account manager", photoUrl: `https://cdn.example/${i}.jpg`, ...extra });
  const state = { storeUrl: "shop.mybos.store", workshopPhotos: [], showcaseTeam: [member(1), member(2, { photoUrl: "javascript:x" }), member(3, { name: "" }), "junk", ...Array.from({ length: 10 }, (_, i) => member(i + 10))] };
  const out = showcase.supplierShowcase(state);
  assert.equal(out.storeUrl, "https://shop.mybos.store/");
  assert.equal(out.team.length, showcase.SHOWCASE_TEAM_MAX);
  assert.deepEqual(out.team[0], member(1));
  assert.ok(!out.team.some((m) => m.id === "m2" || m.id === "m3"));
  assert.deepEqual(showcase.supplierShowcase(null), { storeUrl: null, team: [] });
});

test("Ask for a price opens a chat for sellers; guests sign in and come back to it", () => {
  const page = read("src/app/suppliers/[slug]/page.tsx");
  assert.doesNotMatch(page, /intent=request_quote/);
  assert.match(page, /\/login\?next=\$\{encodeURIComponent\(`\/suppliers\/\$\{supplier\.slug\}\?ask=price`\)\}/);
  assert.match(page, /<AskPriceButton /);
  const button = read("src/components/suppliers/AskPriceButton.tsx");
  assert.match(button, /\/api\/conversations\/\$\{encodeURIComponent\(supplierId\)\}\/messages/);
  assert.match(button, /get\("ask"\) !== "price"/);
  for (const lang of ["pcm", "yo", "ha", "ig"]) {
    for (const key of Object.keys(CATALOGS.marketplace.en).filter((k) => /^price\.|^pub\.(store|website|team)/.test(k))) assert.ok(CATALOGS.marketplace[lang][key], `marketplace ${lang} ${key}`);
    for (const key of Object.keys(CATALOGS.supplier.en).filter((k) => /^profile\.(team|storeUrl|websiteHint)/.test(k))) assert.ok(CATALOGS.supplier[lang][key], `supplier ${lang} ${key}`);
  }
});
