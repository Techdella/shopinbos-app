// Delivery partner verification on the phone (apps/mobile/src/app/logistics/verification.tsx): the tiered steps
// (shared/partner-tiers.ts) in place of the old CAC + insurance documents, the selfie sent with the NIN for the
// Korapay face match, the tier card on Jobs, and the words in every language.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const kyc = await import("../apps/mobile/src/lib/kyc-pure.ts");
const tiers = await import("../shared/partner-tiers.ts");

const all = (state) => Object.fromEntries(Object.keys(tiers.ITEM_STEP).filter((key) => tiers.TIER1_ITEMS.includes(key)).map((key) => [key, state]));
const tier2 = (state) => Object.fromEntries(tiers.TIER2_ITEMS.map((key) => [key, state]));

test("step states: rejected beats missing beats pending; CAC is optional until something is in", () => {
  const state = { tier1: { ...all("approved"), nin: "pending", selfie: "rejected" }, tier2: tier2("missing") };
  assert.equal(kyc.stepState(state, "identity"), "rejected");
  assert.equal(kyc.stepState({ ...state, tier1: { ...state.tier1, selfie: "missing" } }, "identity"), "todo");
  assert.equal(kyc.stepState({ ...state, tier1: { ...state.tier1, selfie: "approved" } }, "identity"), "pending");
  assert.equal(kyc.stepState(state, "bank"), "done");
  assert.equal(kyc.stepState(state, "cac"), "optional");
  assert.equal(kyc.stepState({ ...state, tier2: { ...tier2("missing"), businessName: "approved" } }, "cac"), "todo");
});

test("the flow opens on the first Tier 1 step that needs something, never on CAC", () => {
  assert.equal(kyc.firstOpenStep({ tier1: all("missing"), tier2: tier2("missing") }), "identity");
  assert.equal(kyc.firstOpenStep({ tier1: { ...all("approved"), guarantor: "missing" }, tier2: tier2("missing") }), "guarantor");
  assert.equal(kyc.firstOpenStep({ tier1: { ...all("approved"), vehicles: "rejected" }, tier2: tier2("missing") }), "vehicles");
  assert.equal(kyc.firstOpenStep({ tier1: all("pending"), tier2: tier2("missing") }), "review");
});

test("the tier a partner reaches: none until Tier 1 is in, Tier 2 only with all of CAC", () => {
  assert.equal(kyc.tierOnSubmit({ tier1: { ...all("approved"), guarantor: "missing" }, tier2: tier2("approved") }), null);
  assert.equal(kyc.tierOnSubmit({ tier1: all("pending"), tier2: tier2("missing") }), "tier1");
  assert.equal(kyc.tierOnSubmit({ tier1: all("approved"), tier2: { ...tier2("pending"), cacCertificate: "approved" } }), "tier2");
  assert.equal(kyc.tierOnSubmit({ tier1: { ...all("pending"), terms: "missing" }, tier2: tier2("missing") }), "tier1", "terms go with the send");
  assert.deepEqual(kyc.itemsWhereOpen({ phone: "approved", nin: "missing", vehicles: "rejected" }).map((item) => item.key), ["nin", "vehicles"]);
});

test("selfie and date of birth checks", () => {
  assert.equal(kyc.selfieDataUri("abc", "image/jpeg"), "data:image/jpeg;base64,abc");
  assert.equal(kyc.selfieDataUri("abc", null), "data:image/jpeg;base64,abc");
  assert.equal(kyc.selfieDataUri("x".repeat(kyc.SELFIE_MAX_BASE64 + 1)), null, "too big to send");
  assert.equal(kyc.selfieDataUri(null), null);
  const now = new Date("2026-12-01T00:00:00Z");
  assert.equal(kyc.birthDate("14/02/1990", now), "1990-02-14");
  assert.equal(kyc.birthDate("1990-2-14", now), "1990-02-14");
  assert.equal(kyc.birthDate("31/02/1990", now), null, "not a real date");
  assert.equal(kyc.birthDate("14/02/2020", now), null, "too young");
  assert.equal(kyc.birthDate("Feb 14", now), null);
  assert.equal(kyc.digitsUpTo("123 456 789 012", 11), "12345678901");
});

