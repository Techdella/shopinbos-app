// Seller onboarding on the phone, "Rex builds your shop (step by step)" (shared/seller-onboarding.ts, the routes under
// src/app/api/mobile/onboarding, the screens under apps/mobile/src/app/onboarding and components/rex-build).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const flow = await import("../shared/seller-onboarding.ts");
const i18n = await import("../shared/i18n/index.ts");
const rexBuild = (await import("../shared/i18n/messages/m_rexBuild/index.ts")).default;
const auth = (await import("../shared/i18n/messages/m_auth/index.ts")).default;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the screens run B → C → D (five steps) → E, and back never lands on the build animation", () => {
  assert.deepEqual(flow.FLOW_SCREENS.slice(0, 6), ["intro", "name", "sell", "shop", "choose", "plan"]);
  assert.equal(flow.nextScreen("shop"), "choose");
  assert.equal(flow.nextScreen("choose"), "plan");
  assert.equal(flow.nextScreen("contact"), "building");
  assert.equal(flow.nextScreen("building"), "review");
  assert.equal(flow.nextScreen("live"), null);
  assert.equal(flow.previousScreen("review"), "contact", "back from the review skips the build screen");
  assert.equal(flow.previousScreen("intro"), null);
  assert.deepEqual(["plan", "products", "categories", "style", "colours", "banner", "words", "layout", "sections", "media", "about", "contact", "review"].map(flow.stepOf), [1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5]);
  assert.equal(flow.stepOf("shop"), null);
  assert.equal(flow.stepName(3), "home");
  // "Redesign with Rex" runs only the design steps: products, orders and contact settings are kept.
  const redesign = flow.screensFor("redesign");
  for (const screen of ["intro", "name", "products", "categories", "contact", "choose"]) assert.ok(!redesign.includes(screen), screen);
  assert.equal(flow.nextScreen("about", "redesign"), "building");
  assert.equal(flow.previousScreen("style", "redesign"), "plan");
});

test("resume: the saved screen, the review once built, nothing once live; welcome back says the step", () => {
  assert.equal(flow.resumeScreen(null, false), "intro");
  assert.equal(flow.resumeScreen({ screen: "banner" }, false), "banner");
  assert.equal(flow.resumeScreen({ screen: "building", builtAt: "2026-10-30T10:00:00Z" }, false), "review");
  assert.equal(flow.resumeScreen({ screen: "about", builtAt: "2026-10-30T10:00:00Z" }, false), "about", "changing an answer after a build carries on there");
  assert.equal(flow.resumeScreen({ screen: "review", liveAt: "2026-10-30T10:00:00Z" }, true), null);
  assert.equal(flow.resumeScreen({ screen: "bogus" }, false), "intro");
  assert.deepEqual(flow.welcomeBack({ screen: "banner", firstName: "Ada" }, "banner"), { name: "Ada", step: 3 });
  assert.deepEqual(flow.welcomeBack({ screen: "sell", firstName: "Ada" }, "sell"), { name: "Ada", step: null });
  assert.equal(flow.welcomeBack({}, "intro"), null);
  assert.equal(flow.stepsLeft("banner"), 3);
  assert.equal(flow.stepsLeft("shop"), 5);
  const merged = flow.mergeRexBuild({ words: { headline: "A" }, media: ["x"] }, { words: { cta: "Shop" }, media: ["y"] }, new Date("2026-10-30T00:00:00Z"));
  assert.deepEqual(merged.words, { headline: "A", cta: "Shop" }, "small objects merge");
  assert.deepEqual(merged.media, ["y"], "lists are replaced");
  assert.equal(merged.updatedAt, "2026-10-30T00:00:00.000Z");
  assert.deepEqual(flow.readRexBuild({ onboardingMemory: { rexBuild: { screen: "words" } } }), { screen: "words" });
});

test("B2 / B4: a first name, a 2–40 character shop name and a letters-and-numbers link with suggestions", () => {
  assert.equal(flow.cleanFirstName("  ada okafor ✨"), "Ada");
  assert.equal(flow.shopNameProblem("A"), "short");
  assert.equal(flow.shopNameProblem("x".repeat(41)), "long");
  assert.equal(flow.shopNameProblem("Ada's Hair"), null);
  assert.equal(flow.linkSlug("Ada’s Hair ✨"), "adashair", "emojis and punctuation stripped");
  assert.equal(flow.linkSlug("Ọjà Àkàrà 2"), "ojaakara2", "accents dropped");
  assert.equal(flow.linkProblem("ab"), "short");
  assert.equal(flow.linkProblem("1234"), "numbers");
  assert.equal(flow.linkProblem("adashair"), null);
  assert.deepEqual(flow.linkSuggestions("adashair", "Enugu"), ["adashair-enugu", "adashair2", "adashairng"]);
  assert.deepEqual(flow.linkSuggestions("adashair", null).slice(0, 2), ["adashair2", "adashairng"]);
  assert.equal(flow.cleanLinkInput("Ada's--Hair!"), "adas-hair");
});

