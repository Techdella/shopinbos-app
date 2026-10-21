// Sharing reviews: reviews left on the store show the store's name (and logo), reviewers get a photo or initials,
// and the coming-soon marketplaces (Jumia, Konga) aren't offered as import sources yet.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const r = await import("../src/lib/reviews/pure.ts");

test("shoppers read the store's name, not \"Your store\", for reviews left on the store", () => {
  assert.equal(r.publicSourceLabel("store", "Rexi"), "Rexi");
  assert.equal(r.publicSourceLabel("google", "Rexi"), "Google");
});

test("reviewer initials and photos", () => {
  assert.equal(r.reviewerInitials("Desiree Sloan"), "DS");
  assert.equal(r.reviewerInitials("ade"), "A");
  assert.equal(r.reviewerInitials("  "), "?");
  assert.equal(r.safeReviewerPhoto("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
  assert.equal(r.safeReviewerPhoto("javascript:alert(1)"), null);
  assert.equal(r.safeReviewerPhoto('https://x.com/a" onerror="x'), null);
});

test("Jumia and Konga aren't import sources while they're coming soon", () => {
  assert.ok(!r.IMPORT_SOURCES.includes("jumia"));
  assert.ok(!r.IMPORT_SOURCES.includes("konga"));
  assert.ok(r.IMPORT_SOURCES.includes("marketplace"));
  assert.doesNotMatch(read("src/lib/reviews/extract.ts"), /jumia|konga/);
  assert.doesNotMatch(read("shared/i18n/messages/reviews/en.ts"), /Jumia|Konga/);
});

test("the widget shows the store logo and an avatar per review, written as text only", () => {
  const script = r.buildWidgetScript({ storeName: "Rexi", storeLogo: "https://cdn.example.com/logo.png", wallUrl: "https://rexi.mybos.store/reviews", average: 5, count: 1, reviews: [{ name: "Desiree S.", rating: 5, text: "Great <b>lamp</b>", source: "Rexi", date: "2026-10-01", photo: null }] });
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(script, /"storeLogo":"https:\/\/cdn\.example\.com\/logo\.png"/);
  assert.match(script, /function ini\(n\)\{var p=String\(n\|\|""\)\.trim\(\)\.split\(\/\\s\+\/\)/);
  assert.doesNotMatch(script, /innerHTML/);
});

test("the share page uses the store badge and reviewer avatars", () => {
  const page = read("src/app/home/reviews/share/page.tsx");
  assert.match(page, /item\.source === "store" \? <StoreBadge store=\{store\} \/>/);
  assert.match(page, /<ReviewerAvatar name=\{item\.authorName\} photoUrl=\{item\.authorPhotoUrl\} \/>/);
});
