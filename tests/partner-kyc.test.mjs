// Delivery partner verification steps (src/lib/logistics/partner-kyc.ts and the /api/logistics/kyc routes): input
// cleaning, masks, the guarantor's code and link (hashes only, expiry, tries, resend wait), and the wiring: every
// step refreshes the tier, IDs are never stored whole, the old submit route uses the tiered submit, the guarantor page
// is public, the terms are asked at setup, and the pages carry the spec's wording.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const k = await import("../src/lib/logistics/partner-kyc.ts");
const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

function files(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(path) : [path];
  });
}

test("input cleaning", () => {
  assert.equal(k.digitsOf("123 4567 8901", 11), "12345678901");
  assert.equal(k.digitsOf("1234", 11), null);
  assert.equal(k.cleanDateOfBirth("1990-02-28", new Date("2026-12-01")), "1990-02-28");
  assert.equal(k.cleanDateOfBirth("1990-02-30", new Date("2026-12-01")), null, "not a real date");
  assert.equal(k.cleanDateOfBirth("2015-01-01", new Date("2026-12-01")), null, "too young");
  assert.equal(k.cleanNamePart("  Ọlá  "), "Ọlá");
  assert.equal(k.cleanNamePart("A"), null);
  assert.equal(k.cleanNamePart("Robert'); DROP"), null);
  assert.equal(k.cleanPlate("lnd-123xy"), "LND-123XY");
  assert.equal(k.cleanPlate("ab"), null);
  assert.equal(k.cleanEmail(" Ada@Example.COM "), "ada@example.com");
  assert.equal(k.cleanEmail("ada@"), null);
});

test("masks never show the whole number", () => {
  assert.equal(k.maskPhone("+2348031234512"), "+234 803 ••• ••12");
  assert.equal(k.maskEmail("adaeze@gmail.com"), "ad•••@gmail.com");
});

test("ID hashes are keyed: the same NIN under another secret is a different hash", () => {
  const a = k.idNumberHash("secret-a", "nin", "12345678901");
  assert.equal(a, k.idNumberHash("secret-a", "nin", "12345678901"));
  assert.notEqual(a, k.idNumberHash("secret-b", "nin", "12345678901"));
  assert.notEqual(a, k.idNumberHash("secret-a", "bvn", "12345678901"));
  assert.equal(a.includes("12345678901"), false);
});

test("guarantor code: right code, wrong code, expired, too many tries, already answered", () => {
  const secret = "s";
  const now = Date.parse("2026-12-01T10:00:00Z");
  const base = { id: "g1", status: "pending", codeHash: k.guarantorCodeHash(secret, "g1", "123456"), codeExpiresAt: new Date(now + 1000), codeAttempts: 0 };
  assert.deepEqual(k.checkGuarantorCode(base, "123 456", secret, now), { ok: true });
  assert.deepEqual(k.checkGuarantorCode(base, "654321", secret, now), { ok: false, reason: "wrong_code" });
  assert.deepEqual(k.checkGuarantorCode({ ...base, codeExpiresAt: new Date(now - 1) }, "123456", secret, now), { ok: false, reason: "expired" });
  assert.deepEqual(k.checkGuarantorCode({ ...base, codeAttempts: k.GUARANTOR_MAX_ATTEMPTS }, "123456", secret, now), { ok: false, reason: "too_many" });
  assert.deepEqual(k.checkGuarantorCode({ ...base, status: "confirmed" }, "123456", secret, now), { ok: false, reason: "answered" });
  assert.deepEqual(k.checkGuarantorCode({ ...base, id: "g2" }, "123456", secret, now), { ok: false, reason: "wrong_code" }, "a code is tied to its guarantor");
});

test("guarantor link token is random and only its hash is stored", () => {
  const token = k.newGuarantorToken();
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(token, k.newGuarantorToken());
  assert.notEqual(k.guarantorTokenHash("s", token), token);
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model LogisticsGuarantor"), schema.indexOf("model LogisticsReview"));
  assert.match(model, /codeHash/);
  assert.match(model, /tokenHash/);
  assert.doesNotMatch(model, /\bcode\s+String/);
});

test("guarantor resend: wait between texts, and a cap", () => {
  const now = Date.parse("2026-12-01T10:00:00Z");
  assert.equal(k.guarantorResendWait({ lastSentAt: null, sendCount: 0 }, now), 0);
  assert.equal(k.guarantorResendWait({ lastSentAt: new Date(now - 20_000), sendCount: 1 }, now), 40);
  assert.equal(k.guarantorResendWait({ lastSentAt: new Date(now - 120_000), sendCount: 1 }, now), 0);
  assert.equal(k.guarantorResendWait({ lastSentAt: null, sendCount: k.GUARANTOR_MAX_SENDS }, now), null);
  const text = k.guarantorMessage("Swift Riders", "123456", "https://app.shopinbos.com/guarantor/abc");
  assert.match(text, /Swift Riders named you as their guarantor/);
  assert.match(text, /123456/);
  assert.match(text, /https:\/\/app\.shopinbos\.com\/guarantor\/abc/);
});

