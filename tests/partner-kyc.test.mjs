// Delivery partner verification steps (src/lib/logistics/partner-kyc.ts and the /api/logistics/kyc routes): input
// cleaning, masks, and the wiring: every step refreshes the tier, IDs are never stored whole, the old submit route
// uses the tiered submit, there is no guarantor any more
// is public, the terms are asked at setup, and the pages carry the spec's wording.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const k = await import("../src/lib/logistics/partner-kyc.ts");
const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

/** A route's source, or the shared step it hands to (the phone link runs the same step, src/lib/kyc/handoff.server.ts). */
function stepSource(path) {
  const src = read(path);
  const shared = /import \{ (\w+) \} from "@\/lib\/(logistics\/kyc-steps|kyc\/supplier-steps)\.server"/.exec(src);
  if (!shared) return src;
  const lib = read(`src/lib/${shared[2]}.server.ts`);
  const start = lib.indexOf(`export async function ${shared[1]}(`);
  const next = lib.indexOf("\nexport async function ", start + 1);
  return lib.slice(start, next === -1 ? undefined : next);
}

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




test("every kyc route that changes something refreshes the tier", () => {
  // The phone-link route only makes a link (the phone's selfie then runs the shared steps below).
  const routes = files("src/app/api/logistics/kyc").filter((path) => path.endsWith("route.ts") && path !== "src/app/api/logistics/kyc/route.ts" && !path.endsWith("/handoff/route.ts"));
  assert.ok(routes.length >= 11, routes.join(", "));
  for (const path of routes) {
    const src = stepSource(path);
    if (["payout", "nin", "phone", "email", "identity", "base", "id-document"].some((name) => path.endsWith(`/${name}/route.ts`))) {
      assert.match(src, /updateIdentityChecks/, path);
    } else if (path.endsWith("/answers/route.ts") || path.endsWith("/logo/route.ts")) {
      assert.match(src, /saveFlowAnswers/, path);
    } else if (path.endsWith("/submit/route.ts")) {
      assert.match(src, /submitPartnerKyc/, path);
    } else {
      assert.match(src, /refreshPartnerTier/, path);
    }
  }
  assert.match(read("src/lib/logistics/partner-kyc.server.ts"), /export async function updateIdentityChecks[\s\S]*?refreshPartnerTier\(partnerId\)/);
  assert.match(read("src/lib/logistics/partner-kyc.server.ts"), /export async function submitPartnerKyc[\s\S]*?refreshPartnerTier\(partner\.id\)/);
  assert.match(read("src/lib/logistics/partner-kyc.server.ts"), /export async function saveFlowAnswers[\s\S]*?refreshPartnerTier\(partnerId\)/);
});

