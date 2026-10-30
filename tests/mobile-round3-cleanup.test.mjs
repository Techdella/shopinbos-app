// Phone app round 3 cleanup (a reviewer's list against the "Familiar app" prototype): initials that ignore a
// possessive "'s", one Shopinbos ring, chat source badges and email previews, the packaging sample following what the
// shop sells, one source for plan names, and the layout fixes most screens read from their source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);

const images = await import("../shared/identity-images.ts");
const supplier = await import("../apps/mobile/src/lib/supplier-pure.ts");
const rider = await import("../apps/mobile/src/lib/rider-pure.ts");
const chats = await import("../apps/mobile/src/lib/chats-pure.ts");
const pack = await import("../apps/mobile/src/lib/packaging-pure.ts");
const plans = await import("../shared/plans.ts");
const looks = await import("../src/lib/store-templates/mobile-looks.ts");

test("initials ignore a possessive 's, everywhere avatars are drawn", () => {
  assert.equal(images.initialsOf("Ada's Closet"), "AC");
  assert.equal(images.initialsOf("Ada’s Closet"), "AC");
  assert.equal(images.initialsOf("O'Neil Fabrics"), "OF");
  assert.equal(images.initialsOf("Ada Obi"), "AO");
  assert.equal(images.initialsOf(""), "?");
  assert.equal(supplier.initialsOf("Ada's Closet"), "AC");
  assert.equal(rider.initials("Tunde's Bikes"), "TB");
  assert.match(app("components/kit.tsx"), /const letters = initialsOf\(name\)/);
});

test("one Shopinbos ring: the team's updates join Shopinbos's getting-started ring", () => {
  const lib = app("lib/updates.ts");
  assert.match(lib, /export function withTeamUpdates\(/);
  assert.match(lib, /TEAM_POST_PREFIX = "team:"/);
  const here = app("lib/shopinbos.ts");
  assert.match(here, /if \(isTeamPost\(id\)\) void markTeamUpdateSeen\(teamUpdateId\(id\)\)/);
  // The viewer's line under the name doesn't repeat "Shopinbos"; a post without a picture is a designed card.
  const viewer = app("components/familiar/StoryViewer.tsx");
  assert.match(viewer, /export function storyByline\(/);
  assert.match(viewer, /testID="story-text-card"/);
  assert.match(viewer, /"ago\.days"/);
  assert.ok(read("shared/i18n/messages/m_familiar/en.ts").includes('"ago.days"'));
});

test("chats: a source badge on every row, and an email preview without its subject in front", () => {
  assert.equal(chats.chatPreview("Bulk order", "Bulk order · Can I get 20 pieces?"), "Can I get 20 pieces?");
  assert.equal(chats.chatPreview("Bulk order", "Can I get 20 pieces?"), "Can I get 20 pieces?");
  assert.equal(chats.chatPreview("Bulk order", ""), "Bulk order");
  assert.equal(chats.chatPreview(null, "Hello"), "Hello");
  assert.match(app("components/ChatList.tsx"), /<SourceBadge label=\{chat\.label\}/);
  assert.match(app("app/(tabs)/chats.tsx"), /preview: chatPreview\(chat\.subject, chat\.preview\)/);
  // Every chip row bleeds to the edges with 20px padding (FilterBar).
  for (const file of ["components/ChatList.tsx", "app/logistics/(tabs)/jobs.tsx", "app/supplier/(tabs)/orders.tsx", "app/delivery/find.tsx"]) assert.match(app(file), /<FilterBar>/, file);
  assert.match(app("components/FilterBar.tsx"), /paddingHorizontal: 20/);
});

test("packaging: the sample follows what the shop sells, as the web guesses it", () => {
  const fashion = [{ name: "Ankara wrap dress" }, { name: "Adire two-piece set", category: { name: "Clothing" } }, { name: "Kano leather crossbody bag" }];
  assert.equal(pack.shopProductType(fashion), "fashion");
  assert.ok(pack.formatsFor("fashion").includes("bag"));
  assert.equal(pack.shopProductType([{ name: "Shea body butter" }, { name: "Face serum" }]), "beauty");
  assert.equal(pack.shopProductType([]), "food");
  const screen = app("app/packaging.tsx");
  assert.match(screen, /product \? productTypeOf\(product\) : shopType/);
  assert.doesNotMatch(screen, /item\.name\.slice\(0, 21\)/, "long names wrap instead of being cut");
});

test("shop looks: the server's lock names the plan, but the phone shows no plan names (app store payment rules)", () => {
  assert.equal(plans.themeTierPlanName("basic"), "Free");
  assert.equal(plans.themeTierPlanName("premium"), "Starter");
  assert.equal(plans.themeTierPlanName("platinum"), "Growth");
  const library = looks.mobileLooks({ tier: "basic", owned: [] }, null);
  for (const look of library.looks) if (look.lockedPlan) assert.equal(look.lockedPlan, plans.themeTierPlanName(look.tier));
  const screen = app("app/templates.tsx");
  // No plan filter chips or plan-named lock tags in the app: "Not on your plan" only (tests/store-payments.test.mjs).
  assert.doesNotMatch(screen, /themeTierPlanName/);
  assert.match(screen, /<Tag label=\{t\("notOnPlan"\)\} icon="lock" \/>/);
  // The little shop (with its scrim under the theme name) is shared with sign-up's "Pick a look".
  assert.match(app("components/MiniShop.tsx"), /<LinearGradient/, "a scrim under the theme name");
  assert.match(screen, /<MiniShop /);
  // Sign-up's guided build puts the shop on a basic theme (open on every plan) and names no plan either.
  const signUp = app("components/rex-build/design.tsx");
  assert.doesNotMatch(signUp, /themeTierPlanName|lockedPlan/, "sign-up's styles name no plan either");
});

test("layout: one header gutter, one Back button, no Help on Help, short My shop", () => {
  const header = app("components/Screen.tsx");
  assert.match(header, /paddingLeft: 12, paddingRight: 20/);
  assert.match(header, /usePathname\(\)\.startsWith\("\/help"\)/);
  assert.match(app("components/ChatScreen.tsx"), /<HeaderBack /);
  assert.match(app("app/add-products.tsx"), /<Screen\b/);
  assert.doesNotMatch(app("app/add-products.tsx"), /BackButton/);
  const shop = app("app/(tabs)/shop.tsx");
  assert.match(shop, /export const ON_SCREEN = new Set\(\["products", "find", "delivery", "customers", "payouts", "settings", "ads", "automations", "video", "help"\]\)/);
  assert.match(shop, /<LanguageRow tile \/>/);
  // Web address records: monospace, selectable, a copy icon.
  assert.match(app("app/domain.tsx"), /fontFamily: fonts\.mono/);
  assert.match(app("components/icons.tsx"), /\| "copy"/);
  assert.match(app("theme.ts"), /mono: Platform\.select/);
  // Customers: the dot stays with the words before it.
  assert.match(app("app/customers/index.tsx"), /\\u00A0· /);
  // Find: the List/Cards toggle is an icon, so the title fits at 360px.
  assert.doesNotMatch(app("app/find/index.tsx"), /t\("swipe\.list"\)/);
});