test("go-live blockers: a product with a price, a name and link, a WhatsApp number", () => {
  assert.deepEqual(flow.goLiveBlockers({ pricedProducts: 0, name: "", slug: "", whatsapp: "0803" }), ["product", "name", "whatsapp"]);
  assert.deepEqual(flow.goLiveBlockers({ pricedProducts: 1, name: "Ada's Hair", slug: "adashair", whatsapp: "+234 803 555 0141" }), []);
  assert.equal(flow.validWhatsapp("08035550141"), true);
  assert.equal(flow.validWhatsapp("0803"), false);
});

test("Let Rex choose for me: Rex's pick on every screen, the same as the recommendation shown there", () => {
  const context = { categories: ["hair_beauty"], productCount: 5, bannerOptions: [{ url: "https://a/1.jpg", source: "product" }], wordOptions: [{ headline: "Hair that turns heads." }], libraryIds: ["a", "b", "c"] };
  assert.deepEqual(flow.rexChoice("style", context), { screen: "style", style: "warm" });
  assert.deepEqual(flow.rexChoice("colours", { ...context, style: "soft" }), { screen: "colours", palette: "teal" });
  assert.deepEqual(flow.rexChoice("banner", context).banner, context.bannerOptions[0]);
  assert.equal(flow.rexChoice("words", context).words.headline, "Hair that turns heads.");
  assert.deepEqual(flow.rexChoice("layout", context).layout, { layout: "grid", show: "best-sellers", showPrice: true });
  assert.deepEqual(flow.rexChoice("sections", context).sections, { reviews: true, delivery: true, whatsapp: true, countdown: false, instagram: false });
  assert.deepEqual(flow.rexChoice("media", context).media, ["a", "b"]);
  assert.equal(flow.rexChoice("contact", context), null, "contact is checked, never chosen blind");
  for (const screen of flow.REX_CHOOSE_SCREENS) assert.ok(flow.rexChoice(screen, context), screen);
  assert.equal(flow.REX_CHOSE_FLASH_MS, 1000);
  assert.equal(flow.recommendLayout(1), "big");
  assert.equal(flow.recommendLayout(3), "slider");
  assert.equal(flow.recommendLayout(9), "grid");
  assert.equal(flow.recommendStyle(["jewellery"]), "luxury");
  assert.equal(flow.recommendStyle([]), "warm");
  assert.equal(flow.palettesFor("soft").length, 3);
  const tokens = flow.styleTokens("luxury", "gold");
  assert.equal(tokens.accent, "#C8A24A");
  assert.equal(tokens.fontPair, "classic", "luxury takes the elegant fonts");
  assert.equal(tokens.buttonShape, "square");
  assert.notEqual(flow.brighterPalette("teal", "soft").id, "teal");
  assert.equal(flow.themeFor(["hair_beauty"]), "ewa");
  assert.equal(flow.themeFor([]), "plain");
});

test("D1b: Rex sorts products by name and flags prices that look off", () => {
  const products = [
    { id: "1", name: "Lace front wig", price: 85000 },
    { id: "2", name: "Hair growth oil", price: 6500 },
    { id: "3", name: "Scalp lotion", price: 5500 },
    { id: "4", name: "Braid extensions", price: 9000 },
    { id: "5", name: "Mystery box", price: null },
  ];
  const groups = flow.groupProducts(products, "More products");
  assert.deepEqual(groups.map((group) => group.name), ["Hair care", "Wigs", "Braids and extensions", "More products"]);
  assert.deepEqual(groups[0].productIds, ["2", "3"]);
  assert.deepEqual(flow.pricesToCheck(products), ["5"], "no price at all");
  assert.deepEqual(flow.pricesToCheck([{ id: "a", name: "x", price: 1000 }, { id: "b", name: "y", price: 1200 }, { id: "c", name: "z", price: 900000 }]), ["c"]);
});

