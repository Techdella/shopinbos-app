// Phone app round 2 flow fixes (supplier, delivery partner, rider and seller): each test reads the screens or runs
// the shared rules they use.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const LANGS = ["en", "pcm", "yo", "ha", "ig"];
const catalog = (ns, lang) => read(`shared/i18n/messages/${ns}/${lang}.ts`);
const hasKey = (ns, key) => LANGS.every((lang) => catalog(ns, lang).includes(`"${key}":`));

// ─── Supplier ─────────────────────────────────────────────────────────────────

test("supplier set-up has a Documents step with the in-app upload and the real Send for review", () => {
  const setup = app("app/supplier/setup.tsx");
  assert.match(setup, /type Step = "welcome" \| "biz" \| "pickup" \| "where" \| "bank" \| "docs" \| "ready"/);
  assert.match(setup, /useVerificationDocs\("supplier"/);
  assert.match(setup, /<VerificationDocList role="supplier" v=\{docs\} \/>/);
  // Only a send the server took moves on; otherwise the note shows its reason.
  assert.match(setup, /if \(await docs\.send\(\)\) \{/);
  assert.match(setup, /\{docs\.note \? <Notice tone=\{docs\.note\.tone\}>/);
  const screen = app("components/VerificationScreen.tsx");
  assert.match(screen, /export function useVerificationDocs/);
  assert.match(screen, /export function VerificationDocList/);
  assert.match(screen, /missingRequiredDocs\(docTypesForRole\(role\)/, "the same required documents as the server");
  for (const key of ["setup.docsTitle", "setup.docsSub", "setup.docsSend", "setup.readySubChecking", "setup.readySubVerified"]) assert.ok(hasKey("m_supplier", key), key);
  assert.ok(hasKey("m_ui", "verify.missing"));
});

test("an unverified supplier's product is saved as a draft, and the app says shops see it once verified", async () => {
  const route = read("src/app/api/supplier/products/route.ts");
  assert.doesNotMatch(route, /VERIFICATION_REQUIRED/, "saving is never refused for verification");
  assert.match(route, /status: parsed\.data\.status === "pending_review" && !unverified \? "pending_review" : "draft"/);
  // Showing it to shops still needs verification.
  assert.match(read("src/app/api/mobile/supplier/products/[id]/route.ts"), /VERIFICATION_REQUIRED/);
  const { savedAs } = await import("../apps/mobile/src/lib/supplier-pure.ts");
  assert.equal(savedAs("pending_review", "draft"), "unverified");
  assert.equal(savedAs("pending_review", "pending_review"), "pending_review");
  assert.equal(savedAs("draft", "draft"), "draft");
  const form = app("app/supplier/product/new.tsx");
  assert.match(form, /setSaved\(savedAs\(status, created\?\.status\)\)/);
  assert.match(form, /router\.replace\("\/supplier\/verification"\)/);
  assert.match(catalog("m_supplier", "en"), /"new\.savedUnverifiedSub": "Shops see it once you're verified\."/);
  assert.doesNotMatch(catalog("m_supplier", "en"), /Shops can start selling it straight away/);
});

test("dropship agreements are in the app: list, terms, sign or decline, from the notification, Home and Account", () => {
  const list = read("src/app/api/mobile/supplier/agreements/route.ts");
  assert.match(list, /withSupplier/);
  assert.match(list, /agreementsForSupplier\(supplier\.id\)/);
  assert.match(list, /readContractDocument/);
  const answer = read("src/app/api/mobile/supplier/agreements/[id]/route.ts");
  assert.match(answer, /answerAgreement\(user, /, "the web's own rules");
  const screen = app("app/supplier/agreements.tsx");
  assert.match(screen, /AGREEMENT_POINTS/);
  assert.match(screen, /<AgreementText doc=\{row\.document\} \/>/);
  assert.match(screen, /cleanSignedName\(signedName\)/);
  assert.match(screen, /answerAgreement\(row\.id, accept \? \{ accept: true, signedName \} : \{ accept: false, note \}\)/);
  assert.match(app("app/supplier/account.tsx"), /router\.push\("\/supplier\/agreements"\)/);
  assert.match(app("app/supplier/(tabs)/home.tsx"), /router\.push\("\/supplier\/agreements"\)/);
  assert.match(read("shared/notifications.ts"), /\[\/\^\\\/supplier\\\/agreements\$\/, "\/supplier\/agreements"\]/);
});

test("suppliers and delivery partners can turn tips off", () => {
  for (const file of ["app/supplier/account.tsx", "app/logistics/(tabs)/more.tsx", "app/settings.tsx"]) assert.match(app(file), /<TipsRow/, file);
  assert.match(app("components/learn/TipsRow.tsx"), /first = false/);
});

// ─── Delivery partner ─────────────────────────────────────────────────────────

test("delivery set-up: no CAC or insurance needed; it finishes set-up and opens the tiered verification", () => {
  const setup = app("app/logistics/setup.tsx");
  // Documents moved to the stepped verification screen (shared/partner-tiers.ts): set-up never uploads or submits.
  assert.doesNotMatch(setup, /LOGISTICS_DOC_TYPES|uploadVerificationDoc|submitVerification/);
  // The short set-up (two questions) ends on what verification needs, then opens it (or Jobs, "Later").
  assert.match(setup, /"kyc\.need\.id", "kyc\.need\.bank", "kyc\.need\.vehicle", "kyc\.need\.guarantor"/);
  assert.match(setup, /router\.replace\("\/logistics\/verification"\)/);
  assert.doesNotMatch(app("lib/logistics-pure.ts"), /LOGISTICS_DOC_TYPES/);
  for (const key of ["kyc.introTitle", "kyc.introSub", "kyc.introCac", "kyc.start", "kyc.doneTitle", "kyc.doneSub"]) assert.ok(hasKey("m_partner", key), key);
});

test("taking new jobs: why it's off, for every state, and never 'on hold' unless suspended", async () => {
  const { takingJobsBlock, TAKING_BLOCK_ERRORS, docsSentFor } = await import("../shared/taking-jobs.ts");
  const base = { status: "active", verificationStatus: "verified", onboarded: true, docsSent: true };
  assert.equal(takingJobsBlock(base), null);
  assert.equal(takingJobsBlock({ ...base, status: "pending" }), null, "a verified company with an old status can switch");
  assert.equal(takingJobsBlock({ ...base, status: "paused" }), null);
  assert.equal(takingJobsBlock({ ...base, verificationStatus: "pending", onboarded: false, docsSent: false }), "setup");
  assert.equal(takingJobsBlock({ ...base, verificationStatus: "pending", docsSent: false }), "documents", "pending is also the starting value");
  assert.equal(takingJobsBlock({ ...base, verificationStatus: "unverified", docsSent: false }), "documents");
  assert.equal(takingJobsBlock({ ...base, verificationStatus: "pending", docsSent: true }), "checking");
  assert.equal(takingJobsBlock({ ...base, verificationStatus: "rejected" }), "rejected");
  assert.equal(takingJobsBlock({ ...base, status: "suspended" }), "hold");
  assert.equal(takingJobsBlock({ ...base, verificationStatus: "suspended" }), "hold");
  for (const block of ["setup", "documents", "checking", "rejected"]) assert.doesNotMatch(TAKING_BLOCK_ERRORS[block].message, /on hold/i, block);
  assert.match(TAKING_BLOCK_ERRORS.hold.message, /on hold/);
  assert.match(TAKING_BLOCK_ERRORS.checking.message, /1 working day/);
  const uploaded = (type, status) => ({ id: type, type, label: type, fileName: "a.jpg", filePath: `p/${type}.jpg`, fileSize: 1, mimeType: "image/jpeg", status, uploadedAt: "2026-10-01", updatedAt: "2026-10-01" });
  assert.equal(docsSentFor([uploaded("cac", "submitted"), uploaded("insurance", "submitted")]), true);
  assert.equal(docsSentFor([uploaded("cac", "uploaded"), uploaded("insurance", "uploaded")]), false, "uploaded but not sent");
  assert.equal(docsSentFor([uploaded("cac", "submitted")]), false, "insurance missing");
  assert.equal(docsSentFor(null), false);

  const route = read("src/app/api/mobile/logistics/taking/route.ts");
  assert.match(route, /takingJobsBlock\(\{/);
  assert.match(route, /if \(block === "hold" \|\| \(block && body\.taking\)\)/, "pausing works; switching on needs verification");
  assert.doesNotMatch(route, /partner\.status !== "active" && partner\.status !== "paused"/, "an odd status no longer reads as on hold");
  assert.match(read("src/app/api/mobile/logistics/overview/route.ts"), /takingBlock: takingJobsBlock\(/);
  // Verifying a company with an old status makes it active, so the switch can work.
  assert.match(read("src/app/actions/admin.ts"), /status: \{ notIn: \["active", "paused"\] \} \}, data: \{ status: "active" \}/);
});

test("Jobs: the switch is always tappable, says why it's off with one tap forward, and stays as saved", () => {
  const jobs = app("app/logistics/(tabs)/jobs.tsx");
  assert.doesNotMatch(jobs, /pointerEvents=\{ready/, "never a dead, greyed-out switch");
  assert.match(jobs, /const block = data \? takingBlockOf\(data\.partner\) : null;/);
  assert.match(jobs, /if \(block\) \{\s*setWhy\(true\);/);
  assert.match(jobs, /\{block \? <TakingBlockLine block=\{block\} strong=\{why\} \/> : null\}/);
  assert.match(jobs, /await setTakingJobs\(next\);\s*await overview\.reload\(\);\s*setOverride\(null\);/, "re-read after saving");
  assert.match(jobs, /accessibilityRole="alert"[^>]*>\{switchError\}/, "the server's refusal is shown under the switch");
  const pure = app("lib/logistics-pure.ts");
  assert.match(pure, /setup: \{ path: "\/logistics\/setup"/);
  assert.match(pure, /documents: \{ path: "\/logistics\/verification"/);
  assert.match(pure, /checking: \{ path: null/);
  assert.match(pure, /hold: \{ path: "\/help"/);
  for (const key of ["taking.why.setup", "taking.why.documents", "taking.why.checking", "taking.why.rejected", "taking.why.hold", "taking.go.setup", "taking.go.documents", "taking.go.rejected", "taking.go.hold"]) assert.ok(hasKey("m_partner", key), key);
  assert.match(catalog("m_partner", "en"), /"taking\.why\.checking": "We're checking your documents\. Usually within 1 working day\./);
});

test("no competitor names in phone or web strings (Shipbubble, Bumpa, Catlog)", () => {
  for (const ns of ["m_partner", "logistics", "m_onboarding"]) {
    for (const lang of LANGS) assert.doesNotMatch(catalog(ns, lang), /Shipbubble|Bumpa|Catlog/i, `${ns}/${lang}`);
  }
});

test("partner notifications open the app's wallet, connections and cash screens; the orphan menu is gone", async () => {
  const n = await import("../shared/notifications.ts");
  assert.deepEqual(n.appRouteFor("/logistics/wallet"), { pathname: "/logistics/wallet" });
  assert.deepEqual(n.appRouteFor("/logistics/connections"), { pathname: "/logistics/connections" });
  assert.deepEqual(n.appRouteFor("/logistics/cash"), { pathname: "/logistics/cash" });
  for (const screen of ["app/logistics/wallet.tsx", "app/logistics/connections.tsx", "app/logistics/cash.tsx"]) assert.ok(existsSync(join(root, "apps/mobile/src", screen)), screen);
  assert.ok(!existsSync(join(root, "apps/mobile/src/app/logistics/menu.tsx")));
});

test("Business details are editable in the app (Peggy's 'Business details' step lands there)", () => {
  const profile = app("app/logistics/profile.tsx");
  assert.match(profile, /await saveBusiness\(trimmed\)/);
  for (const field of ["companyName", "cacNumber", "contactName", "contactPhone", "contactEmail", "address"]) assert.match(profile, new RegExp(`onChangeText=\\{set\\("${field}"\\)\\}`), field);
  assert.match(app("lib/peggy-call-pure.ts"), /profile: "\/logistics\/profile"/);
});

// ─── Rider ────────────────────────────────────────────────────────────────────

test("rider: no code from the customer → proof photo plus who received it, which the server accepts", async () => {
  const rules = await import("../src/lib/logistics/job-rules.ts");
  const job = { status: "out_for_delivery", deliveryCode: "0427", codAmount: null, proofUrl: "https://x/p.jpg" };
  assert.equal(rules.checkTransition(job, { to: "delivered", actor: "rider", code: "", recipientName: "Ada Obi" }).ok, true);
  assert.match(rules.checkTransition({ ...job, proofUrl: null }, { to: "delivered", actor: "rider", code: "", recipientName: "Ada Obi" }).error, /photo/, "the photo must be on the job");
  assert.match(rules.checkTransition(job, { to: "delivered", actor: "rider", code: "", recipientName: " " }).error, /who received it/);
  assert.match(rules.checkTransition(job, { to: "delivered", actor: "api", code: "", recipientName: "Ada Obi" }).error, /doesn't match/, "only riders, not API callers");
  assert.match(rules.checkTransition(job, { to: "delivered", actor: "rider", code: "1111" }).error, /doesn't match/);
  // Cash on delivery still needs the amount.
  assert.match(rules.checkTransition({ ...job, codAmount: 5000 }, { to: "delivered", actor: "rider", code: "", recipientName: "Ada Obi" }).error, /how much/);
  assert.match(read("src/app/api/mobile/logistics/rider/route.ts"), /recipientName: input\.recipientName \?\? null/);
  assert.match(read("src/app/rider/[token]/actions.ts"), /recipientName: typeof input\?\.recipientName === "string"/);

  const screen = app("app/rider/job.tsx");
  assert.match(screen, /if \(step === "dcode" && noCode\)/);
  assert.match(screen, /code: "", recipientName: recipient\.trim\(\)/);
  assert.match(screen, /const ready = photoDone && recipient\.trim\(\)\.length >= 2;/);
  // "Something wrong?" on the code step too.
  const dcode = screen.slice(screen.indexOf('if (step === "dcode") {'), screen.indexOf('  if (step === "cash") {'));
  assert.match(dcode, /\{helpLink\}/);
  for (const key of ["noCode.link", "noCode.title", "noCode.sub", "noCode.photo", "noCode.who", "noCode.useCode"]) assert.ok(hasKey("m_rider", key), key);
});

test("log in: a sign-up link and the rider sign-in, so riders aren't stuck", () => {
  const form = app("components/AuthForm.tsx");
  assert.match(form, /router\.push\("\/rider\/sign-in"\)/);
  assert.match(form, /t\("form\.signupLink"\)/);
  assert.ok(hasKey("m_auth", "form.signupLink") && hasKey("m_auth", "form.riderLink"));
});

test("rider 'Take this job' is honest: the company already gave it; starting opens the steps", () => {
  const today = app("app/rider/(tabs)/index.tsx");
  assert.match(today, /say\("startJob"\)/);
  assert.match(today, /say\("offer\.assigned", \{ company \}\)/);
  assert.doesNotMatch(today, /say\("take"\)/);
  assert.ok(hasKey("m_rider", "startJob") && hasKey("m_rider", "offer.assigned"));
});

// ─── Seller ───────────────────────────────────────────────────────────────────

test("wholesale is reachable from Orders, Find, a quote and its notification, and shows price requests", async () => {
  assert.match(app("app/(tabs)/orders.tsx"), /router\.push\("\/wholesale"\)/);
  assert.match(app("app/find/index.tsx"), /router\.push\("\/wholesale"\)/);
  assert.match(app("app/find/[slug].tsx"), /router\.push\("\/wholesale"\)/);
  assert.match(app("app/wholesale.tsx"), /\/api\/app\/supplier-quotes/);
  assert.match(read("src/lib/notifications/events.server.ts"), /\?quote=\$\{quote\.id\}/);
  const n = await import("../shared/notifications.ts");
  assert.deepEqual(n.appRouteFor("/marketplace/product/p1?quote=q1"), { pathname: "/wholesale" });
  assert.deepEqual(n.appRouteFor("/marketplace/wholesale"), { pathname: "/wholesale" });
  assert.match(app("lib/web.ts"), /"\/marketplace\/wholesale": "\/wholesale"/);
});

test("small dead controls work: brand arrow, channels, ad wizard, video save, tour text", () => {
  assert.match(app("app/onboarding/brand.tsx"), /accessibilityLabel=\{t\("brand\.tweakLabel"\)\} disabled=\{busy\} onPress=\{\(\) => void confirm\(\)\}/);
  assert.doesNotMatch(app("app/channels.tsx"), /t\("card\.soon"\)/, "no Coming soon button");
  const wizard = app("app/ads/new.tsx");
  assert.doesNotMatch(wizard, /title=\{t\("m\.use"\)\}[^\n]*router\.back\(\)/, "'Use these' doesn't just go back");
  assert.match(wizard, /<MetaCard meta=\{meta\} onChanged=\{data\.reload\} \/>/);
  assert.match(app("app/ads/index.tsx"), /import \{ MetaCard \} from "@\/components\/MetaAdsCard"/);
  const video = app("app/video/[id].tsx");
  assert.doesNotMatch(video, /openBrowserAsync/);
  assert.match(video, /saveFileToPhone\(url, /);
  assert.match(app("lib/familiar-share.ts"), /export async function saveFileToPhone/);
  assert.match(catalog("m_home", "en"), /"tour\.1\.body": "Tap \+ to make a post, add a product/);
  assert.match(app("components/CreateSheet.tsx"), /testID="create-post"/, "the sheet's first row is Make a post");
});
