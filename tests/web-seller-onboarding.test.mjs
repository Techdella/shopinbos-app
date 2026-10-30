// Seller onboarding on the WEB, "Rex builds your shop (step by step)" (src/components/onboarding/seller/**, the page
// src/app/onboarding/rex/page.tsx): the phone's flow (tests/seller-onboarding-flow.test.mjs) with the same step
// machine (shared/seller-onboarding.ts), the same routes and server functions, and the same saved memory, so a seller
// can start on one device and finish on the other.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const flow = await import("../shared/seller-onboarding.ts");
const i18n = await import("../shared/i18n/index.ts");
const web = (await import("../shared/i18n/messages/rexBuild/index.ts")).default;
const phone = (await import("../shared/i18n/messages/m_rexBuild/index.ts")).default;
const tour = (await import("../shared/i18n/messages/tour/index.ts")).default;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DIR = "src/components/onboarding/seller";
const FILES = ["SellerRexBuild.tsx", "Frame.tsx", "parts.tsx", "basics.tsx", "products.tsx", "design.tsx", "pages.tsx", "finish.tsx", "preview.tsx", "ShopReadyCard.tsx", "context.ts", "api.ts"];
const source = (file) => read(`${DIR}/${file}`);
const all = FILES.map(source).join("\n");

test("routing: sign-up → /onboarding → /onboarding/rex renders the guided build; Home sends a new seller there", () => {
  const page = read("src/app/onboarding/rex/page.tsx");
  assert.match(page, /<SellerRexBuild /);
  assert.match(page, /requireRole\(\["seller"\], "\/login"\)/);
  assert.match(page, /loadRexBuild\(user\.id\)/, "the same loader as GET /api/mobile/onboarding");
  assert.match(page, /onboardingState: "NEW"/, "a seller without a shop gets one first");
  assert.match(page, /entryFromQuery\(/, "the link's intent, referral and invite are read with the shared rules");
  assert.match(page, /redesign=\{flat\.redesign === "1"\}/);
  // /onboarding (after sign-up) keeps the query and hands sellers to Rex's flow; Home sends NEW sellers back to it.
  assert.match(read("src/app/onboarding/page.tsx"), /redirect\(query \? `\/onboarding\/rex\?\$\{query\}` : "\/onboarding\/rex"\)/);
  assert.match(read("src/app/home/page.tsx"), /state === "NEW" \|\| state === "BUILDING_REX"\) redirect\("\/onboarding\/rex"\)/);
  // The older one-question-per-screen web onboarding is gone; nothing points at it.
  assert.equal(existsSync(new URL(`../${DIR}/SellerOnboarding.tsx`, import.meta.url)), false);
  assert.equal(existsSync(new URL(`../${DIR}/StorePreview.tsx`, import.meta.url)), false);
});