test("D3 / D4 helpers: banner photos (theirs first), delivery days, the About story without Rex", () => {
  const options = flow.bannerCandidates(["p1", "p2", "p3"], ["l1", "l2", "l3", "l4"]);
  assert.deepEqual(options.map((item) => item.source), ["product", "product", "rex_library", "rex_library", "rex_library"]);
  assert.equal(flow.nextBanner(options, "l3").url, "p1", "wraps round");
  assert.equal(flow.nextWords([{ headline: "A" }, { headline: "B" }], "A").headline, "B");
  assert.deepEqual(flow.defaultAreas("Enugu").map((area) => `${area.state} ${area.days}`), ["Enugu 1", "Lagos 2", "Abuja 2-3"]);
  assert.equal(flow.nextDays("3-5"), "1");
  assert.equal(flow.plainAboutStory("Ada's Hair", "in 2021, from my room in Enugu", "every wig is checked by me"), "Ada's Hair started in 2021, from my room in Enugu. Every wig is checked by me.");
  assert.deepEqual(flow.libraryTabs(["hair_beauty"]).slice(0, 1), ["hair_beauty"]);
  assert.equal(flow.libraryTabs([]).at(-1), "mine");
  const photos = flow.libraryPhotos(["food"], ["https://shop/p.jpg"]);
  assert.ok(photos.every((photo) => photo.url && photo.thumb && photo.licence));
  assert.ok(photos.filter((photo) => photo.category !== "mine").every((photo) => photo.credit?.name), "every library photo carries its photographer");
  assert.equal(photos.at(-1).category, "mine");
});

test("the build applies every answer to the editor's draft (colours, banner, products section, sections, About)", () => {
  const section = (id, kind, extra = {}) => ({ id, kind, name: kind, visible: true, blocks: [], ...extra });
  const snapshot = {
    templateId: "ewa",
    templateName: "Ẹwà",
    themeTokens: { accent: "#000000" },
    updatedAt: "2026-10-30T00:00:00Z",
    pages: [
      { id: "home", pageType: "home", title: "Home", slug: "home", sections: [section("header", "header"), section("hero", "hero-split", { blocks: [{ id: "c", type: "copy", content: { title: "Old" } }] }), section("fp", "featured-products", { settings: { layout: "carousel" } }), section("t", "testimonials", { visible: false }), section("footer", "footer")] },
      { id: "about", pageType: "about", title: "About us", slug: "about", sections: [section("header", "header"), section("story", "story-split", { blocks: [{ id: "c2", type: "copy", content: { title: "Our story" } }] }), section("footer", "footer")] },
    ],
  };
  const catalog = { delivery: section("delivery-new", "trust-badges"), whatsapp: section("contact-new", "contact-form") };
  let n = 0;
  const built = flow.applyRexBuild(snapshot, {
    flow: {
      style: "soft",
      palette: "teal",
      banner: { url: "https://img/banner.jpg", source: "rex_library" },
      words: { headline: "Hair that turns heads.", cta: "Shop now" },
      layout: { layout: "grid", show: "new", showPrice: false },
      sections: { reviews: true, delivery: true, whatsapp: false, countdown: false, instagram: false },
      about: { story: "Ada's Hair started in 2021.", images: ["https://img/about.jpg"] },
      contact: { whatsapp: "0803", areas: [], pod: true },
    },
    storeName: "Ada's Hair",
    renderer: "boutique",
    catalog,
    newId: (kind) => `${kind}-${++n}`,
  });
  const home = built.snapshot.pages[0].sections;
  const about = built.snapshot.pages[1].sections;
  assert.equal(built.snapshot.themeTokens.accent, "#0C4A44");
  const hero = home.find((entry) => entry.id === "hero");
  assert.equal(hero.blocks.find((block) => block.type === "copy").content.title, "Hair that turns heads.");
  assert.equal(hero.items[0].imageUrl, "https://img/banner.jpg");
  const products = home.find((entry) => entry.id === "fp");
  assert.equal(products.settings.layout, "tiles");
  assert.equal(products.settings.source, "new");
  assert.equal(products.settings.showPrice, false);
  assert.equal(home.find((entry) => entry.id === "t").visible, true, "reviews switched on");
  assert.ok(home.some((entry) => entry.kind === "trust-badges"), "delivery info added from the catalogue");
  assert.ok(!home.some((entry) => entry.kind === "contact-form"), "a section switched off isn't added");
  assert.equal(about.find((entry) => entry.id === "story").blocks.find((block) => block.type === "copy").content.body, "Ada's Hair started in 2021.");
  assert.deepEqual(built.done, ["colours", "banner", "products", "about", "contact", "checkout"]);
  assert.equal(built.pages, 2);
  assert.equal(snapshot.themeTokens.accent, "#000000", "the input draft is untouched");
});

