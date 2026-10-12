// Storefront owner preview (who sees a store that isn't live) and the 404 / error page copy helpers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const visibility = await import("../src/lib/storefront/store-visibility.ts");
const copy = await import("../src/components/errors/copy.ts");

test("a store is live only when active and published (a page or an editor snapshot)", () => {
  const published = { editor: { published: { templateId: "velour" } } };
  assert.equal(visibility.storeUnavailableReason({ status: "active", brandSettings: published }, 0), null);
  assert.equal(visibility.storeUnavailableReason({ status: "active", brandSettings: {} }, 2), null);
  assert.equal(visibility.storeUnavailableReason({ status: "active", brandSettings: {} }, 0), "unpublished");
  assert.equal(visibility.storeUnavailableReason({ status: "active", brandSettings: { editor: [] } }, 0), "unpublished");
  assert.equal(visibility.storeUnavailableReason({ status: "draft", brandSettings: published }, 3), "inactive");
  assert.equal(visibility.hasPublishedStorefront(null, 0), false);
  assert.equal(visibility.hasPublishedStorefront("x", 0), false);
});

test("only the owner previews a store that isn't live; everyone else sees it closed", () => {
  assert.equal(visibility.storefrontAccess(true, false), "live");
  assert.equal(visibility.storefrontAccess(true, true), "live", "a live store is just live, even for its owner");
  assert.equal(visibility.storefrontAccess(false, true), "preview");
  assert.equal(visibility.storefrontAccess(false, false), "closed");
  assert.deepEqual([...visibility.PREVIEW_PRODUCT_STATUSES].sort(), ["draft", "published"]);
});

test("quips: every pool has lines, the Nigerian-flavoured ones are there, storefront lines never name Shopinbos characters", () => {
  for (const pool of [copy.APP_NOT_FOUND_LINES, copy.APP_ERROR_LINES, copy.STORE_NOT_FOUND_LINES, copy.STORE_ERROR_LINES, copy.STORE_CLOSED_LINES]) {
    assert.ok(pool.length >= 3);
    assert.equal(new Set(pool).size, pool.length, "no duplicate lines (they double as React keys)");
  }
  assert.ok(copy.APP_NOT_FOUND_LINES.includes("Omo, this page don japa."));
  assert.ok(copy.APP_ERROR_LINES.includes("Our server took small break. E go soon wake."));
  for (const line of [...copy.STORE_NOT_FOUND_LINES, ...copy.STORE_ERROR_LINES, ...copy.STORE_CLOSED_LINES]) {
    assert.doesNotMatch(line, /Rex|Peggy|Shopinbos/);
  }
});

test("line rotation moves to a different line and random picks stay in range", () => {
  assert.equal(copy.nextLineIndex(0, 3), 1);
  assert.equal(copy.nextLineIndex(2, 3), 0);
  assert.equal(copy.nextLineIndex(0, 1), 0);
  assert.equal(copy.nextLineIndex(0, 0), 0);
  for (const roll of [0, 0.2, 0.5, 0.99, 1, -1, Number.NaN]) {
    const i = copy.randomLineIndex(5, roll);
    assert.ok(i >= 0 && i < 5);
    const j = copy.randomLineIndex(5, roll, 2);
    assert.ok(j >= 0 && j < 5 && j !== 2, `roll ${roll} avoided 2`);
  }
  assert.equal(copy.randomLineIndex(1, 0.7), 0);
});

test("error references are shown in full when short and trimmed when long", () => {
  assert.equal(copy.formatDigest(undefined), null);
  assert.equal(copy.formatDigest("  "), null);
  assert.equal(copy.formatDigest("1234567"), "1234567");
  assert.equal(copy.formatDigest("x".repeat(40)), `${"x".repeat(24)}…`);
});

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test("storefront server pages never fetch the app's own API over HTTP", () => {
  const files = [...walk("src/app/s"), ...walk("src/app/_domain"), "src/lib/commerce/storefront.server.ts"].filter((file) => /\.tsx?$/.test(file));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (source.startsWith('"use client"')) continue;
    assert.doesNotMatch(source, /fetch\(\s*`\$\{(baseUrl|appUrl)\}\/api\//, `${file} calls its own API over HTTP`);
  }
});

test("every app error boundary uses unstable_retry and the shared scenes", () => {
  for (const file of ["src/app/error.tsx", "src/app/global-error.tsx", "src/app/admin/error.tsx", "src/app/supplier/error.tsx", "src/app/logistics/error.tsx", "src/app/home/error.tsx", "src/app/s/[slug]/error.tsx", "src/app/_domain/[domain]/error.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /^"use client";/, `${file} is a client component`);
    assert.match(source, /unstable_retry/, `${file} retries`);
    assert.match(source, /@\/components\/errors\//, `${file} uses the shared scene`);
  }
  assert.match(readFileSync("src/app/global-error.tsx", "utf8"), /<html[\s>]/, "global-error brings its own <html>");
});