test("every kyc route that changes something refreshes the tier", () => {
  const routes = files("src/app/api/logistics/kyc").filter((path) => path.endsWith("route.ts") && path !== "src/app/api/logistics/kyc/route.ts");
  assert.ok(routes.length >= 11, routes.join(", "));
  for (const path of routes) {
    const src = read(path);
    if (path.endsWith("/payout/route.ts") || path.endsWith("/nin/route.ts") || path.endsWith("/phone/route.ts") || path.endsWith("/email/route.ts") || path.endsWith("/identity/route.ts")) {
      assert.match(src, /updateIdentityChecks/, path);
    } else if (path.endsWith("/submit/route.ts")) {
      assert.match(src, /submitPartnerKyc/, path);
    } else {
      assert.match(src, /refreshPartnerTier/, path);
    }
  }
  assert.match(read("src/lib/logistics/partner-kyc.server.ts"), /export async function updateIdentityChecks[\s\S]*?refreshPartnerTier\(partnerId\)/);
  assert.match(read("src/lib/logistics/partner-kyc.server.ts"), /export async function submitPartnerKyc[\s\S]*?refreshPartnerTier\(partner\.id\)/);
});

test("NIN and BVN are stored as last 4 digits and a keyed hash, never whole", () => {
  for (const path of ["src/app/api/logistics/kyc/nin/route.ts", "src/app/api/logistics/kyc/payout/route.ts"]) {
    const src = read(path);
    assert.match(src, /last4: (nin|bvn|accountNumber)\.slice\(-4\)/, path);
    assert.doesNotMatch(src, /nin: nin[,\s}]|bvn: bvn[,\s}]|accountNumber: accountNumber/, path);
  }
  const state = read("src/lib/logistics/partner-kyc.server.ts");
  const view = state.slice(state.indexOf("export async function kycState"), state.indexOf("export type KycState"));
  assert.doesNotMatch(view, /hash/i, "the page state never carries a hash");
});

test("the old submit route (phone app) uses the tiered submit and names what's missing", () => {
  const src = read("src/app/api/logistics/verification/submit/route.ts");
  assert.match(src, /submitPartnerKyc\(user\.id\)/);
  assert.match(src, /missing/);
  assert.match(read("src/lib/logistics/partner-kyc.server.ts"), /readyToSubmit\(items\)/);
});

