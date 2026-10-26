// Registering a business name with CAC (shared/business-registration.ts, src/lib/business-registration): the form
// rules, CAC's answers read, and the wiring that keeps filing behind a verified payment.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const br = await import("../shared/business-registration.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const good = {
  proposedName: "Ada Fabrics Ventures",
  lineOfBusiness: "Fashion Design",
  businessCommencementDate: "2024-01-21",
  companyEmail: "ada@example.com",
  companyStreetNumber: "41",
  companyAddress: "Allen Avenue",
  companyCity: "Ikeja",
  companyState: "Lagos",
  proprietorFirstname: "Ada",
  proprietorSurname: "Obi",
  proprietorOthername: "",
  proprietorGender: "female",
  proprietorDob: "1990-01-21",
  proprietorNationality: "Nigerian",
  proprietorEmail: "ada@example.com",
  proprietorPhonenumber: "0803 123 4567",
  proprietorStreetNumber: "12",
  proprietorServiceAddress: "Opebi Road",
  proprietorCity: "Ikeja",
  proprietorLga: "Ikeja",
  proprietorState: "Lagos",
  proprietorPostcode: "100001",
};
const now = new Date("2026-10-19T12:00:00Z");

test("a complete form passes; gender and phone are tidied the way CAC wants them", () => {
  const form = br.cleanRegistrationForm(good);
  assert.equal(form.proprietorGender, "FEMALE");
  assert.equal(form.proprietorPhonenumber, "08031234567");
  assert.deepEqual(br.registrationFormProblems(form, now), {});
});

test("the form catches what CAC would query: one-word names, under-18s, bad phones, future start dates", () => {
  const form = br.cleanRegistrationForm({ ...good, proposedName: "Ada", proprietorDob: "2012-05-01", proprietorPhonenumber: "12345", businessCommencementDate: "2027-01-01", proprietorPostcode: "1001", companyCity: "" });
  const problems = br.registrationFormProblems(form, now);
  assert.match(problems.proposedName, /two words/);
  assert.match(problems.proprietorDob, /18/);
  assert.match(problems.proprietorPhonenumber, /Nigerian phone/);
  assert.match(problems.businessCommencementDate, /future/);
  assert.match(problems.proprietorPostcode, /6 digits/);
  assert.equal(problems.companyCity, "Required");
  assert.equal(problems.proprietorOthername, undefined, "other name is optional");
});

test("the payload uses CAC's field names: the name is proposedOption1, files ride along as data URLs", () => {
  const payload = br.registrationPayload(br.cleanRegistrationForm(good), { passport: "data:image/jpeg;base64,AA", signature: "data:image/png;base64,BB", meansOfId: "data:image/jpeg;base64,CC" });
  assert.equal(payload.proposedOption1, "Ada Fabrics Ventures");
  assert.equal(payload.proposedName, undefined);
  assert.equal(payload.passport, "data:image/jpeg;base64,AA");
  assert.equal(payload.proprietorGender, "FEMALE");
});

test("CAC's name check: proceed, or the advice and suggestions it gives", () => {
  const ok = br.readNameCheck({ statusCode: 200, data: { message: "PROCEED_TO_FILING", data: { recommendedActions: [{ message: "Proceed to filing" }], mostSimilarName: "Muhdsani Venture Ventures", similarityScorePercentage: 10, complianceScorePercentage: 100, success: true } } });
  assert.equal(ok.canProceed, true);
  assert.equal(ok.complianceScore, 100);
  assert.deepEqual(ok.advice, [], "\"Proceed to filing\" isn't advice");
  const no = br.readNameCheck({ data: { message: "NAME_NOT_AVAILABLE", data: { recommendedActions: [{ message: "Add a qualifier like Ventures" }], suggestedNames: ["Ada Fabrics Concepts"], success: false } } });
  assert.equal(no.canProceed, false);
  assert.deepEqual(no.advice, ["Add a qualifier like Ventures"]);
  assert.deepEqual(no.suggestions, ["Ada Fabrics Concepts"]);
  assert.equal(br.readNameCheck(null), null);
});