test("E1 progress never claims more than it knows", () => {
  assert.equal(flow.buildProgress(0, false).percent, 0);
  assert.equal(flow.buildProgress(10 * 60 * 1000, false).percent, 90);
  assert.deepEqual(flow.buildProgress(1000, true), { percent: 100, secondsLeft: 0, ticked: flow.BUILD_TICKS.length });
});

test("Home's Get your shop ready: the spec's order, done items drop off, products only under four", () => {
  const facts = { payoutBank: false, deliveryPartners: 0, deliversSelf: false, podOn: true, shared: false, posts: 0, products: 2, socialsConnected: 0, customDomain: false };
  const list = flow.shopReadyChecklist(facts);
  assert.deepEqual(list.rows.map((row) => row.key), ["bank", "delivery", "pod", "share", "post", "products", "channels", "domain"]);
  assert.deepEqual(list.open.map((row) => row.key), ["bank", "delivery", "share", "post", "products", "channels", "domain"]);
  assert.equal(list.total, 7, "the domain is optional");
  assert.equal(list.done, 1);
  assert.equal(flow.moreProductsWanted(2), 2);
  const all = flow.shopReadyChecklist({ ...facts, payoutBank: true, deliversSelf: true, shared: true, posts: 1, products: 4, socialsConnected: 1 });
  assert.equal(all.complete, true);
  assert.deepEqual(all.open.map((row) => row.key), ["domain"]);
});

test("analytics events are the spec's list, with short plain properties", () => {
  for (const event of ["onboarding_started", "otp_verified", "role_selected", "shop_basics_done", "build_path_chosen", "rex_step_completed", "banner_photo_choice", "build_started", "build_finished", "review_change_requested", "shop_went_live", "share_tapped", "checklist_item_done", "onboarding_abandoned"]) assert.ok(flow.isOnboardingEvent(event), event);
  assert.equal(flow.isOnboardingEvent("anything"), false);
  assert.deepEqual(flow.cleanEventProps({ step: "style", seconds: 12, usedRexChoose: true, categories: ["a", "b"], nested: { x: 1 }, "bad key": 1 }), { step: "style", seconds: 12, usedRexChoose: true, categories: "a,b" });
});

test("Peggy's nudge: after a quiet day, two at most, a day apart, never once live", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const base = { startedAt: "2026-10-28T09:00:00Z", lastActivityAt: "2026-10-29T10:00:00Z" };
  assert.equal(flow.dueOnboardingNudge(base, false, now), true);
  assert.equal(flow.dueOnboardingNudge({ ...base, lastActivityAt: "2026-10-30T01:00:00Z" }, false, now), false, "active today");
  assert.equal(flow.dueOnboardingNudge(base, true, now), false);
  assert.equal(flow.dueOnboardingNudge({ ...base, nudges: ["2026-10-30T02:00:00Z"] }, false, now), false, "a day apart");
  assert.equal(flow.dueOnboardingNudge({ ...base, nudges: ["2026-10-29T02:00:00Z"] }, false, now), true);
  assert.equal(flow.dueOnboardingNudge({ ...base, nudges: ["a", "b"] }, false, now), false, "two at most");
  assert.equal(flow.dueOnboardingNudge({}, false, now), false, "never started");
});

