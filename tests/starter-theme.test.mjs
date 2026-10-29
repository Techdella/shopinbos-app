// Stores no longer start on the "blank" setup layout (a split hero with empty colour tiles): with no theme picked they
// get a free library theme that fits what they sell (src/lib/store-templates/starter.ts), and stores already on it
// are moved by scripts/move-blank-starter-stores.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lib = await import("../src/lib/store-templates/theme-library.ts");

test("the starter theme fits the shop and is always free", () => {
  assert.equal(lib.starterThemeId({ storeCategory: "phone accessories, wireless earbuds, headphones" }), "plug");
  assert.equal(lib.starterThemeId({ storeCategory: "jollof rice and small chops" }), "pantry");
  // Nothing to go on: Afẹ́fẹ́.
  assert.equal(lib.starterThemeId({}), "breeze");
  assert.equal(lib.STARTER_FALLBACK_THEME_ID, "breeze");
  // A premium pick falls back to a free theme for the same kind of shop.
  assert.notEqual(lib.themeTier(lib.pickThemeByRules({ storeCategory: "hair and wigs" }).themeId), "basic");
  const hair = lib.starterThemeId({ storeCategory: "hair and wigs" });
  assert.equal(lib.themeTier(hair), "basic");
  assert.equal(lib.themeLibraryEntry(hair).category, "beauty");
  for (const words of ["luxury watches", "baby clothes", "books", "car parts", "pet food", ""]) {
    assert.equal(lib.themeTier(lib.starterThemeId({ storeCategory: words })), "basic", words);
  }
});

test("older phone looks stand for real themes", async () => {
  const onboarding = await import("../shared/onboarding.ts");
  for (const look of onboarding.BRAND_LOOKS) assert.ok(lib.isLibraryTheme(look.templateId), `${look.key} points at a library theme`);
  for (const [legacy, id] of Object.entries(onboarding.LEGACY_LOOK_THEME_IDS)) {
    assert.ok(!lib.isLibraryTheme(legacy), `${legacy} is not a theme`);
    assert.ok(onboarding.BRAND_LOOKS.some((look) => look.templateId === id), `${legacy} maps to a look`);
  }
  // What the shop sells wins over the (pre-selected) look; the look only decides when nothing else does.
  assert.equal(lib.starterThemeId({ storeCategory: "earbuds and headphones" }, "adire"), "plug");
  assert.equal(lib.starterThemeId({}, "adire"), "adire");
  assert.match(read("src/app/api/store/templates/apply/route.ts"), /LEGACY_LOOK_THEME_IDS\[sent\]/);
});

test("the blank starter's empty hero tiles don't come across", () => {
  const hero = (items) => ({ templateId: "blank", pages: [{ pageType: "home", sections: [{ id: "h", kind: "hero-split", blocks: [], items }] }] });
  const empty = lib.withoutBlankPlaceholders(hero([{ title: "", subtitle: "", color: "#16302B" }, { title: "", subtitle: "", color: "#0FA493" }]));
  assert.equal(empty.pages[0].sections[0].items, undefined);
  const withImage = lib.withoutBlankPlaceholders(hero([{ title: "", color: "#16302B", imageUrl: "https://x/hero.png" }, { title: "", color: "#0FA493" }]));
  assert.deepEqual(withImage.pages[0].sections[0].items, [{ title: "", color: "#16302B", imageUrl: "https://x/hero.png" }]);
  assert.ok(lib.isBlankStarter({ templateId: "blank" }));
  assert.ok(!lib.isBlankStarter({ templateId: "breeze" }));
});

test("no store path falls back to the blank starter any more", () => {
  for (const path of ["src/lib/ai/rex/build-store.ts", "src/lib/ai/rex/studio.server.ts", "src/lib/store-navigation.server.ts", "src/lib/store-publishing.ts", "src/app/api/store/editor/route.ts"]) {
    const source = read(path);
    assert.ok(!source.includes("createBlankEditorSnapshot"), `${path} doesn't build the blank starter`);
    assert.ok(source.includes("fallbackDraftSnapshot"), `${path} uses the starter theme`);
  }
  // Rex moves a blank draft onto a theme when it builds the store.
  assert.match(read("src/lib/ai/rex/build-store.ts"), /moveOffBlankStarter\(current/);
  // The move keeps live stores' looks until the seller publishes, and tells them once.
  const move = read("src/lib/themes/apply.server.ts");
  assert.match(move, /settingsWithThemeDraft/);
  assert.match(move, /dedupeKey: `blank-starter-move:\$\{store\.id\}`/);
  assert.match(read("scripts/move-blank-starter-stores.ts"), /--dry-run/);
});