test("CAC's pre-check problems map back to our field names", () => {
  const problems = br.readPreCheck({ data: { proposedOption1: ["proposed name contains prohibited/restricted words - travel"], proprietorEmail: ["invalid email address passed"] } });
  assert.deepEqual(problems, { proposedName: ["proposed name contains prohibited/restricted words - travel"], proprietorEmail: ["invalid email address passed"] });
  assert.deepEqual(br.readPreCheck({ data: null }), {});
});

test("CAC's status: pending, queried with its reasons, approved with the BN number", () => {
  assert.equal(br.readRegistrationStatus({ data: { status: "pending", data: { rcNumber: null, entityName: "TestFriday Ventures" } } }).status, "pending");
  const queried = br.readRegistrationStatus({ data: { status: "queried", queries: [{ reason: "proposedOption1", comment: "Proposed name cannot be a single word", date: "2026-09-17T16:22:58.727+00:00" }] } });
  assert.equal(queried.status, "queried");
  assert.deepEqual(queried.queries, [{ field: "proposedOption1", comment: "Proposed name cannot be a single word", date: "2026-09-17T16:22:58.727+00:00" }]);
  assert.equal(br.queryFieldLabel("proposedOption1"), "Business name");
  const approved = br.readRegistrationStatus({ data: { status: "approved", data: { rcNumber: 9397486, entityName: "Ada Fabrics Ventures" } } });
  assert.equal(approved.status, "approved");
  assert.equal(approved.rcNumber, "9397486");
});

