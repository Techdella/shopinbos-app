// The searchable state picker (apps/mobile/src/components/StatePicker.tsx) used wherever someone picks Nigerian
// states on the phone: one field that opens a list with a search box, instead of 37 chips.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const src = read("apps/mobile/src/components/StatePicker.tsx");
// The pure helpers, evaluated from the source (they use no React Native).
const pure = (() => {
  const body = src.slice(src.indexOf("export function plainText"), src.indexOf("export function StatePicker"));
  const js = body.replace(/export /g, "").replace(/: readonly PickOption\[\]/g, "").replace(/: readonly string\[\]/g, "").replace(/: string/g, "");
  return new Function(`${js}; return { plainText, filterOptions, pickedSummary };`)();
})();
const OPTIONS = ["Lagos", "Ogun", "Oyo", "Osun", "FCT", "Ondo"].map((value) => ({ value, label: value === "FCT" ? "Abuja (FCT)" : value }));

test("search matches word starts first, ignores case and accents, and sorts A to Z", () => {
  assert.deepEqual(pure.filterOptions(OPTIONS, "").map((o) => o.label), ["Abuja (FCT)", "Lagos", "Ogun", "Ondo", "Osun", "Oyo"]);
  assert.deepEqual(pure.filterOptions(OPTIONS, "og").map((o) => o.value), ["Ogun"]);
  assert.deepEqual(pure.filterOptions(OPTIONS, "fct").map((o) => o.value), ["FCT"]);
  assert.deepEqual(pure.filterOptions(OPTIONS, "ỌYỌ").map((o) => o.value), ["Oyo"]);
  assert.deepEqual(pure.filterOptions(OPTIONS, "gun").map((o) => o.value), ["Ogun"]);
  assert.deepEqual(pure.filterOptions(OPTIONS, "zz"), []);
});

test("the closed field sums up what was picked", () => {
  assert.equal(pure.pickedSummary(OPTIONS, []), "");
  assert.equal(pure.pickedSummary(OPTIONS, ["Lagos", "FCT"]), "Lagos, Abuja (FCT)");
  assert.equal(pure.pickedSummary(OPTIONS, ["Lagos", "Ogun", "Oyo", "Osun"]), "Lagos, Ogun +2");
});

test("every phone screen that picks states uses the searchable picker, not a wall of chips", () => {
  for (const file of ["app/onboarding/where.tsx", "app/delivery/where.tsx", "app/supplier/setup.tsx", "app/ads/new.tsx"]) {
    const screen = read(`apps/mobile/src/${file}`);
    assert.match(screen, /<StatePicker/, file);
    assert.doesNotMatch(screen, /(NG_STATES|SELL_STATES)\.map\(\(\w+\) => (<Seg|<Chip|\{)/, file);
  }
});
