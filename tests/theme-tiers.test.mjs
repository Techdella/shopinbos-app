// Theme tiers: basic themes come with every store, premium themes with Growth, platinum with Seller Pro
// (src/lib/theme-access.ts, src/lib/store-templates/theme-library.ts). A store keeps the theme it already has after
// a downgrade; only switching is checked, on every path that can switch (apply route, editor save, Rex).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lib = await import("../src/lib/store-templates/theme-library.ts");
const access = await import("../src/lib/theme-access.ts");
const { BUILTIN_PLAN_VERSIONS } = await import("../shared/plan-catalog.ts");

const DAY = 86_400_000;
const NOW = new Date("2026-10-20T09:00:00Z");
const code = (tier, billing = "monthly") => BUILTIN_PLAN_VERSIONS.find((version) => version.tier === tier && version.billing === billing && version.current).code;
const paid = (tier, extra = {}) => ({ planCode: code(tier), planStatus: "active", planPaidUntil: new Date(NOW.getTime() + 10 * DAY), ...extra });

test("every theme has a tier, and each tier has themes across shop types", () => {
  for (const theme of lib.THEME_LIBRARY) assert.ok(lib.THEME_TIERS.includes(theme.tier), `${theme.id} has a tier`);
  const byTier = Object.fromEntries(lib.THEME_TIERS.map((tier) => [tier, lib.filterThemesByTier(tier).map((theme) => theme.id)]));
  assert.ok(byTier.basic.length >= 6, "free stores get a real choice");
  assert.ok(byTier.basic.includes("plain") && byTier.basic.includes("aaro"), "the any-shop themes are free");
  assert.ok(byTier.premium.length > 0 && byTier.platinum.length > 0);
  assert.deepEqual(byTier.platinum, ["noir", "agbada", "turare", "oba", "gbedu", "sarauniya", "zinariya"]);
  assert.deepEqual(byTier.basic.filter((id) => ["omalicha", "zuma", "oku", "ihe"].includes(id)), ["omalicha", "zuma", "oku", "ihe"], "the new free themes");
  assert.deepEqual(byTier.premium.filter((id) => ["kasuwa", "nkata", "uwa"].includes(id)), ["kasuwa", "nkata", "uwa"]);
  assert.equal(lib.themeLibraryEntry("highlife").tier, "premium");
  assert.equal(lib.filterThemesByTier("all").length, lib.THEME_LIBRARY.length);
  // Rex's no-AI fallback pick is a free theme.
  assert.equal(lib.themeTier(lib.pickThemeByRules({}).themeId), "basic");
  // Older templates (not in the library) count as basic, so stores on them can always come back.
  assert.equal(lib.themeTier("some-old-template"), "basic");
});

test("tiers include the ones below them", () => {
  assert.ok(lib.tierIncludes("platinum", "premium") && lib.tierIncludes("platinum", "basic") && lib.tierIncludes("premium", "basic"));
  assert.ok(!lib.tierIncludes("basic", "premium") && !lib.tierIncludes("premium", "platinum"));
  assert.deepEqual(access.unlockedTiers("premium"), ["basic", "premium"]);
});

test("a seller's theme tier follows their paid plan", () => {
  assert.equal(access.sellerThemeTier(null, NOW), "basic");
  assert.equal(access.sellerThemeTier({ planCode: null, planStatus: null, planPaidUntil: null }, NOW), "basic");
  assert.equal(access.sellerThemeTier(paid("seller_growth"), NOW), "premium");
  assert.equal(access.sellerThemeTier(paid("seller_pro"), NOW), "platinum");
  assert.equal(access.sellerThemeTier({ ...paid("seller_pro"), planCode: code("seller_pro", "annual") }, NOW), "platinum");
  // A cancelled plan keeps its perks until the paid time runs out; then it's back to basic.
  assert.equal(access.sellerThemeTier(paid("seller_pro", { planStatus: "cancelled" }), NOW), "platinum");
  assert.equal(access.sellerThemeTier(paid("seller_pro", { planPaidUntil: new Date(NOW.getTime() - DAY) }), NOW), "basic");
  // Supplier plans and unknown codes unlock nothing on a store.
  assert.equal(access.sellerThemeTier(paid("supplier_max"), NOW), "basic");
  assert.equal(access.sellerThemeTier({ ...paid("seller_pro"), planCode: "PLN_unknown" }, NOW), "basic");
});

test("switching is checked; staying on the current theme never is", () => {
  assert.ok(access.checkThemeSwitch("plain", "basic").ok);
  const refused = access.checkThemeSwitch("oba", "basic", "plain");
  assert.equal(refused.ok, false);
  assert.equal(refused.tier, "platinum");
  assert.equal(refused.message, "Ọba is a platinum theme. Upgrade to Seller Pro to use it.");
  assert.match(access.checkThemeSwitch("ewa", "basic").message, /Upgrade to Growth/);
  assert.ok(access.checkThemeSwitch("ewa", "premium").ok);
  assert.equal(access.checkThemeSwitch("gbedu", "premium").ok, false);
  assert.ok(access.checkThemeSwitch("gbedu", "platinum").ok);
  // A store set up on a premium theme keeps it (and can re-apply it) after its plan lapses.
  assert.ok(access.checkThemeSwitch("noir", "basic", "noir").ok);
});

test("every path that switches themes checks the plan", () => {
  const apply = read("src/app/api/store/templates/apply/route.ts");
  assert.match(apply, /checkThemeSwitch\(manifest\.id, await loadSellerThemeTier\(user\.id\)/);
  assert.match(apply, /UPGRADE_REQUIRED/);
  const editor = read("src/app/api/store/editor/route.ts");
  assert.match(editor, /nextThemeId !== draft\?\.templateId/);
  assert.match(editor, /checkThemeSwitch\(nextThemeId/);
  const tools = read("src/lib/ai/rex/tools.ts");
  assert.match(tools, /checkThemeSwitch\(input\.themeId/);
  const studio = read("src/lib/ai/rex/studio-edit.server.ts");
  assert.match(studio, /if \(plan\.theme\) \{\s+const access = checkThemeSwitch/);
  assert.match(studio, /studioThemes\(draft\.templateId, await loadSellerThemeTier\(store\.userId\)\)/);
  // The gallery shows the tier on every card and sends locked themes to Billing.
  const gallery = read("src/components/builder/ThemeLibrary.tsx");
  assert.match(gallery, /TIER_BADGE\[theme\.tier\]/);
  assert.match(gallery, /UPGRADE_HREF/);
  assert.match(read("src/components/builder/theme-preview/ThemePreview.tsx"), /export const UPGRADE_HREF = "\/home\/settings\?tab=Billing"/);
});