test("CAC is only asked to file after a verified payment, by one caller, and a refusal is refunded", () => {
  const service = read("src/lib/business-registration/service.server.ts");
  assert.match(service, /^import "server-only";/);
  assert.match(service, /updateMany\(\{ where: \{ id: row\.id, status: "paid" \}, data: \{ status: "submitting" \} \}\)/, "one caller files");
  assert.match(service, /verified\.amount !== row\.amountNgn \* 100/);
  assert.match(service, /metadata\.registration_id !== row\.id/);
  assert.match(service, /refundPaystackTransaction\(row\.reference\)/);
  assert.match(service, /await removeFiles\(row\)/, "pictures are deleted once CAC approves");
  assert.match(service, /approveCacDocFromRegistration\(row\.role/, "a supplier's or partner's CAC document is approved");
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /ref\.startsWith\(REGISTRATION_REFERENCE_PREFIX\)/);
  assert.match(read("src/app/api/cron/business-registrations/route.ts"), /const denied = await cronDenied\(req\);/);
  assert.match(read("scripts/qstash-schedules.mjs"), /\/api\/cron\/business-registrations/);
  for (const route of ["src/app/api/business-registration/route.ts", "src/app/api/business-registration/name-check/route.ts", "src/app/api/business-registration/[id]/answer/route.ts", "src/app/api/business-registration/[id]/refresh/route.ts"]) {
    assert.match(read(route), /registrationOwner\(\)/, `${route} is for the signed-in owner`);
  }
  assert.match(read("src/app/api/business-registration/[id]/certificate/route.ts"), /registrationCertificate\(user\.id, id\)/, "only your own certificate");
  assert.doesNotMatch(read("src/components/business-registration/RegisterBusiness.tsx"), /CAC_VAS|X_API_KEY/);
  assert.match(read("prisma/schema.prisma"), /model BusinessRegistration \{/);
  assert.match(read("docs/migrations/2026-11-12-business-registration.sql"), /CREATE TABLE IF NOT EXISTS "BusinessRegistration"/);
});

test("money safety: no second filing, refunds only for CAC's own refusal, mismatched charges refunded, one answer at a time", () => {
  const service = read("src/lib/business-registration/service.server.ts");
  assert.match(service, /No answer: CAC may have it\. Never send it again on our own/);
  assert.doesNotMatch(service, /status: "submitting", updatedAt/, "the cron never refiles a filing that got no answer");
  assert.match(service, /if \(status === 400 \|\| status === 422\) \{/, "only CAC's validation refusal is refunded");
  assert.match(service, /refundRegistration\(row\.id, `We couldn't use this payment: \$\{mismatch\}\.`, \["pending_payment", "payment_failed"\]\)/);
  assert.match(service, /updateMany\(\{ where: \{ id: row\.id, status: "queried" \}, data: \{ status: "answering" \} \}\)/);
  assert.match(service, /proposedName: \{ equals: form\.proposedName, mode: "insensitive" \}/, "one application per name");
  assert.match(service, /const stale = row\.status === "submitted" && row\.answeredAt/, "an answered query isn't put back by a late status read");
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /completeRegistrationPayment\(ref, \{ fileNow: false \}\)/, "the webhook answers Paystack quickly");
  const callback = read("src/app/api/billing/business-registration/callback/route.ts");
  assert.match(callback, /row\.status === "refunded" \|\| row\.status === "refund_failed"/, "a charged person is never told nothing was charged");
});

test("the name check falls back to CAC's free check, tells the team when the account is refused, and reads both answer shapes", () => {
  const service = read("src/lib/business-registration/service.server.ts");
  assert.match(service, /if \(answer\.status === 403 \|\| answer\.status === 402\) \{[\s\S]*?bn-compliance", \{ body/, "falls back to the free basic check");
  assert.match(service, /title: "CAC VAS refused a business name check"/);
  // Documented nesting, and a single level.
  assert.equal(br.readNameCheck({ data: { message: "PROCEED_TO_FILING", data: { success: true } } }).canProceed, true);
  assert.equal(br.readNameCheck({ data: { recommendedActions: [{ message: "Proceed to filing" }], complianceScorePercentage: 100, success: true } }).canProceed, true);
});

test("registration is never priced below what CAC charges, and CAC's webhook only triggers a status read", async () => {
  const pricing = await import("../shared/platform-pricing.ts");
  const setting = pricing.PRICE_SETTINGS["business.bn_registration"];
  assert.ok(setting.min >= 27_500 && setting.default >= setting.min, "CAC takes ₦27,000 per filing");
  const hook = read("src/app/api/webhooks/cac-vas/route.ts");
  assert.match(hook, /await refreshRegistration\(row\)/, "the status always comes from CAC's API, never the payload");
  assert.doesNotMatch(hook, /status: "approved"/);
});

test("CAC registration stays hidden until an admin switches it on in Admin › Launches", () => {
  const service = read("src/lib/business-registration/service.server.ts");
  assert.match(service, /export async function registrationEnabled\(userId\?: string \| null\)[\s\S]*?registrationOpenFor\(userId\)/, "enabled needs the launch switch (or a tester account)");
  assert.match(service, /checkBusinessName[\s\S]*?if \(!\(await registrationEnabled\(userId\)\)\)/, "name checks are off too");
  for (const page of ["home", "supplier", "logistics"]) {
    assert.match(read(`src/app/${page}/register-business/page.tsx`), /hideRegistrationPageWhenOff\(data,/, `${page} page hides itself`);
  }
  assert.match(read("src/app/home/wallet/page.tsx"), /registrationOpen \?/, "wallet link only when open");
  assert.match(read("src/components/verification/CacInstantCheck.tsx"), /registrationOpen \?/, "verification link only when open");
  const launch = read("src/lib/business-registration/launch.server.ts");
  assert.match(launch, /launch\.live \|\| Boolean\(userId && launch\.testers\.includes\(userId\)\)/, "testers only see it before launch");
  assert.match(launch, /testers: before\.testers/, "switching it on or off keeps the testers");
  assert.match(launch, /!before\.announcementId && input\.announce !== false/, "the announcement goes out once");
  assert.match(launch, /audience: \[\.\.\.ALL_NEWS_AUDIENCES\]/, "to sellers, suppliers and delivery partners");
  assert.match(launch, /ctaUrl: `\$\{appUrl\}\/register-business`/);
  assert.ok(existsSync(new URL("../src/app/register-business/page.tsx", import.meta.url)), "the email's link resolves by role");
  assert.match(read("src/app/api/admin/launches/route.ts"), /withAdmin/);
});
