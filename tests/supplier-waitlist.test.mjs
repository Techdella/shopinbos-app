// Sellers see every supplier, and "See their products" opens the supplier's own products page, where "Notify me when
// they add products" follows the supplier and tells them a named shop is waiting (in the app, email, WhatsApp).
// Web /marketplace/suppliers/[slug], the phone app's suppliers/[slug], src/lib/suppliers/product-requests.server.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const notifications = await import("../shared/notifications.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

test("the suppliers list shows everyone, with no far-away badge or distance filter", () => {
  const page = read("src/app/marketplace/suppliers/page.tsx");
  assert.doesNotMatch(page, /reach|farBadge|farFees|farNote|farHidden/);
  assert.match(page, /href=\{`\/marketplace\/suppliers\/\$\{s\.slug\}`\}/);
  assert.doesNotMatch(read("apps/mobile/src/components/SupplierTrust.tsx"), /farBadge/);
});

test("notify me: follows, tells the supplier once per shop by email and WhatsApp, and followers hear about new products", () => {
  const lib = read("src/lib/suppliers/product-requests.server.ts");
  assert.match(lib, /setFollowing\(supplier\.id, sellerUserId, true\)/);
  assert.match(lib, /dedupeKey: `supplier\.products_wanted:\$\{supplier\.id\}:\$\{sellerUserId\}`/);
  assert.match(lib, /email: true,\n    whatsapp: true,/);
  assert.match(lib, /\$\{shop\} wants to sell your products/);
  assert.match(read("src/lib/notifications/events.server.ts"), /if \(approved\) await notifyFollowersOfNewProduct\(product\.id\)/);
  assert.ok(notifications.eventInfo("supplier.products_wanted"));
  assert.ok(notifications.eventInfo("supplier.new_products"));
  for (const method of ["POST", "DELETE"]) assert.match(read("src/app/api/app/suppliers/[ref]/notify-me/route.ts"), new RegExp(`export const ${method} = withSeller`));
});

test("WhatsApp for an alert that asks for it: on unless they set that category themselves", () => {
  const notify = read("src/lib/notifications/notify.server.ts");
  assert.match(notify, /if \(input\.whatsapp && !rows\.some\(\(row\) => row\.eventKey === preferenceEventKey\(category\)\)\)/);
});

test("phone app: suppliers list and page, opened from Find and from a push", () => {
  for (const path of ["apps/mobile/src/app/suppliers/index.tsx", "apps/mobile/src/app/suppliers/[slug].tsx", "src/app/api/mobile/suppliers/route.ts", "src/app/api/mobile/suppliers/[slug]/route.ts"]) assert.ok(existsSync(join(root, path)), path);
  assert.match(read("apps/mobile/src/app/find/index.tsx"), /router\.push\("\/suppliers"\)/);
  assert.match(read("apps/mobile/src/app/find/[slug].tsx"), /pathname: "\/suppliers\/\[slug\]"/);
  assert.match(read("src/app/api/mobile/marketplace/products/route.ts"), /searchParams\.get\("supplier"\)/);
  assert.deepEqual(notifications.appRouteFor("/marketplace/suppliers/kalospice-ltd"), { pathname: "/suppliers/[slug]", params: { slug: "kalospice-ltd" } });
  assert.deepEqual(notifications.appRouteFor("https://app.shopinbos.com/marketplace/suppliers"), { pathname: "/suppliers" });
});

test("words in five languages", () => {
  const keys = Object.keys(CATALOGS.marketplace.en).filter((key) => /^waitlist\.|^sup\.(appRowSub|allTheirProducts)$/.test(key));
  assert.ok(keys.length >= 12);
  for (const lang of ["pcm", "yo", "ha", "ig"]) for (const key of keys) assert.ok(CATALOGS.marketplace[lang][key], `${lang} ${key}`);
});
