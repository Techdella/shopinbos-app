// Store pages on the phone: the shop's pages, product collections and content, through the web's own routes, with
// "on the web" rows for layouts and content items. Rex Studio replaces the Rex videos tile.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lib = await import("../apps/mobile/src/lib/store-pages-pure.ts");

test("collection slugs fit the server's rule and differ each time", () => {
  let n = 0;
  const random = () => [0.1, 0.9][n++ % 2];
  const a = lib.collectionSlug("New arrivals! Under ₦10,000", random);
  assert.match(a, /^[a-z0-9-]+$/);
  assert.ok(a.startsWith("new-arrivals-under-10-000-"));
  assert.notEqual(a, lib.collectionSlug("New arrivals! Under ₦10,000", random));
  assert.match(lib.collectionSlug("!!!"), /^collection-[a-z0-9]{4}$/);
});

test("the screen: pages, collections and content, using the web's routes", () => {
  const screen = read("apps/mobile/src/app/store-pages.tsx");
  for (const call of ["saveStorePage(", "createProductCollection(", "addToCollection(", "removeFromCollection(", "fetchContentCollections"]) assert.ok(screen.includes(call), call);
  const source = read("apps/mobile/src/lib/store-pages.ts");
  assert.match(source, /"\/api\/store\/pages"/);
  assert.match(source, /\/api\/store\/collections\/\$\{encodeURIComponent\(id\)\}\/products/);
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /path: "app:\/store-pages"/);
  assert.match(read("apps/mobile/src/lib/web.ts"), /"\/home\/pages": "\/store-pages"/);
});

test("Rex Studio on the phone", () => {
  assert.ok(existsSync(new URL("../apps/mobile/src/app/studio.tsx", import.meta.url)));
  const studio = read("apps/mobile/src/app/studio.tsx");
  for (const go of ['"/video"', '"/packaging"', 'format: "flyer"', 'format: "post"', '"/rex"']) assert.ok(studio.includes(go), go);
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /id: "studio", label: "Rex Studio", icon: "sparkle", tone: "ink", path: "app:\/studio"/);
});