test("links into the app: the add-product intent, a referral and a pilot invite are kept", () => {
  assert.deepEqual(flow.entryFromQuery("?intent=add_product&productSlug=womens-leather-handbag&ref=ADA12"), { intent: "add_product", productSlug: "womens-leather-handbag", ref: "ADA12" });
  assert.deepEqual(flow.entryFromQuery("intent=dropship&productSlug=ankara-print-fabric&invite=PILOT-7"), { intent: "dropship", productSlug: "ankara-print-fabric", invite: "PILOT-7" });
  assert.deepEqual(flow.entryFromQuery("?intent=hack&productSlug=x"), {});
  const native = read("apps/mobile/src/app/+native-intent.tsx");
  assert.match(native, /captureEntry\(/);
  assert.match(read("apps/mobile/src/lib/auth.ts"), /ref: payload\.signup \? readEntry\(\)\.ref : undefined/);
  const controller = read("apps/mobile/src/app/onboarding/index.tsx");
  assert.match(controller, /redeemFeatureInvite\(entry\.invite\)/, "pilot invite redeemed silently");
  assert.match(read("apps/mobile/src/components/rex-build/products.tsx"), /t\("products\.trending"\)/, "Added from Trending");
});

test("every m_rexBuild word is in all five languages with the same placeholders", () => {
  const keys = Object.keys(rexBuild.en);
  const problems = [];
  for (const locale of ["pcm", "yo", "ha", "ig"]) {
    for (const key of keys) {
      const text = rexBuild[locale][key];
      if (!text) problems.push(`${locale} missing ${key}`);
      else if (JSON.stringify(i18n.placeholdersOf(text)) !== JSON.stringify(i18n.placeholdersOf(rexBuild.en[key]))) problems.push(`${locale} ${key} placeholders`);
    }
    for (const key of Object.keys(rexBuild[locale])) if (!(key in rexBuild.en)) problems.push(`${locale} extra ${key}`);
  }
  for (const key of ["q.roleDo", "q.roleSubLater", "error.wrongCode", "error.expiredCode", "error.locked"]) for (const locale of ["en", "pcm", "yo", "ha", "ig"]) if (!auth[locale][key]) problems.push(`m_auth ${locale} ${key}`);
  assert.deepEqual(problems, []);
  // Every key the screens use exists.
  const sources = ["app/onboarding/index.tsx", "app/onboarding/building.tsx", "app/onboarding/review.tsx", "app/onboarding/launched.tsx", "components/rex-build/Frame.tsx", "components/rex-build/parts.tsx", "components/rex-build/basics.tsx", "components/rex-build/products.tsx", "components/rex-build/design.tsx", "components/rex-build/pages.tsx", "components/rex-build/ShopReadyDone.tsx"].map((file) => read(`apps/mobile/src/${file}`)).join("\n");
  for (const match of sources.matchAll(/\bt\("([\w.-]+)"/g)) assert.ok(match[1] in rexBuild.en, match[1]);
  assert.equal(rexBuild.en["frame.rexChoose"], "Let Rex choose for me");
  assert.equal(rexBuild.en["intro.rex"], "Three questions. About two minutes. You can change anything later.");
});

test("server: owner-only routes, Rex jobs for the paid writing and the build, the editor's publish path", () => {
  for (const path of ["route.ts", "events/route.ts", "categories/route.ts", "contact/route.ts", "library/route.ts", "about/route.ts", "build/route.ts", "go-live/route.ts", "ready/route.ts"]) {
    assert.match(read(`src/app/api/mobile/onboarding/${path}`), /withSeller\(/, path);
  }
  assert.match(read("src/app/api/mobile/onboarding/build/route.ts"), /runRexJob\(\{ user, kind: "store_build"/);
  assert.match(read("src/app/api/mobile/onboarding/about/route.ts"), /runRexJob\(\{ user, kind: "store_words"/);
  const server = read("src/lib/onboarding/rex-build.server.ts");
  assert.match(server, /await publishStoreDraft\(\{ userId \}\)/, "go live publishes like the editor");
  assert.match(server, /updateDraftFromSnapshot\(/, "the build writes the editor's draft");
  assert.match(server, /setPaymentMethods\(store\.id, \{ cod: contact\.pod \}\)/);
  assert.match(server, /replaceSetupDeliveryAreas\(/);
  assert.match(read("src/app/api/cron/lifecycle/route.ts"), /sendOnboardingNudges\(\)/);
  assert.match(read("src/app/api/mobile/onboarding/route.ts"), /\.strict\(\)/, "only known answers are saved");
});

test("phone: the review uses the editor's canvas and state; C1 and E3 open the editor; Home and Settings", () => {
  const review = read("apps/mobile/src/app/onboarding/review.tsx");
  assert.match(review, /from "@\/components\/store-editor\/Canvas"/);
  assert.match(review, /useStoreEditor\(load\)/);
  assert.match(review, /askRexToEdit\(/);
  assert.match(review, /fetchBlockers\(\)/);
  assert.match(read("apps/mobile/src/components/rex-build/basics.tsx"), /router\.push\("\/store-editor"\)/);
  const launched = read("apps/mobile/src/app/onboarding/launched.tsx");
  assert.match(launched, /target: "whatsapp_status"/);
  assert.match(launched, /pathname: "\/store-editor", params: \{ sheet: "rex" \}/);
  assert.match(launched, /pathname: "\/home", params: \{ tour: "1" \}/);
  const frame = read("apps/mobile/src/components/rex-build/Frame.tsx");
  assert.match(frame, /t\("frame\.rexChoose"\)/);
  assert.match(frame, /t\("frame\.rexChose", \{ choice: flash \}\)/);
  const home = read("apps/mobile/src/app/(tabs)/home.tsx");
  assert.match(home, /fetchShopReady\(\)/);
  assert.match(home, /<ShopReadyDone /);
  assert.match(read("apps/mobile/src/app/settings.tsx"), /params: \{ redesign: "1" \}/);
  assert.match(read("apps/mobile/src/app/index.tsx"), /setTarget\("\/onboarding"\)/);
});
