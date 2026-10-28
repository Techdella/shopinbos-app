// Delivery partner sign-up on the phone (apps/mobile/src/app/logistics/verification.tsx): one question per screen
// (shared/partner-tiers.ts PARTNER_FLOW) in place of the old CAC + insurance documents, the ID photo and the selfie
// (sent with the NIN for the Korapay face match on a NIN slip), the tier card on Jobs, and the words in every language.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const kyc = await import("../apps/mobile/src/lib/kyc-pure.ts");
const tiers = await import("../shared/partner-tiers.ts");


test("where the phone flow opens: the screen asked for, older step names, else the first unanswered one", () => {
  assert.equal(kyc.openScreen("areas"), "areas");
  assert.equal(kyc.openScreen("areas", "cac"), "cac", "Add CAC on the tier card");
  assert.equal(kyc.openScreen("areas", "identity"), "id");
  assert.equal(kyc.openScreen("areas", "delivery"), "areas");
  assert.equal(kyc.openScreen("base", "bank"), "review", "no bank step any more");
  assert.equal(kyc.openScreen("name", "nonsense"), "name");
  assert.equal(kyc.nextScreen("name"), "cac");
  assert.equal(kyc.nextScreen("review"), "review");
  assert.equal(kyc.previousScreen("name"), null);
  assert.equal(kyc.previousScreen("selfie"), "id");
  assert.deepEqual(kyc.screenNumber("selfie"), { step: 10, total: 11 });
  assert.equal(kyc.areaToken("Lagos", "Ikeja"), "Lagos: Ikeja");
  assert.equal(kyc.areaToken("Lagos"), "Lagos");
  assert.equal(kyc.feeAmount("₦2,500"), 2500);
  assert.equal(kyc.feeAmount("50"), null);
  assert.deepEqual(kyc.itemsWhereOpen({ phone: "approved", idDocument: "missing", selfie: "rejected" }).map((item) => item.key), ["idDocument", "selfie"]);
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

test("the phone asks one question per screen, with the same calls as the web, and never for a BVN, bank or papers", () => {
  const client = app("lib/kyc.ts");
  assert.match(client, /const BASE = "\/api\/logistics\/kyc"/);
  assert.match(client, /checkNin = \(input: \{ nin: string; firstName: string; lastName: string; dateOfBirth: string; selfie: string; liveness\?/);
  for (const path of ["/answers", "/base", "/id-document", "/nin", "/selfie", "/phone", "/business", "/terms", "/submit"]) assert.ok(client.includes(`\${BASE}${path}`), path);
  for (const gone of ["/payout", "/email", "/vehicles", "/coverage"]) assert.ok(!client.includes(`\${BASE}${gone}`), gone);
  assert.match(client, /\/api\/logistics\/verification\/cac/, "CAC is looked up: Is this your company?");
  const screen = app("app/logistics/verification.tsx");
  assert.doesNotMatch(screen, /VerificationScreen|LOGISTICS_DOC_TYPES/);
  for (const name of ["NameScreen", "CacScreen", "StateScreen", "AreasScreen", "VehiclesScreen", "InterstateScreen", "ChargeScreen", "BaseScreen", "IdScreen", "SelfieScreen", "ReviewScreen"]) assert.match(screen, new RegExp(`<${name} `), name);
  assert.match(screen, /openScreen\(data\.flow\.first, params\.step\)/, "reopens on the first unanswered screen");
  assert.match(screen, /t\("step\.of", number\)/);
  const checks = app("components/kyc/CheckScreens.tsx");
  assert.match(checks, /cameraType: front \? ImagePicker\.CameraType\.front : ImagePicker\.CameraType\.back/);
  assert.match(checks, /base64: true/);
  assert.match(checks, /Location\.getCurrentPositionAsync/, "Use my current location");
  assert.match(checks, /saveIdDocument\(idType, photo\.dataUri\)/);
  assert.match(checks, /checkNin\(\{ nin: draft\.nin, firstName: draft\.firstName\.trim\(\), lastName: draft\.lastName\.trim\(\), dateOfBirth: born, selfie: selfie\.dataUri, \.\.\.extra \}\)/);
  assert.match(checks, /sendSelfie\(\{ selfie: selfie\.dataUri, \.\.\.extra \}\)/);
  assert.match(checks, /if \(!state\.termsCurrent\) await acceptTerms\(\);/);
  assert.match(checks, /itemsWhereOpen\(state\.tier1\)\.filter\(\(item\) => item\.key !== "terms"\)/, "unticked terms never lock the send button");
  assert.match(checks, /openOnWeb\("\/logistics\/terms"\)/);
  assert.match(checks, /openOnWeb\("\/logistics\/cac-help"\)/);
  const questions = app("components/kyc/QuestionScreens.tsx");
  assert.match(questions, /saveAnswer\("name", \{ companyName \}\)/);
  assert.match(questions, /saveAnswer\("charge", charge === "flat" \? \{ charge, amount: fee \} : \{ charge \}\)/);
  assert.match(questions, /const VEHICLES = \["bike", "car", "van", "truck", "tricycle"\] as const;/, "truck is a delivery method");
  for (const file of ["lib/kyc.ts", "components/kyc/QuestionScreens.tsx", "components/kyc/CheckScreens.tsx", "app/logistics/verification.tsx"]) {
    assert.doesNotMatch(app(file).replace(/^\s*\/\/.*$/gm, ""), /guarantor|bvn|plateNumber|licence/i, file);
  }
  // New and unfinished partners go straight to verification; the old set-up wizard only redirects there.
  assert.match(app("app/logistics/(tabs)/home.tsx"), /onboarded \? "\/logistics\/jobs" : "\/logistics\/verification"/);
  assert.match(app("app/logistics/setup.tsx"), /<Redirect href="\/logistics\/verification" \/>/);
  assert.match(app("lib/logistics-pure.ts"), /setup: \{ path: "\/logistics\/verification"/);
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
  const used = ["components/kyc/KycKit.tsx", "components/kyc/QuestionScreens.tsx", "components/kyc/CheckScreens.tsx", "components/kyc/TierCard.tsx", "app/logistics/verification.tsx"]
    .flatMap((file) => [...app(file).matchAll(/\bt\("([a-zA-Z0-9_.-]+)"/g)].map((match) => match[1]));
  for (const key of used) assert.ok(key in catalog.en, key);
  // Dynamic keys: every ID type, Tier 1 item and vehicle the screens show.
  for (const type of tiers.ID_TYPES) assert.ok(`idType.${type}` in catalog.en, type);
  for (const item of tiers.TIER1_ITEMS) assert.ok(`item.name.${item}` in catalog.en, item);
  for (const method of ["bike", "car", "van", "truck", "tricycle"]) assert.ok(`method.${method}` in catalog.en, method);
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
  const step = read("apps/mobile/src/components/kyc/CheckScreens.tsx");
  assert.match(step, /LIVENESS_ON && !passed/);
  assert.match(step, /const extra = passed \? \{ liveness: passed \} : \{\};/);
  assert.match(step, /\{liveness\.screen\}/);
  const plugin = read("apps/mobile/plugins/optional-features.js");
  assert.match(plugin, /"tools:replace": "android:required"/, "the SDK's required camera can't hide the app from camera-less phones");
  assert.match(read("apps/mobile/app.json"), /check your face when you verify your identity/);
});