test("the guarantor page and its API are public and rate limited", () => {
  const access = read("src/lib/auth/route-access.ts");
  assert.doesNotMatch(access, /prefix: "\/guarantor"/);
  assert.ok(existsSync(join(root, "src/app/guarantor/[token]/page.tsx")));
  const api = read("src/app/api/public/guarantor/[token]/route.ts");
  assert.match(api, /checkRateLimitShared/);
  assert.match(api, /updateMany\(\{\s*where: \{ id: guarantor\.id, status: "pending" \}/);
  assert.match(api, /refreshPartnerTier/);
});

test("terms at setup, the CAC banner and link, and the spec's pages", () => {
  const onboarding = read("src/components/onboarding/LogisticsOnboarding.tsx");
  assert.match(onboarding, /acceptTerms: true/);
  assert.match(read("src/app/api/logistics/onboarding/route.ts"), /termsVersion: PARTNER_TERMS_VERSION/);
  const en = read("shared/i18n/messages/partnerKyc/en.ts");
  assert.match(en, /"page.noCacBanner": "You don't need CAC to start\. Add it later to unlock more orders\."/);
  assert.match(en, /"page.cacHelpLink": "Don't have CAC\? Learn how to register"/);
  assert.match(en, /icrp\.cac\.gov\.ng/);
  assert.match(en, /SMEDAN/);
  for (const point of ["independent operator", "licences, permits and legal compliance", "documents you submit are true", "suspend your account"]) assert.ok(en.includes(point), point);
  assert.match(read("src/app/logistics/terms/page.tsx"), /lawyer/);
  const flow = read("src/components/logistics/verification/PartnerVerificationFlow.tsx");
  assert.match(flow, /\/logistics\/cac-help/);
  assert.match(read("shared/partner-tiers.ts"), /ONBOARDING_STEPS = \["identity", "bank", "vehicles", "coverage", "guarantor", "cac", "review"\]/);
  assert.match(read("src/app/logistics/dashboard/page.tsx"), /<TierCard partnerId=/);
});

// ─── Selfie (Korapay facial match) ───────────────────────────────────────────

const jpeg = (bytes) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;

test("the selfie must be a JPEG, PNG or WebP photo of a sensible size", () => {
  const good = k.readSelfieDataUri(jpeg(40_000));
  assert.equal(good.ok, true);
  assert.equal(good.mimeType, "image/jpeg");
  assert.equal(good.ext, "jpg");
  assert.equal(good.bytes.length, 40_000);
  assert.equal(k.readSelfieDataUri("").ok, false);
  assert.equal(k.readSelfieDataUri("data:image/gif;base64,R0lGODlh").ok, false);
  assert.equal(k.readSelfieDataUri("data:application/pdf;base64,JVBERi0=").ok, false);
  assert.equal(k.readSelfieDataUri(jpeg(100)).ok, false, "too small to check");
  assert.equal(k.readSelfieDataUri(jpeg(k.SELFIE_MAX_BYTES + 1)).ok, false, "too big");
});

test("a liveness report keeps only a plain Korapay reference", () => {
  assert.deepEqual(k.readLivenessReport({ reference: "KPY-LV-123", passed: true }), { reference: "KPY-LV-123", passed: true });
  assert.deepEqual(k.readLivenessReport({ reference: "KPY-LV-123" }), { reference: "KPY-LV-123", passed: false });
  assert.equal(k.readLivenessReport({ reference: "<script>" }), null);
  assert.equal(k.readLivenessReport({ reference: "x".repeat(121), passed: true }), null);
  assert.equal(k.readLivenessReport(null), null);
});

test("wiring: the NIN check sends the selfie to Korapay and the generic upload refuses selfies", () => {
  const route = read("src/app/api/logistics/kyc/nin/route.ts");
  assert.match(route, /verifyKorapayIdentity\(\{ \.\.\.typed, selfie: selfie\.dataUri \}\)/);
  assert.match(route, /selfieDecision\(face\)/);
  assert.match(route, /korapayLivenessReady\(\) && !liveness/, "with liveness on, a selfie without it waits for the team");
  assert.match(route, /saveSelfie\(/);
  assert.match(read("src/lib/korapay.ts"), /\.\.\.\(input\.selfie \? \{ selfie: input\.selfie \} : \{\}\)/);
  assert.match(read("src/app/actions/verification.ts"), /docType === "selfie"/);
  const config = read("next.config.ts");
  assert.match(config, /source: "\/logistics\/verification",\s*headers: baseHeaders\(true\)/);
  assert.match(config, /camera=\(\), microphone=\(self\)/, "the camera stays off everywhere else");
});

// ─── No BVN, and unverified partners are sent to verify ──────────────────────

test("partners are never asked for a BVN: bank account only, on the web, the phone and the server", () => {
  const route = read("src/app/api/logistics/kyc/payout/route.ts");
  assert.doesNotMatch(route, /method === "bvn"|verifyKorapayIdentity|idNumberHash\(secret, "bvn"/);
  for (const path of ["src/components/logistics/verification/IdentityBankSteps.tsx", "apps/mobile/src/components/kyc/FleetSteps.tsx"]) {
    assert.doesNotMatch(read(path).replace(/^\s*\/\/.*$/gm, ""), /bvn/i, `${path} asks for a BVN`);
  }
  for (const ns of ["partnerKyc", "m_kyc"]) {
    for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.doesNotMatch(read(`shared/i18n/messages/${ns}/${locale}.ts`), /BVN/, `${ns}/${locale} mentions BVN`);
  }
  assert.doesNotMatch(read("shared/i18n/messages/m_partner/en.ts"), /"kyc\.need\.bank": "[^"]*BVN/);
  assert.match(read("shared/partner-tiers.ts"), /payout: "Bank account"/);
});

test("unverified partners are sent to verify: after set-up, from blocked job pages, and the banner tells the truth", async () => {
  assert.match(read("src/components/onboarding/LogisticsOnboarding.tsx"), /router\.push\(destination \|\| \(verified \? "\/logistics\/dashboard" : "\/logistics\/verification"\)\)/);
  assert.doesNotMatch(read("src/components/onboarding/LogisticsOnboarding.tsx"), /Verify your business/, "set-up no longer asks for CAC as the way to verify");
  for (const path of ["src/app/actions/logistics.ts", "src/app/actions/delivery-market-partner.ts"]) {
    assert.doesNotMatch(read(path), /verification=pending/);
    assert.match(read(path), /redirect\("\/logistics\/verification"\)/);
  }
  const kit = read("src/components/logistics/kit.tsx");
  assert.match(kit, /verificationStatus: bannerStatus\(partner\)/);
  assert.match(kit, /partner\.verificationStatus === "pending" && "kycSubmittedAt" in partner && !partner\.kycSubmittedAt\) return "unverified"/);
  const setup = read("src/lib/onboarding/setup-status.server.ts");
  assert.match(setup, /tier1Checklist\(found\.snapshot\)/, "the set-up checklist follows the tier steps, not CAC + insurance");
});
