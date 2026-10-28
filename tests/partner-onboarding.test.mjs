// A new delivery partner's short way in: the 2-question set-up on the phone (apps/mobile/src/app/logistics/setup.tsx)
// and the web (src/components/onboarding/LogisticsOnboarding.tsx), the starter rate card at typical prices
// (shared/delivery-market.ts), the set-up route saving step by step, and "Finish setting up" on Jobs in tier order
// (apps/mobile/src/lib/partner-setup-pure.ts, components/kyc/FinishLaterCard.tsx).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const market = await import("../shared/delivery-market.ts");
const setup = await import("../apps/mobile/src/lib/partner-setup-pure.ts");
const tiers = await import("../shared/partner-tiers.ts");

const LANGS = ["en", "pcm", "yo", "ha", "ig"];
const catalog = (ns, lang) => read(`shared/i18n/messages/${ns}/${lang}.ts`);
const hasKey = (ns, key) => LANGS.every((lang) => catalog(ns, lang).includes(`"${key}":`));

test("starter rate card: typical prices from the set-up answers, and it passes the rate card rules", () => {
  const home = market.suggestedRateRows({ home: "Lagos", reach: "home" });
  assert.deepEqual(home.map((row) => [row.from, row.to, row.service, row.price]), [["Lagos", "Lagos", "doorstep", market.SUGGESTED_PRICES.doorstep]]);
  const some = market.suggestedRateRows({ home: "Lagos", reach: "states", states: ["Ogun", "Oyo", "Lagos"], services: ["doorstep", "interstate"] });
  assert.deepEqual(some.map((row) => row.to), ["Lagos", "Ogun", "Oyo"]);
  assert.ok(some.slice(1).every((row) => row.price === market.SUGGESTED_PRICES.otherStates && row.minDays === 2 && row.maxDays === 4));
  const all = market.suggestedRateRows({ home: "abuja", reach: "nationwide", services: ["same_day", "pickup_point"] });
  assert.deepEqual(all.map((row) => [row.from, row.to, row.service]), [["FCT", "FCT", "same_day"], ["FCT", "FCT", "pickup_point"], ["FCT", "Nationwide", "doorstep"]]);
  assert.equal(all[0].maxDays, 0, "same-day rows deliver in 0 days");
  for (const rows of [home, some, all]) assert.equal(market.validateRateCard({ rows }).ok, true);
  // Always something a shop can book: same-day alone still gets a doorstep row.
  assert.ok(market.suggestedRateRows({ home: "Kano", reach: "home", services: ["same_day"] }).some((row) => row.service === "doorstep"));
});

test("where they deliver: the set-up answer and the saved areas read the same both ways", () => {
  assert.deepEqual(market.reachAreas("Lagos", "home"), ["Lagos"]);
  assert.deepEqual(market.reachAreas("Lagos", "states", ["Ogun"]), ["Lagos", "Ogun"]);
  assert.deepEqual(market.reachAreas("Lagos", "nationwide"), ["Nationwide"]);
  assert.deepEqual(market.reachOf("Lagos", ["Lagos"]), { reach: "home", states: [] });
  assert.deepEqual(market.reachOf("Lagos", ["Lagos", "Ogun"]), { reach: "states", states: ["Ogun"] });
  assert.deepEqual(market.reachOf("Lagos", ["Nationwide"]), { reach: "nationwide", states: [] });
});