test("the phone uses the tiered API, sends the selfie with the NIN, and no longer asks for CAC + insurance", () => {
  const client = app("lib/kyc.ts");
  assert.match(client, /const BASE = "\/api\/logistics\/kyc"/);
  assert.match(client, /checkNin = \(input: \{ nin: string; firstName: string; lastName: string; dateOfBirth: string; selfie: string; liveness\?/);
  for (const path of ["/identity", "/nin", "/phone", "/email", "/payout", "/coverage", "/vehicles", "/guarantor", "/business", "/terms", "/submit"]) assert.ok(client.includes(`\${BASE}${path}`), path);
  const identity = app("components/kyc/IdentityStep.tsx");
  assert.match(identity, /cameraType: ImagePicker\.CameraType\.front/);
  assert.match(identity, /base64: true/);
  assert.match(identity, /checkNin\(\{ nin, firstName: first\.trim\(\), lastName: last\.trim\(\), dateOfBirth: born, selfie: selfie\.dataUri, \.\.\.\(passed \? \{ liveness: passed \} : \{\}\) \}\)/);
  const screen = app("app/logistics/verification.tsx");
  assert.doesNotMatch(screen, /VerificationScreen|LOGISTICS_DOC_TYPES/);
  for (const step of ["IdentityStep", "BankStep", "VehiclesStep", "CoverageStep", "GuarantorStep", "CacStep", "ReviewStep"]) assert.match(screen, new RegExp(`<${step} \\{\\.\\.\\.props\\} />`), step);
  assert.match(screen, /t\("noCac\.title"\)/);
  assert.match(screen, /openOnWeb\("\/logistics\/cac-help"\)/);
  const business = app("components/kyc/BusinessSteps.tsx");
  assert.match(business, /openOnWeb\("\/logistics\/terms"\)/);
  assert.match(business, /if \(!state\.termsCurrent\) await acceptTerms\(\);/);
  assert.match(business, /itemsWhereOpen\(state\.tier1\)\.filter\(\(item\) => item\.key !== "terms"\)/, "unticked terms never lock the send button");
  // Truck is a delivery method and a vehicle type on the phone too.
  assert.ok(tiers.DELIVERY_METHODS.includes("truck"));
  assert.match(app("components/kyc/FleetSteps.tsx"), /DELIVERY_METHODS\.map/);
  // Nothing on the delivery side still reads the old required documents.
  for (const file of ["app/logistics/setup.tsx", "lib/logistics-pure.ts", "app/logistics/verification.tsx"]) assert.doesNotMatch(app(file), /LOGISTICS_DOC_TYPES/, file);
});

test("Jobs shows the tier card for verified partners: limits, graduation progress and the upgrade", () => {
  const card = app("components/kyc/TierCard.tsx");
  assert.match(card, /t\("tier\.deliveries", \{ have: progress\.deliveries\.have, need: progress\.deliveries\.need \}\)/);
  assert.match(card, /params: \{ step: "cac" \}/);
  assert.match(app("app/logistics/(tabs)/jobs.tsx"), /verificationStatus === "verified" \? <TierCard \/> : null/);
});

test("every phone verification word is in every language, with the same placeholders", async () => {
  const catalog = (await import("../shared/i18n/messages/m_kyc/index.ts")).default;
  const keys = Object.keys(catalog.en);
  for (const locale of ["pcm", "yo", "ha", "ig"]) {
    for (const key of keys) {
      assert.ok(catalog[locale][key], `${locale}: ${key}`);
      const want = (catalog.en[key].match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal((catalog[locale][key].match(/\{\w+\}/g) ?? []).sort().join(), want, `${locale}: ${key} placeholders`);
    }
  }
  // Every key the screens use exists in English.
  const used = ["components/kyc/KycKit.tsx", "components/kyc/IdentityStep.tsx", "components/kyc/FleetSteps.tsx", "components/kyc/BusinessSteps.tsx", "components/kyc/TierCard.tsx", "app/logistics/verification.tsx"]
    .flatMap((file) => [...app(file).matchAll(/\bt\("([a-zA-Z0-9_.-]+)"/g)].map((match) => match[1]));
  for (const key of used) assert.ok(key in catalog.en, key);
  assert.match(read("shared/i18n/catalog.ts"), /import m_kyc from "\.\/messages\/m_kyc\/index\.ts";/);
});

test("Korapay liveness on the phone: the SDK runs before the selfie and its reference goes with the NIN check", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  assert.equal(pkg.dependencies["kora-identity-react-native-sdk"], "0.4.0", "pinned: pre-1.0 SDK");
  assert.ok(pkg.dependencies["react-native-webview"], "the SDK renders in a WebView");
  const native = read("apps/mobile/src/components/kyc/KoraLiveness.native.tsx");
  assert.match(native, /EXPO_PUBLIC_KORAPAY_PUBLIC_KEY/);
  assert.match(native, /\/\^pk_\(test\|live\)_\//, "only a real public key switches it on");
  assert.match(native, /allowAudio: false/);
  assert.match(read("apps/mobile/src/components/kyc/KoraLiveness.tsx"), /LIVENESS_ON = false/, "web fallback: no SDK");
  const step = read("apps/mobile/src/components/kyc/IdentityStep.tsx");
  assert.match(step, /LIVENESS_ON && !passed/);
  assert.match(step, /\.\.\.\(passed \? \{ liveness: passed \} : \{\}\)/);
  assert.match(step, /\{liveness\.screen\}/);
  const plugin = read("apps/mobile/plugins/optional-features.js");
  assert.match(plugin, /"tools:replace": "android:required"/, "the SDK's required camera can't hide the app from camera-less phones");
  assert.match(read("apps/mobile/app.json"), /check your face when you verify your identity/);
});
