// The owner's Android test of version 10 (round 2): the keyboard covering Rex's onboarding chat, "Where do you sell?"
// before payments (which never blocks), publishing from the phone, every theme free for launch (ALL_THEMES_FREE),
// Edit my shop on the builder's own data, Rex with photos, and no competitor names in the import flows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const onboarding = await import("../shared/onboarding.ts");
const plans = await import("../shared/plans.ts");
const access = await import("../src/lib/theme-access.ts");
const looks = await import("../src/lib/store-templates/mobile-looks.ts");
const themes = await import("../src/lib/store-templates/theme-library.ts");
const edit = await import("../apps/mobile/src/lib/shop-edit-pure.ts");
const { NAMESPACES, CATALOGS } = await import("../shared/i18n/catalog.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

test("the keyboard never covers a chat's text box (Android draws edge to edge, so padding on both systems)", () => {
  const shift = app("components/KeyboardShift.tsx");
  assert.match(shift, /KEYBOARD_BEHAVIOR = "padding"/);
  assert.match(shift, /keyboardVerticalOffset=\{offset\}/);
  assert.match(shift, /addListener\("keyboardDidShow"/, "the newest message scrolls into sight when the keyboard opens");
  // Every screen that avoided the keyboard on iOS only now uses the shared one.
  for (const file of ["components/OnboardingFrame.tsx", "components/ChatScreen.tsx", "components/Screen.tsx", "components/AuthForm.tsx", "app/peggy.tsx", "app/payments.tsx", "app/delivery/zones.tsx"]) {
    const source = app(file);
    assert.match(source, /<KeyboardShift/, file);
    assert.doesNotMatch(source, /behavior=\{(?:Platform\.OS === "ios"|IOS) \? "padding" : undefined\}/, file);
  }
  for (const file of ["components/ChatScreen.tsx", "app/peggy.tsx", "components/OnboardingFrame.tsx"]) assert.match(app(file), /useScrollToEndOnKeyboard\(/, file);
  // Sign-up's one-question screens use the shared frame (keyboard included), numbered "3 of 9"; a chat in the frame
  // still sticks to its newest message.
  assert.match(app("app/onboarding/index.tsx"), /<OnboardingFrame\s+step="chat"\s+progress=\{\{ current: sellerQuestionNumber\(question\), total: SELLER_QUESTIONS\.length \}\}/);
  assert.match(app("components/OnboardingFrame.tsx"), /onContentSizeChange=\{chat \?/);
  assert.equal(JSON.parse(app("../app.json")).expo.android.softwareKeyboardLayoutMode, "resize");
});

test("onboarding asks where the seller sells, before payments", () => {
  const steps = onboarding.PROGRESS_STEPS;
  assert.ok(steps.indexOf("where") > steps.indexOf("products") && steps.indexOf("where") < steps.indexOf("payments"));
  assert.match(app("app/onboarding/products.tsx"), /router\.push\("\/onboarding\/where"\)/);
  const where = app("app/onboarding/where.tsx");
  assert.match(where, /saveDeliverySettings\(\{ sellArea: saved\.area, sellStates: saved\.states/, "saved like the delivery settings (the web's SellAreaPicker model)");
  assert.match(where, /pathname: "\/onboarding\/payments"/);
  assert.match(where, /canonicalState\(loaded\?\.settings\.originState/, "starts on the shop's own state");
  assert.match(where, /getForegroundPermissionsAsync/, "or the phone's, when location is already allowed");
  assert.doesNotMatch(where, /disabled=\{/, "Continue is never disabled");
  assert.doesNotMatch(where, /sellLimit|allowedSellChoice/, "every plan can sell anywhere");
});

test("where a shop sells is the seller's choice on every plan, and Continue always has something to save", () => {
  assert.equal(onboarding.allowedSellChoice, undefined, "no plan limit on where a shop sells");
  assert.deepEqual(onboarding.sellChoiceToSave({ area: "nationwide", states: ["Lagos"] }, "Lagos"), { area: "nationwide", states: [] });
  assert.deepEqual(onboarding.sellChoiceToSave({ area: "one_state", states: [] }, null), { area: "one_state", states: ["Lagos"] });
  assert.deepEqual(onboarding.sellChoiceToSave({ area: "one_state", states: [] }, "Kano"), { area: "one_state", states: ["Kano"] });
});

test("payments starts with delivery fees for where the shop sells, and its button never blocks", () => {
  // One state: one zone, no "everywhere else" catch-all.
  const one = onboarding.zonesForSellChoice({ area: "one_state", states: ["Oyo"] }, "Oyo");
  assert.deepEqual(one.map((zone) => zone.regions), [["Oyo"]]);
  const some = onboarding.zonesForSellChoice({ area: "selected", states: ["Lagos", "Ogun", "Oyo"] }, "Lagos");
  assert.deepEqual(some.map((zone) => zone.regions), [["Lagos"], ["Ogun", "Oyo"]]);
  assert.ok(some.every((zone) => zone.regions.length > 0));
  const all = onboarding.zonesForSellChoice({ area: "nationwide", states: [] }, "Lagos");
  assert.deepEqual(all.at(-1).regions, [], "only selling everywhere adds the catch-all, last");
  const payments = app("app/onboarding/payments.tsx");
  assert.doesNotMatch(payments, /DEFAULT_DELIVERY_ZONES/, "fees follow the seller's own answer, not Lagos defaults");
  assert.match(payments, /zonesForSellChoice\(/);
  assert.match(payments, /router\.replace\(\{ pathname: "\/onboarding\/live"/, "always moves on, with the reason if it couldn't go live");
  // The server saves the delivery fees as chosen: no plan limit on where a shop sells.
  const route = read("src/app/api/app/onboarding/payments/route.ts");
  assert.doesNotMatch(route, /sellingStatesProblem|planProblem/);
  assert.match(route, /\.\.\.ordered\.map\(/);
  // The live screen offers Publish when the shop isn't live.
  const live = app("app/onboarding/live.tsx");
  assert.match(live, /<PublishButton/);
  assert.match(live, /params\.publishError/);
});

test("every publish button goes through publishShop, with the live sheet or the server's own reason", () => {
  const lib = app("lib/publish.ts");
  assert.match(lib, /api<unknown>\("\/api\/store\/editor\/publish", \{ method: "POST" \}\)/);
  const kit = app("components/seller/PublishShop.tsx");
  assert.match(kit, /publishError instanceof Error && publishError\.message \? publishError\.message/, "the real reason, not a vague failure");
  assert.match(kit, /t\("publish\.liveTitle"\)/);
  assert.match(kit, /openShop\(shop\.url!\)/);
  assert.match(kit, /shareShop\(\)/);
  for (const file of ["app/start.tsx", "app/rex.tsx", "app/templates.tsx"]) assert.match(app(file), /usePublishShop\(/, file);
  for (const file of ["app/(tabs)/shop.tsx", "app/onboarding/live.tsx", "app/shop-edit.tsx"]) assert.match(app(file), /<PublishButton/, file);
  assert.match(app("app/onboarding/payments.tsx"), /await publishShop\(\)/);
  for (const file of ["app/start.tsx", "app/rex.tsx", "app/templates.tsx", "app/onboarding/payments.tsx"]) assert.doesNotMatch(app(file), /publishStore/, file);
  // A switched look is never live until it's published (it used to say "done" and hide Put it live).
  const templates = app("app/templates.tsx");
  assert.match(templates, /draftOnly: result\.draftOnly, live: false/);
  assert.doesNotMatch(templates, /live: !result\.draftOnly/);
  // My shop: one obvious button while the shop isn't live.
  assert.match(app("app/(tabs)/shop.tsx"), /shopIsLive\(setup\) === false/);
  for (const key of ["publish.button", "publish.notLive", "publish.liveTitle", "publish.view", "publish.failed"]) for (const lang of LANGS) assert.ok(CATALOGS.m_shop[lang][key], `${lang} ${key}`);
});

test("ALL_THEMES_FREE: one launch switch makes every theme usable on the web, the phone and the server", () => {
  assert.equal(plans.ALL_THEMES_FREE, true);
  assert.equal(access.launchThemeTier("basic"), "platinum");
  assert.equal(access.launchThemeTier("basic", false), "basic", "off: the plan's own tier again");
  for (const theme of themes.THEME_LIBRARY) assert.ok(access.checkThemeSwitch(theme.id, access.launchThemeTier("basic"), "plain").ok, theme.id);
  const library = looks.mobileLooks({ tier: access.launchThemeTier("basic"), owned: [] }, "plain");
  assert.ok(library.looks.every((look) => look.lockedPlan === null), "no lock badges or Needs the X plan on the phone");
  // Every check reads the tier through the switch (apply route, editor, Rex, web gallery, phone).
  assert.match(read("src/lib/theme-access.server.ts"), /if \(ALL_THEMES_FREE\) return launchThemeTier\("basic"\)/);
  assert.match(read("src/components/builder/ThemeLibrary.tsx"), /ALL_THEMES_FREE \? null/);
  assert.match(read("src/components/builder/theme-preview/ThemePreview.tsx"), /ALL_THEMES_FREE \? null/);
  assert.match(app("app/templates.tsx"), /ALL_THEMES_FREE \? null/);
});

test("Edit my shop changes the draft with the builder's own operations", () => {
  const draft = {
    templateId: "aaro",
    themeTokens: { accent: "#121212" },
    pages: [{
      pageType: "home",
      sections: [
        { id: "announcement", kind: "announcement-bar", name: "Announcement Bar", visible: true, blocks: [{ id: "announcement-copy", type: "copy", content: { text: "" } }] },
        { id: "header", kind: "header", name: "Header", visible: true, blocks: [] },
        { id: "hero", kind: "hero-split", name: "Hero", visible: true, blocks: [{ id: "hero-copy", type: "copy", content: { title: "Hello", body: "", primaryCta: "Shop" } }], items: [{ title: "slide" }] },
        { id: "featured", kind: "featured-products", name: "Best Sellers", visible: true, blocks: [], items: [{ mappedStoreProductId: "p1" }, { title: "fake", mappedStoreProductId: null }] },
        { id: "faq", kind: "faq", name: "Questions", visible: false, blocks: [] },
        { id: "footer", kind: "footer", name: "Footer", visible: true, blocks: [] },
      ],
    }],
  };
  const model = edit.readShopEdit(draft);
  assert.deepEqual(model.sections.map((section) => section.id), ["hero", "featured", "faq"], "header, footer and the announcement bar aren't moved");
  assert.equal(model.sections[2].visible, false);
  assert.deepEqual(model.featured.productIds, ["p1"]);
  assert.deepEqual(edit.announcementOp(model, " Free delivery "), { op: "update-block-content", pageType: "home", sectionId: "announcement", blockId: "announcement-copy", content: { text: "Free delivery" } });
  assert.deepEqual(edit.heroCopyOp(model, { title: "New", body: "Body", cta: "Buy" }).content, { title: "New", body: "Body", primaryCta: "Buy" });
  const image = edit.heroImageOp(draft, model, "https://x.test/a.jpg");
  assert.deepEqual(image.changes.items[0], { title: "slide", imageUrl: "https://x.test/a.jpg", originalSrc: "https://x.test/a.jpg", resolvedSrc: "https://x.test/a.jpg" });
  assert.deepEqual(edit.featuredOp(model, ["p2", "p1", "p2"]).changes.items, [{ mappedStoreProductId: "p2" }, { mappedStoreProductId: "p1" }]);
  assert.equal(edit.moveOp(draft, "hero", -1), null, "the first section can't move above the header");
  assert.deepEqual(edit.moveOp(draft, "faq", -1), { op: "reorder-section", pageType: "home", fromIndex: 4, toIndex: 3 });
  assert.equal(edit.moveOp(draft, "faq", 1), null);
  assert.deepEqual(edit.toggleOp("faq", true), { op: "toggle-section", pageType: "home", sectionId: "faq", visible: true });
  assert.deepEqual(edit.accentOp("#f2a93b").changes, { accent: "#F2A93B", ctaBg: "#F2A93B", ctaText: "#16141F" });
  assert.equal(edit.readableOn("#16141F"), "#FFFFFF");
  // The screen uses the web's routes, and is linked from My shop, Shop looks, Start here and Rex.
  const lib = app("lib/shop-edit.ts");
  assert.match(lib, /api<EditorData>\("\/api\/store\/editor"\)/);
  assert.match(lib, /\{ method: "PATCH", json: \{ ops \} \}/);
  assert.match(lib, /"\/api\/app\/store", \{ method: "PATCH"/);
  for (const file of ["app/(tabs)/shop.tsx", "app/templates.tsx", "app/start.tsx", "app/rex.tsx"]) assert.match(app(file), /"(app:)?\/shop-edit"/, file);
  assert.match(app("app/shop-edit.tsx"), /uploadIdentityImage\("logo"/);
  for (const key of Object.keys(CATALOGS.m_shop.en).filter((entry) => entry.startsWith("editShop."))) for (const lang of LANGS) assert.ok(CATALOGS.m_shop[lang][key], `${lang} ${key}`);
});

test("Rex on the phone takes photos from the camera or gallery and sends them with the message", () => {
  const rex = app("app/rex.tsx");
  assert.match(rex, /pickPhotos\(source, room\)/);
  assert.match(rex, /uploadPhoto\(photo, "store-banners"\)/);
  assert.match(rex, /askRex\(messages, attached\)/);
  assert.match(app("lib/rex.ts"), /imageUrls: imageUrls\.slice\(0, REX_MAX_PHOTOS\)/);
  assert.match(app("lib/photos.ts"), /api<\{ publicUrl: string \}>\("\/api\/upload"/);
  assert.match(read("src/lib/ai/rex/agent-pure.ts"), /export const REX_MAX_PHOTOS = 6;/, "the phone's limit matches the server's");
  assert.match(app("components/ChatScreen.tsx"), /\{attach\}/);
});

test("no competitor names in the import flows, in any of the five languages", () => {
  const builders = /\b(Bumpa|Shopify|Selar|Paystack Storefront|Flutterwave Store|Catlog|WooCommerce|Wix|Squarespace)\b/i;
  for (const ns of NAMESPACES) for (const lang of LANGS) for (const [key, value] of Object.entries(CATALOGS[ns][lang] ?? {})) assert.doesNotMatch(String(value), builders, `${ns} ${lang} ${key}`);
  // The import doors and product import pages don't name marketplaces either.
  const marketplaces = /\b(Jumia|Konga|Jiji)\b/i;
  for (const ns of ["m_onboarding", "products", "builder", "m_products", "glossary"]) for (const lang of LANGS) for (const [key, value] of Object.entries(CATALOGS[ns]?.[lang] ?? {})) assert.doesNotMatch(String(value), marketplaces, `${ns} ${lang} ${key}`);
  const doors = onboarding.PRODUCT_DOORS.find((door) => door.key === "file");
  assert.equal(doors.label, "Import from a CSV or Excel file");
  assert.doesNotMatch(`${doors.label} ${doors.hint} ${doors.note}`, builders);
});

test("My shop keeps the 'Your shop is live' sheet after the publish button goes away", async () => {
  const { readFileSync } = await import("node:fs");
  const { default: assert } = await import("node:assert/strict");
  const shop = readFileSync(new URL("../apps/mobile/src/app/(tabs)/shop.tsx", import.meta.url), "utf8");
  assert.match(shop, /<PublishButton testID="shop-publish" sheet=\{false\}/);
  assert.match(shop, /<ShopLiveSheet shop=\{justPublished\}/);
});