test("set-up opens where the partner stopped; sign-up's defaults (Lagos, a bike) are never taken as answers", () => {
  const signup = { onboardingState: { source: "signup" }, city: "Lagos", coverageZones: [], vehicleTypes: ["bike"] };
  assert.equal(setup.savedHomeState(signup), null);
  assert.deepEqual(setup.savedVehicles(signup), []);
  assert.equal(setup.setupStepOf({ onboarded: false, home: setup.savedHomeState(signup) }), "biz");
  const step1 = { onboardingState: { source: "logistics-onboarding", completed: false }, city: "Kano", coverageZones: ["Kano"], vehicleTypes: ["bike", "keke"] };
  assert.equal(setup.savedHomeState(step1), "Kano");
  assert.deepEqual(setup.savedVehicles(step1), ["bike"]);
  assert.equal(setup.setupStepOf({ onboarded: false, home: "Kano" }), "deliver");
  assert.equal(setup.setupStepOf({ onboarded: true, home: null }), "ready");
  assert.deepEqual(setup.savedReach("Kano", ["Kano", "Kaduna"]), { reach: "states", states: ["Kaduna"] });
  assert.deepEqual(setup.savedReach(null, ["Nationwide"]), { reach: "home", states: [] });
  assert.deepEqual(setup.setupServices("home"), ["doorstep"]);
  assert.deepEqual(setup.setupServices("nationwide"), ["doorstep", "interstate"]);
  for (const vehicle of setup.SETUP_VEHICLES) assert.ok(tiers.DELIVERY_METHODS.includes(vehicle), vehicle);
});

const tier1 = (overrides = {}) => ({ ...Object.fromEntries(tiers.TIER1_ITEMS.map((key) => [key, "missing"])), coverage: "approved", methods: "approved", phone: "approved", ...overrides });
const tier2 = () => Object.fromEntries(tiers.TIER2_ITEMS.map((key) => [key, "missing"]));

test("finish later: what taking jobs needs first, then send (locked until ready), then CAC; gone once sent", () => {
  const fresh = setup.finishLater({ state: "unverified", tier1: tier1(), tier2: tier2() });
  assert.deepEqual(fresh.start.map((item) => item.step), ["identity", "bank", "vehicles", "guarantor"], "coverage was set in set-up");
  assert.equal(fresh.send.status, "locked");
  assert.equal(fresh.cac.status, "locked");
  assert.deepEqual([fresh.done, fresh.total], [0, 5]);
  // Coverage shows up again only when it's missing (an older account).
  assert.deepEqual(setup.finishLater({ state: "unverified", tier1: tier1({ coverage: "missing" }), tier2: tier2() }).start.map((item) => item.step), ["identity", "bank", "vehicles", "coverage", "guarantor"]);
  // Everything in (some still being checked): sending opens.
  const ready = setup.finishLater({ state: "unverified", tier1: Object.fromEntries(tiers.TIER1_ITEMS.map((key) => [key, key === "terms" ? "missing" : key === "guarantor" ? "pending" : "approved"])), tier2: tier2() });
  assert.equal(ready.send.status, "todo");
  assert.equal(ready.done, 4);
  assert.equal(ready.start.find((item) => item.step === "guarantor").status, "pending");
  // Turned down: still on the list, with the step to fix.
  assert.equal(setup.finishLater({ state: "rejected", tier1: tier1({ nin: "rejected" }), tier2: tier2() }).start[0].status, "rejected");
  for (const state of ["pending_review", "tier1_verified", "tier2_verified", "suspended"]) assert.equal(setup.finishLater({ state, tier1: tier1(), tier2: tier2() }), null, state);
});

test("phone set-up: two questions, saved per step, Help and a way out on each, nothing that can wait", () => {
  const screen = app("app/logistics/setup.tsx");
  assert.match(screen, /<HelpButton compact \/>/);
  assert.match(screen, /<ProgressBars total=\{SETUP_QUESTIONS\}/);
  assert.match(screen, /t\("su\.step", \{ step: index \+ 1, total: SETUP_QUESTIONS \}\)/);
  assert.equal((screen.match(/\{laterLink\}/g) ?? []).length, 2, "Finish later on both questions");
  assert.match(screen, /saveSetup\(\{ displayName: business, city: home, country: "Nigeria", coverageZones: \[home\], completed: false \}\)/);
  assert.match(screen, /starterRates: true,\s*completed: true,/);
  assert.match(screen, /<StatePicker single/);
  // Asked once: name and phone come from sign-up; rates, bank, CAC and documents are on "Finish setting up".
  assert.doesNotMatch(screen, /RateCardEditor|linkWalletBank|setup\.cac|setup\.contact|setup\.phone|setup\.email|uploadVerificationDoc/);
  for (const key of ["su.step", "su.later", "su.bizTitle", "su.name", "su.home", "su.deliverTitle", "su.vehicles", "su.reach", "su.finish", "su.readyTitle", "su.pricesHome", "su.pricesFar", "su.toJobs"]) assert.ok(hasKey("m_partner", key), key);
});