test("the web reuses the shared step machine, rules and Rex's picks (no copy of its own)", () => {
  const host = source("SellerRexBuild.tsx");
  for (const name of ["nextScreen(screen, mode)", "previousScreen(screen, mode)", "resumeScreen(saved, isLive)", "welcomeBack(saved, wanted)", "stepOf(screen)", "REX_CHOSE_FLASH_MS"]) assert.ok(host.includes(name), name);
  assert.doesNotMatch(all, /const FLOW_SCREENS|SELLER_QUESTIONS|nextSellerQuestion/, "no second list of screens");
  for (const name of ["linkSlug(", "linkProblem(", "linkSuggestions(", "shopNameProblem(", "cleanFirstName(", "themeFor("]) assert.ok(source("basics.tsx").includes(name), name);
  for (const name of ["recommendStyle(", "palettesFor(", "bannerCandidates(", "recommendLayout(", "defaultSections(", "styleTokens("]) assert.ok(source("design.tsx").includes(name), name);
  for (const name of ["libraryTabs(", "plainAboutStory(", "defaultAreas(", "nextDays(", "validWhatsapp("]) assert.ok(source("pages.tsx").includes(name), name);
  for (const name of ["buildProgress(", "BUILD_TICKS", "brighterPalette(", "nextBanner(", "nextWords("]) assert.ok(source("finish.tsx").includes(name), name);
  // Every guided-build screen has a web screen.
  for (const screen of flow.FLOW_SCREENS) assert.match(host, new RegExp(`(case |screen === )"${screen}"`), screen);
  // "Let Rex choose for me" wherever the phone has it.
  for (const step of ["StyleStep", "ColoursStep", "WordsStep", "LayoutStep", "SectionsStep", "MediaStep", "AboutStep"]) {
    const file = ["MediaStep", "AboutStep"].includes(step) ? "pages.tsx" : "design.tsx";
    const body = source(file).slice(source(file).indexOf(`export function ${step}`));
    assert.match(body.slice(0, body.indexOf("\nexport function ") > 0 ? body.indexOf("\nexport function ") : undefined), /onRexChoose=|rexChose\(/, step);
  }
});

test("the web calls the phone's own routes and server functions (cookie auth reaches them)", () => {
  const api = source("api.ts");
  for (const route of ["/api/mobile/onboarding", "/api/mobile/onboarding/categories", "/api/mobile/onboarding/contact", "/api/mobile/onboarding/colours", "/api/mobile/onboarding/about", "/api/mobile/onboarding/build", "/api/mobile/onboarding/go-live", "/api/mobile/onboarding/ready", "/api/mobile/store-editor", "/api/mobile/store-editor/rex", "/api/mobile/banner"]) {
    assert.ok(api.includes(`"${route}`) || api.includes(`\`${route}`), route);
  }
  // Rex's paid writing and the build are Rex jobs: resumable, never charged twice.
  assert.match(api, /rexPost<\{ story: string \}>\("\/api\/mobile\/onboarding\/about"/);
  assert.match(api, /rexPost<\{ version: string; pages: number; done: string\[\] \}>\("\/api\/mobile\/onboarding\/build"/);
  assert.match(source("finish.tsx"), /useRexResume\(\["store_build"\]/);
  // withSeller falls back to the Supabase session cookie when there's no Bearer token.
  const middleware = read("src/lib/auth/middleware.ts");
  assert.match(middleware, /Fall back to session cookies/);
  assert.match(read("src/app/api/mobile/onboarding/route.ts"), /withSeller\(/);
  // Products: Rex writes them with the web's product-drafts AI; photos from the computer or the phone's camera.
  assert.match(api, /"\/api\/ai\/product-drafts"/);
  const products = source("products.tsx");
  assert.match(products, /capture="environment"/);
  assert.match(products, /multiple/);
  assert.match(products, /onDrop=\{onDrop\}/);
  assert.match(products, /href="\/marketplace"/, "Find stock");
  // The free link uses the existing address check.
  assert.match(api, /\/api\/app\/onboarding\/address\?slug=/);
  // C1 "I'll design it myself": the starter template, then the web builder; back here "Check and go live".
  assert.match(source("basics.tsx"), /await applyTheme\(themeId\);[\s\S]*router\.push\("\/builder"\)/);
  assert.match(source("basics.tsx"), /ctx\.go\("review"\)/);
});

test("resume across devices: the same memory key, written by the same server function", () => {
  // Both devices PATCH /api/mobile/onboarding → saveRexBuild → brandSettings.onboardingMemory.rexBuild.
  assert.match(source("api.ts"), /call<\{ flow: RexBuildMemory \}>\("\/api\/mobile\/onboarding", json\("PATCH"/);
  assert.match(read("apps/mobile/src/lib/seller-onboarding.ts"), /api<\{ flow: RexBuildMemory \}>\("\/api\/mobile\/onboarding", \{ method: "PATCH"/);
  const server = read("src/lib/onboarding/rex-build.server.ts");
  assert.match(server, /onboardingMemory: \{ \.\.\.memory, version: 1, rexBuild: flow \}/);
  assert.match(read("src/lib/onboarding-memory.ts"), /rexBuild\?: import\("@shared\/seller-onboarding"\)\.RexBuildMemory/);
  // What the phone saved is where the web picks up (and the other way round).
  const saved = flow.readRexBuild({ onboardingMemory: { version: 1, screen: "look", rexBuild: { screen: "banner", firstName: "Ada", lastActivityAt: "2026-10-01T10:00:00Z" } } });
  assert.equal(flow.resumeScreen(saved, false), "banner");
  assert.deepEqual(flow.welcomeBack(saved, "banner"), { name: "Ada", step: 3 });
  // The older web questions' screen ("look") doesn't decide anything: a seller from that flow starts Rex's flow.
  assert.equal(flow.resumeScreen(flow.readRexBuild({ onboardingMemory: { screen: "look" } }), false), "intro");
  // Built on one device, reviewed on the other; live means done.
  assert.equal(flow.resumeScreen({ screen: "building", builtAt: "2026-10-01T10:00:00Z" }, false), "review");
  assert.equal(flow.resumeScreen({ screen: "review", liveAt: "2026-10-01T10:00:00Z" }, true), null);
  // Every answer is saved as it's given, with the screen to come back to.
  assert.match(source("SellerRexBuild.tsx"), /save\(\{ \.\.\.patch, \.\.\.record, screen: target \?\? screen \}/);
  // Save & exit lets Home open (not bounced back) and Home offers "Finish your shop".
  assert.match(source("api.ts"), /onboardingState: "INCOMPLETE"/);
  assert.match(read("src/app/home/page.tsx"), /<FinishShopCard step=/);
});

test("intents, referral and pilot invites ride through web sign-up into the flow", () => {
  const routing = read("src/lib/intent-routing.js");
  for (const key of ['"intent"', '"productSlug"', '"source"', '"ref"', '"invite"']) assert.ok(routing.includes(key), key);
  assert.match(read("src/components/auth/app/AppAuth.tsx"), /ref: mode === "signup" \? params\.get\("ref"\) \?\? undefined : undefined/);
  assert.deepEqual(flow.entryFromQuery("?intent=add_product&productSlug=womens-leather-handbag&ref=ADA22&invite=PILOT1"), { intent: "add_product", productSlug: "womens-leather-handbag", ref: "ADA22", invite: "PILOT1" });
  const host = source("SellerRexBuild.tsx");
  assert.match(host, /patch\.intent = \{ kind: entry\.intent, productSlug: entry\.productSlug, addedProductId: null \}/);
  assert.match(host, /patch\.referralCode = entry\.ref/);
  assert.match(host, /void redeemInvite\(entry\.invite\)/, "pilot invite redeemed silently");
  assert.match(source("products.tsx"), /t\("products\.trending"\)/, "Added from Trending");
  assert.match(source("products.tsx"), /addSupplierPick\(product\.id, suggestedRetailPrice\(/);
});

test("review, go live and Home: the real shop, quick changes, Rex per section, publish, the checklist and three tips", () => {
  const finish = source("finish.tsx");
  assert.match(source("preview.tsx"), /<TemplateStorefrontSurface/, "the storefront's own renderer");
  assert.match(finish, /onSelectSection=\{\(id\) =>/, "click a section → ask Rex");
  assert.match(finish, /askRexToEdit\(\{ message: text\.trim\(\), section: label\(asking\), page: "Home", baseVersion: version\.current \}\)/);
  assert.match(finish, /saveDraft\(next, version\.current\)/, "quick changes are saved to the draft with the version check");
  assert.match(finish, /const result = await goLive\(\)/);
  assert.match(finish, /<Confetti \/>/);
  assert.match(finish, /https:\/\/wa\.me\/\?text=/);
  assert.match(finish, /leave\("\/home\?tour=quick"\)/);
  assert.match(source("design.tsx"), /<LivePreview/, "colours and banner show on the real shop");
  // Home: "Get your shop ready" from the same server function as GET /api/mobile/onboarding/ready.
  const home = read("src/app/home/page.tsx");
  assert.match(home, /shopReadyFor\(user\.id\)/);
  assert.match(home, /<ShopReadyCard /);
  assert.match(read("src/app/api/mobile/onboarding/ready/route.ts"), /shopReadyFor\(user\.id\)/);
  // The web's guided tour has a three-tip mode for right after the build (spec F1–F3).
  const guided = read("src/components/shell/GuidedTour.tsx");
  assert.match(guided, /get\("tour"\) === "quick"/);
  for (const id of ["quickAdd", "quickMoney", "quickAsk"]) assert.match(guided, new RegExp(`id: "${id}"`), id);
});

test("every rexBuild (web) word is in all five languages, with the phone's words and placeholders", () => {
  const problems = [];
  for (const locale of ["pcm", "yo", "ha", "ig"]) {
    for (const key of Object.keys(web.en)) {
      const text = web[locale][key];
      if (!text) problems.push(`${locale} missing ${key}`);
      else if (JSON.stringify(i18n.placeholdersOf(text)) !== JSON.stringify(i18n.placeholdersOf(web.en[key]))) problems.push(`${locale} ${key} placeholders`);
    }
    for (const key of Object.keys(web[locale])) if (!(key in web.en)) problems.push(`${locale} extra ${key}`);
  }
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const key of ["seller.quickAdd.title", "seller.quickAdd.body", "seller.quickMoney.title", "seller.quickMoney.body", "seller.quickAsk.title", "seller.quickAsk.body"]) if (!tour[locale][key]) problems.push(`tour ${locale} ${key}`);
  }
  assert.deepEqual(problems, []);
  // The same words as the phone (web namespaces can't use m_*), apart from the phone-only photo cleaning.
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const [key, text] of Object.entries(phone[locale])) if (!key.startsWith("clean.")) assert.equal(web[locale][key], text, `${locale} ${key}`);
  }
  // Every key the screens use exists, and the screens use only the web namespace.
  for (const match of all.matchAll(/\bt\("([\w.-]+)"/g)) assert.ok(match[1] in web.en, match[1]);
  assert.doesNotMatch(all, /useT\("m_/);
  assert.match(read("shared/i18n/catalog.ts"), /import rexBuild from "\.\/messages\/rexBuild\/index\.ts";/);
  assert.match(read("src/lib/i18n/route-namespaces.generated.ts"), /\["\/onboarding\/rex", \[[^\]]*"rexBuild"/);
});
