// Rex's photo library (shared/rex-photo-library.ts): stock photos stored in Shopinbos's own Supabase Storage for
// store banners and About photos, with photographer credits and the seller-category mapping used in onboarding.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lib = await import("../shared/rex-photo-library.ts");
const { REX_LIBRARY_CATEGORIES, REX_PHOTO_LIBRARY, REX_LIBRARY_BASE_URL, rexLibrary, rexLibraryFor, rexLibraryCategoriesFor } = lib;

const UTM = "utm_source=shopinbos&utm_medium=referral";
const STORAGE_PATH = "/storage/v1/object/public/shopinbos-media/rex-library/";

test("every photo lives on the Shopinbos Supabase host, not on Unsplash", () => {
  const host = new URL(REX_LIBRARY_BASE_URL).host;
  assert.match(host, /\.supabase\.co$/);
  for (const photo of REX_PHOTO_LIBRARY) {
    for (const href of [photo.url, photo.thumbUrl]) {
      const url = new URL(href);
      assert.equal(url.protocol, "https:", href);
      assert.equal(url.host, host, href);
      assert.ok(url.pathname.startsWith(`${STORAGE_PATH}${photo.category}/`), href);
    }
    const unsplashId = photo.id.replace(/^unsplash:/, "");
    assert.ok(photo.url.endsWith(`/${unsplashId}.jpg`), photo.url);
    assert.ok(photo.thumbUrl.endsWith(`/${unsplashId}-480.jpg`), photo.thumbUrl);
  }
});

test("every photo is credited with referral links and the Unsplash licence", () => {
  for (const photo of REX_PHOTO_LIBRARY) {
    assert.match(photo.id, /^unsplash:[A-Za-z0-9_-]+$/);
    assert.equal(photo.source, "unsplash");
    assert.equal(photo.licence, "Unsplash License");
    assert.ok(photo.credit.name.trim(), photo.id);
    assert.match(photo.credit.profileUrl, /^https:\/\/unsplash\.com\/@[^?]+\?/);
    assert.ok(photo.credit.profileUrl.endsWith(UTM), photo.credit.profileUrl);
    assert.match(photo.sourceUrl, /^https:\/\/unsplash\.com\/photos\/[A-Za-z0-9_-]+\?/);
    assert.ok(photo.sourceUrl.endsWith(UTM), photo.sourceUrl);
    assert.ok(photo.alt.length >= 10 && photo.alt.length <= 90, photo.alt);
    assert.equal(photo.width, 1600, photo.id);
    assert.ok(Number.isInteger(photo.height) && photo.height > 0, photo.id);
  }
});

test("ids are unique", () => {
  const ids = REX_PHOTO_LIBRARY.map((photo) => photo.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every category has at least five photos", () => {
  for (const category of REX_LIBRARY_CATEGORIES) {
    const photos = rexLibrary(category);
    assert.ok(photos.length >= 5, `${category}: ${photos.length}`);
    assert.ok(photos.every((photo) => photo.category === category));
  }
  assert.equal(rexLibrary().length, REX_PHOTO_LIBRARY.length);
  for (const photo of REX_PHOTO_LIBRARY) assert.ok(REX_LIBRARY_CATEGORIES.includes(photo.category), photo.category);
});

test("seller categories map to the library, with people, backgrounds and markets after", () => {
  const tail = ["people", "backgrounds", "markets"];
  assert.deepEqual(rexLibraryCategoriesFor(["Hair and beauty"]), ["hair_beauty", ...tail]);
  assert.deepEqual(rexLibraryCategoriesFor(["Fashion", "Food"]), ["fashion", "food", ...tail]);
  assert.deepEqual(rexLibraryCategoriesFor(["Gadgets", "Home"]), ["gadgets", "home", ...tail]);
  assert.deepEqual(rexLibraryCategoriesFor(["Other"]), tail);
  assert.deepEqual(rexLibraryCategoriesFor([]), tail);
  // The marketplace's longer names, and the library's own keys, work too.
  assert.deepEqual(
    rexLibraryCategoriesFor(["Phones and gadgets", "Food and drinks", "Home and kitchen", "Hair and wigs", "Shoes and bags"]),
    ["gadgets", "food", "home", "hair_beauty", "fashion", ...tail],
  );
  assert.deepEqual(rexLibraryCategoriesFor(["hair_beauty", "fashion", "Fashion"]), ["hair_beauty", "fashion", ...tail]);

  const photos = rexLibraryFor(["Food"]);
  assert.equal(photos[0].category, "food");
  assert.equal(photos.length, ["food", ...tail].reduce((sum, category) => sum + rexLibrary(category).length, 0));
});

test("the licence record lists every photo", () => {
  const doc = readFileSync(new URL("../docs/rex-photo-library.md", import.meta.url), "utf8");
  for (const photo of REX_PHOTO_LIBRARY) {
    const unsplashId = photo.id.replace(/^unsplash:/, "");
    assert.ok(doc.includes(`\`${unsplashId}\``), unsplashId);
    assert.ok(doc.includes(photo.credit.name), photo.credit.name);
  }
});