test("Jobs: 'Finish setting up' replaces the old checklist and the 'being checked' card until the steps are sent", () => {
  const jobs = app("app/logistics/(tabs)/jobs.tsx");
  assert.match(jobs, /<FinishLaterCard kyc=\{kyc\.data\}/);
  assert.match(jobs, /!hideChecklist && !later/);
  assert.match(jobs, /kyc\.data \? kyc\.data\.state !== "unverified"/, "a finished set-up alone never shows 'Being checked'");
  const card = app("components/kyc/FinishLaterCard.tsx");
  assert.match(card, /pathname: "\/logistics\/verification", params: \{ step \}/);
  for (const key of ["fl.title", "fl.count", "fl.startHead", "fl.identity", "fl.identityWhy", "fl.bank", "fl.bankWhy", "fl.vehicles", "fl.vehiclesWhy", "fl.coverage", "fl.coverageWhy", "fl.guarantor", "fl.guarantorWhy", "fl.review", "fl.reviewWhy", "fl.reviewLocked", "fl.laterHead", "fl.prices", "fl.riders", "fl.cac", "fl.cacWhy"]) assert.ok(hasKey("m_partner", key), key);
});

test("set-up route: each step saves on its own; finishing adds coverage, starter prices and the sign-up contacts", () => {
  const route = read("src/app/api/logistics/onboarding/route.ts");
  assert.match(route, /const zones = data\.coverageZones \?\? partner\.coverageZones;/);
  assert.match(route, /if \(data\.completed\) \{[\s\S]*savePartnerCoverage\([\s\S]*suggestedRateRows\([\s\S]*approveSignupContacts\(partner\.id, user\.supabaseId\)/);
  assert.match(route, /if \(!hasCard\)/, "never replaces a rate card the partner made");
  const schemas = read("src/lib/schemas/index.ts");
  assert.match(schemas, /\.refine\(\(value\) => !value\.completed \|\| Boolean\(value\.coverageZones\?\.length && value\.vehicleTypes\?\.length && value\.deliveryTypes\?\.length\)/);
  // The phone and email confirmed with a code at sign-up count; nothing else is approved by set-up.
  const kyc = read("src/lib/logistics/partner-kyc.server.ts");
  assert.match(kyc, /u\."phone_confirmed_at"/);
  assert.match(kyc, /phone && !checks\.phone/);
  assert.match(read("src/app/api/logistics/kyc/phone/route.ts"), /\(await confirmedAuthPhone\(user\.supabaseId\)\) === phone/);
});

test("web set-up asks the phone's two questions, in the same order", () => {
  const web = read("src/components/onboarding/LogisticsOnboarding.tsx");
  assert.ok(web.indexOf('t("lps.name")') < web.indexOf('t("lps.home")') && web.indexOf('t("lps.home")') < web.indexOf('t("lps.vehicles")') && web.indexOf('t("lps.vehicles")') < web.indexOf('t("lps.reach")'));
  assert.match(web, /const STEPS = 2;/);
  for (const key of ["lps.bizTitle", "lps.name", "lps.home", "lps.deliverTitle", "lps.vehicles", "lps.reach", "lps.finish", "lps.prices"]) assert.ok(hasKey("onboarding", key), key);
});
