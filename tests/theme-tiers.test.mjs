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
  assert.deepEqual(byTier.platinum, ["noir", "agbada", "turare", "oba", "gbedu", "sarauniya", "zinariya", "oso", "shakara", "aga", "itan", "ike", "eso", "ite", "ola"]);
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
  assert.equal(refused.message, "Ọba is a platinum theme. Buy it once in the theme gallery, or upgrade to Seller Pro, to use it.");
  assert.match(access.checkThemeSwitch("ewa", "basic").message, /upgrade to Growth/);
  assert.ok(access.checkThemeSwitch("ewa", "premium").ok);
  assert.equal(access.checkThemeSwitch("gbedu", "premium").ok, false);
  assert.ok(access.checkThemeSwitch("gbedu", "platinum").ok);
  // A store set up on a premium theme keeps it (and can re-apply it) after its plan lapses.
  assert.ok(access.checkThemeSwitch("noir", "basic", "noir").ok);
});

test("every path that switches themes checks the plan", () => {
  const apply = read("src/app/api/store/templates/apply/route.ts");
  assert.match(apply, /const themeAccess = await loadSellerThemeAccess\(user\.id\);\s+const access = checkThemeSwitch\(manifest\.id, themeAccess\.tier, [^)]+, themeAccess\.owned\)/);
  assert.match(apply, /UPGRADE_REQUIRED/);
  const editor = read("src/app/api/store/editor/route.ts");
  assert.match(editor, /nextThemeId !== draft\?\.templateId/);
  assert.match(editor, /checkThemeSwitch\(nextThemeId, themeAccess\.tier, draft\?\.templateId, themeAccess\.owned\)/);
  const tools = read("src/lib/ai/rex/tools.ts");
  assert.match(tools, /checkThemeSwitch\(input\.themeId, themeAccess\.tier, currentId, themeAccess\.owned\)/);
  const studio = read("src/lib/ai/rex/studio-edit.server.ts");
  assert.match(studio, /if \(plan\.theme\) \{\s+const themeAccess = await loadSellerThemeAccess\(store\.userId\);\s+const access = checkThemeSwitch\(plan\.theme, themeAccess\.tier, draft\.templateId, themeAccess\.owned\)/);
  assert.match(studio, /studioThemes\(draft\.templateId, await loadSellerThemeAccess\(store\.userId\)\)/);
  // The gallery shows the tier on every card and sends locked themes to Billing.
  const gallery = read("src/components/builder/ThemeLibrary.tsx");
  assert.match(gallery, /TIER_BADGE\[theme\.tier\]/);
  assert.match(gallery, /UPGRADE_HREF/);
  assert.match(read("src/components/builder/theme-preview/ThemePreview.tsx"), /export const UPGRADE_HREF = "\/home\/settings\?tab=Billing"/);
});

test("a theme bought on its own works on any plan; everyone can preview every theme", async () => {
  // Bought themes pass the switch check whatever the plan; others stay locked.
  assert.ok(access.checkThemeSwitch("oba", "basic", "plain", ["oba"]).ok);
  assert.equal(access.checkThemeSwitch("gbedu", "basic", "plain", ["oba"]).ok, false);
  assert.ok(access.themeUsable("oba", { tier: "basic", owned: ["oba"] }));
  assert.ok(access.themeUsable("plain", { tier: "basic", owned: [] }));
  assert.equal(access.themeUsable("ewa", { tier: "basic", owned: [] }), false);
  // Prices live in Admin › Pricing: ₦2,000 for a premium theme and ₦3,000 for a platinum one by default.
  const { PRICE_SETTINGS } = await import("../shared/platform-pricing.ts");
  const purchase = await import("../shared/theme-purchase.ts");
  assert.equal(PRICE_SETTINGS["themes.premium"].default, 2000);
  assert.equal(PRICE_SETTINGS["themes.platinum"].default, 3000);
  const book = { "themes.premium": 2000, "themes.platinum": 3000 };
  assert.equal(purchase.themePriceNaira("premium", book), 2000);
  assert.equal(purchase.themePriceNaira("platinum", book), 3000);
  assert.equal(purchase.themePriceNaira("basic", book), null);
  assert.equal(purchase.formatThemePrice(2000), "₦2,000");
  // The purchase is verified with Paystack before it counts, from the callback and the webhook alike.
  const server = read("src/lib/themes/purchase.server.ts");
  assert.match(server, /verifyPaystackTransaction\(reference\)/);
  assert.match(server, /metadata\.purpose !== "theme_purchase"/);
  assert.match(server, /Number\(verified\.amount\) !== row\.amountKobo/);
  assert.match(server, /updateMany\(\{ where: \{ reference, status: "pending" \}, data: \{ status: "paid"/);
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /ref\.startsWith\(THEME_REFERENCE_PREFIX\)\) \{\s+await completeThemePurchase\(ref\)/);
  assert.match(read("docs/migrations/2026-11-16-theme-purchases.sql"), /CREATE TABLE IF NOT EXISTS "ThemePurchase"/);
  // Locked cards keep Preview and offer Buy (with the plan as the other way in); bought ones show Owned.
  const gallery = read("src/components/builder/ThemeLibrary.tsx");
  assert.match(gallery, /onClick=\{\(\) => setPreviewId\(theme\.id\)\}/);
  assert.match(gallery, /onClick=\{\(\) => void buyTheme\(theme\.id\)\}/);
  assert.match(gallery, /t\("tl\.owned"\)/);
  assert.match(read("src/components/builder/theme-preview/ThemePreview.tsx"), /t\("tl\.buy", \{ price: buyPrice \}\)/);
});