test("NIN and BVN are stored as last 4 digits and a keyed hash, never whole", () => {
  for (const path of ["src/app/api/logistics/kyc/nin/route.ts", "src/app/api/logistics/kyc/payout/route.ts"]) {
    const src = stepSource(path);
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


test("terms at setup, the CAC banner and link, and the spec's pages", () => {
  // Terms are accepted on the last screen of the one-question sign-up (the old set-up wizard is gone).
  assert.match(read("src/components/logistics/verification/CheckScreens.tsx"), /kycCall\("\/terms", \{ method: "POST" \}\)/);
  assert.match(read("src/app/api/logistics/onboarding/route.ts"), /termsVersion: PARTNER_TERMS_VERSION/);
  const en = read("shared/i18n/messages/partnerKyc/en.ts");
  assert.match(en, /"q.cac.sub": "You can start without it\. Any answer is fine\."/);
  assert.match(en, /"page.cacHelpLink": "Don't have CAC\? Learn how to register"/);
  assert.match(en, /icrp\.cac\.gov\.ng/);
  assert.match(en, /SMEDAN/);
  for (const point of ["independent operator", "licences, permits and legal compliance", "documents you submit are true", "suspend your account"]) assert.ok(en.includes(point), point);
  assert.match(read("src/app/logistics/terms/page.tsx"), /lawyer/);
  assert.match(read("src/components/logistics/verification/CheckScreens.tsx"), /\/logistics\/cac-help/);
  assert.match(read("shared/partner-tiers.ts"), /PARTNER_FLOW = \["name", "cac", "logo", "state", "areas", "vehicles", "interstate", "charge", "base", "id", "selfie", "review"\]/);
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
  const route = stepSource("src/app/api/logistics/kyc/nin/route.ts");
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
  const screens = ["src/components/logistics/verification/QuestionScreens.tsx", "src/components/logistics/verification/CheckScreens.tsx", "apps/mobile/src/components/kyc/QuestionScreens.tsx", "apps/mobile/src/components/kyc/CheckScreens.tsx"];
  for (const path of screens) {
    assert.doesNotMatch(read(path).replace(/^\s*\/\/.*$/gm, ""), /bvn/i, `${path} asks for a BVN`);
  }
  for (const ns of ["partnerKyc", "m_kyc"]) {
    for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.doesNotMatch(read(`shared/i18n/messages/${ns}/${locale}.ts`), /BVN/, `${ns}/${locale} mentions BVN`);
  }
  assert.doesNotMatch(read("shared/i18n/messages/m_partner/en.ts"), /"kyc\.need\.bank": "[^"]*BVN/);
  // The bank account isn't part of sign-up at all: it's added in their Wallet to get paid (the Payout ready badge).
  for (const path of screens) assert.doesNotMatch(read(path), /\/payout"|kyc\/payout/, path);
  assert.match(read("shared/partner-tiers.ts"), /payout_ready: "Payout ready"/);
});

test("unverified partners are sent to verify: after set-up, from blocked job pages, and the banner tells the truth", async () => {
  // Set-up is the verification flow itself: the old wizard is gone and its page sends people there, query kept.
  assert.equal(existsSync(join(root, "src/components/onboarding/LogisticsOnboarding.tsx")), false);
  assert.match(read("src/app/logistics/onboarding/page.tsx"), /redirect\(`\/logistics\/verification\$\{query \? `\?\$\{query\}` : ""\}`\)/);
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

test("the partners' 60-second verification intro says no CAC to start and never mentions a BVN", async () => {
  const { introForPath } = await import("../shared/feature-intros.ts");
  const intro = introForPath("/logistics/verification", "logistics_partner");
  assert.equal(intro?.key, "partner-verification");
  const words = intro.scenes.map((scene) => `${scene.caption} ${scene.sub} ${(scene.chips ?? []).join(" ")}`).join(" ");
  assert.match(words, /don’t need CAC to start/);
  assert.doesNotMatch(words, /BVN|Upload your CAC/);
  assert.equal(introForPath("/supplier/verification", "supplier")?.key, "verification");
});

test("no guarantor anywhere: no routes, no page, not in the Tier 1 checks", () => {
  for (const path of ["src/app/guarantor", "src/app/api/public/guarantor", "src/app/api/logistics/kyc/guarantor", "src/app/api/admin/logistics-partners/[id]/guarantor"]) {
    assert.equal(existsSync(join(root, path)), false, `${path} is gone`);
  }
  assert.doesNotMatch(read("shared/partner-tiers.ts").replace(/^\s*\/\/.*$/gm, ""), /guarantor/i);
  assert.doesNotMatch(read("src/lib/logistics/partner-kyc.server.ts"), /guarantor/i);
});

test("Korapay runs every CAC check when it's set up, with the business name, and admins can test it", () => {
  const cac = read("src/lib/kyb/verify-cac.server.ts");
  assert.match(cac, /if \(korapayIdentityReady\(\)\) return \{ lookup: await lookupKorapayCac\(number, companyType, registrationName\), provider: "korapay" \};/);
  // The live API wants the digits alone (a prefixed id is a validation_error) and no name.
  assert.match(cac, /korapayCacBody\(rcNumber, companyType\)/);
  assert.doesNotMatch(cac, /registration_name:/);
  assert.match(read("src/app/api/admin/korapay-check/route.ts"), /withAdmin\(async \(\) => ok\(await runKorapayCheck\(\)\)\)/);
  assert.match(read("src/app/admin/developers/page.tsx"), /<KorapayCheckCard \/>/);
});

test("a NIN check Korapay refuses with the selfie is retried without it, and the selfie goes to the team", () => {
  const route = stepSource("src/app/api/logistics/kyc/nin/route.ts");
  assert.match(route, /const plain = await verifyKorapayIdentity\(typed\);/);
  assert.match(route, /const face = viaKorapay && !faceMatchRefused \? identity\.selfie \?\? null : null;/);
});

test("the old set-up wizard sends partners to the one flow, and saving 'Your delivery' completes set-up", () => {
  assert.match(read("src/app/logistics/onboarding/page.tsx"), /redirect\(`\/logistics\/verification/);
  const coverage = read("src/app/api/logistics/kyc/coverage/route.ts");
  assert.match(coverage, /companyName, displayName: companyName/);
  assert.match(coverage, /onboardingState: \{ \.\.\.state, completed: true/);
  assert.match(read("src/lib/role-queries.ts"), /db\.logisticsPartner\.upsert/, "no redirect loop when the partner row is missing");
});

test("partner kyc: failed calls keep the HTTP status for App errors and show friendly words", () => {
  const kit = read("src/components/logistics/verification/kit.tsx");
  assert.match(kit, /`HTTP \$\{response\.status\} from/);
  assert.match(kit, /setError\(friendlyError\(cause, t\("page\.failed"\)\)\)/);
  assert.match(read("src/app/api/logistics/kyc/nin/route.ts"), /export const maxDuration = 90;/);
});

test("partner kyc: photo steps retry once after a gateway timeout, the paid NIN check never does", () => {
  const screens = read("src/components/logistics/verification/CheckScreens.tsx");
  for (const path of ["/base", "/id-document", "/selfie"]) {
    assert.match(screens, new RegExp(`kycCall\\("${path}", jsonInit\\([^\\n]*\\{ retry: true \\}\\)`), path);
  }
  assert.doesNotMatch(screens, /kycCall\("\/nin"[^\n]*retry/);
  assert.match(read("src/components/logistics/verification/kit.tsx"), /GATEWAY_STATUSES = new Set\(\[502, 503, 504\]\)/);
});
