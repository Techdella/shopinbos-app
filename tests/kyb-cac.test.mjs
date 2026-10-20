// Instant CAC check (src/lib/kyb/cac.ts) and how a registry match counts as the CAC document
// (shared/verification-docs.ts). Pure helpers only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cac = await import("../src/lib/kyb/cac.ts");
const docs = await import("../shared/verification-docs.ts");

test("BN/RC numbers are read with or without prefixes, and the prefix suggests the type", () => {
  assert.deepEqual(cac.parseCacNumber("RC 1234567"), { number: "1234567", impliedType: "COMPANY" });
  assert.deepEqual(cac.parseCacNumber("rc-1234567"), { number: "1234567", impliedType: "COMPANY" });
  assert.deepEqual(cac.parseCacNumber("BN3456789"), { number: "3456789", impliedType: "BUSINESS_NAME" });
  assert.deepEqual(cac.parseCacNumber("IT 12345"), { number: "12345", impliedType: "INCORPORATED_TRUSTEES" });
  assert.deepEqual(cac.parseCacNumber("LLP 0012"), { number: "0012", impliedType: "LIMITED_LIABILITY_PARTNERSHIP" });
  assert.deepEqual(cac.parseCacNumber(" 1261103 "), { number: "1261103", impliedType: null });
  assert.equal(cac.parseCacNumber("RC"), null);
  assert.equal(cac.parseCacNumber("123"), null, "too short");
  assert.equal(cac.parseCacNumber("RC 12a4567"), null);
  assert.equal(cac.parseCacNumber("12345678901"), null, "too long");
});

test("business names match despite suffixes, punctuation, case and word order", () => {
  assert.ok(cac.companyNamesMatch("Adaeze Fabrics Ltd.", "ADAEZE FABRICS LIMITED"));
  assert.ok(cac.companyNamesMatch("Ade & Sons Nig. Ltd", "ADE AND SONS NIGERIA LIMITED"));
  assert.ok(cac.companyNamesMatch("Fabrics Adaeze", "ADAEZE FABRICS LIMITED"));
  assert.ok(cac.companyNamesMatch("kola ventures", "KOLA VENTURES"));
  assert.ok(!cac.companyNamesMatch("Adaeze Fabrics", "ADAEZE TEXTILES LIMITED"));
  assert.ok(!cac.companyNamesMatch("Adaeze", "ADAEZE FABRICS LIMITED"), "a partial name is not enough");
  assert.ok(!cac.companyNamesMatch("Limited", "LIMITED"), "nothing left after suffixes");
  assert.ok(!cac.companyNamesMatch("", "ADAEZE"));
});

test("the account holder must be on the record by first and last name", () => {
  const people = [
    { firstName: "JOHN", lastName: "MUSA", role: "PROPRIETOR" },
    { firstName: "NGOZI ADA", lastName: "OKAFOR", role: "DIRECTOR" },
  ];
  assert.ok(cac.ownerListed("John Musa", people));
  assert.ok(cac.ownerListed("musa john", people), "any order");
  assert.ok(cac.ownerListed("Ada Okafor", people), "one of several first names");
  assert.ok(cac.ownerListed("Ngozi Okafor-Bello", people), "hyphenated surnames");
  assert.ok(!cac.ownerListed("John Okafor", [people[0]]));
  assert.ok(!cac.ownerListed("Musa", people), "one word is not enough");
  assert.ok(!cac.ownerListed("Jane Doe", people));
  assert.ok(!cac.ownerListed("John Musa", []));
});

test("Dojah's answer is read, and only name + owner + active counts as verified", () => {
  const body = {
    entity: {
      company_name: "JOHN DOE LIMITED",
      rc_number: "1234567",
      status: "ACTIVE",
      type_of_company: "COMPANY",
      address: "1 Marina, Lagos",
      date_of_registration: "2024-07-19T08:00:06.224+00:00",
      affiliates: [{ first_name: "JOHN", last_name: "DOE", affiliate_type: "DIRECTOR" }, null, { first_name: "", last_name: "" }],
    },
  };
  const record = cac.parseDojahCac(body);
  assert.equal(record.companyName, "JOHN DOE LIMITED");
  assert.equal(record.affiliates.length, 1);
  assert.equal(record.address, "1 Marina, Lagos");
  assert.equal(cac.parseDojahCac({}), null);
  assert.equal(cac.parseDojahCac({ entity: { company_name: "" } }), null);
  assert.equal(cac.parseDojahCac(null), null);

  assert.equal(cac.evaluateCac(record, { enteredName: "John Doe Ltd", ownerName: "John Doe" }).outcome, "verified");
  assert.equal(cac.evaluateCac(record, { enteredName: "John Doe Ltd", ownerName: "Jane Smith" }).outcome, "needs_review");
  assert.equal(cac.evaluateCac({ ...record, status: "Not Active" }, { enteredName: "John Doe Ltd", ownerName: "John Doe" }).outcome, "needs_review");
  assert.equal(cac.evaluateCac(record, { enteredName: "Other Biz", ownerName: "John Doe" }).outcome, "name_mismatch");
  assert.equal(cac.evaluateCac(null, { enteredName: "John Doe Ltd", ownerName: "John Doe" }).outcome, "not_found");
  assert.ok(!cac.registryStatusActive("Not Active"));
  assert.ok(cac.registryStatusActive(" active "));
});

test("the daily attempt counter only keeps the last 24 hours", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const kept = cac.recentAttempts(["2026-10-12T11:00:00Z", "2026-10-11T11:59:00Z", "nonsense", 5], now);
  assert.deepEqual(kept, ["2026-10-12T11:00:00Z"]);
  assert.deepEqual(cac.recentAttempts(undefined, now), []);
});

test("a verified registry check counts as the CAC document without a file; an unverified one does not", () => {
  const registry = {
    source: "cac", provider: "dojah", rcNumber: "1234567", companyType: "COMPANY", enteredName: "John Doe Ltd",
    registeredName: "JOHN DOE LIMITED", registryStatus: "ACTIVE", nameMatched: true, ownerMatched: true, verified: true,
    checkedAt: "2026-10-12T12:00:00Z",
  };
  const base = { id: "cac-1", type: "cac", label: "CAC", fileName: "", filePath: "", fileSize: 0, mimeType: "", uploadedAt: "", updatedAt: "" };
  const [verified] = docs.normalizeVerificationDocs([{ ...base, status: "approved", registry }]);
  assert.equal(verified.registry.verified, true, "registry survives normalising");
  assert.ok(docs.isDocComplete(verified));
  assert.equal(docs.docDisplayState(verified), "approved");
  assert.equal(docs.docStatusLabel(verified, "owner", true), "Verified with CAC");
  assert.deepEqual(docs.missingRequiredDocs([{ type: "cac", label: "CAC", required: true, hint: "" }], [verified]), []);

  const [review] = docs.normalizeVerificationDocs([{ ...base, status: "draft", registry: { ...registry, ownerMatched: false, verified: false } }]);
  assert.ok(!docs.isDocComplete(review), "needs the certificate");
  assert.equal(docs.missingRequiredDocs([{ type: "cac", label: "CAC", required: true, hint: "" }], [review]).length, 1);

  assert.equal(docs.normalizeVerificationDocs([{ ...base, status: "approved", registry: { source: "other" } }])[0].registry, undefined, "junk registry is dropped");
});

test("CAC check routes are role-gated, the provider key stays server-side, and the formats are spelled out", () => {
  for (const [file, guard] of [["src/app/api/supplier/verification/cac/route.ts", "withSupplier"], ["src/app/api/logistics/verification/cac/route.ts", "withLogistics"]]) {
    const src = readFileSync(file, "utf8");
    assert.match(src, new RegExp(`export const POST = ${guard}\\(`));
    assert.match(src, new RegExp(`export const GET = ${guard}\\(`));
  }
  const server = readFileSync("src/lib/kyb/verify-cac.server.ts", "utf8");
  assert.match(server, /import "server-only"/);
  assert.match(server, /CAC_DAILY_ATTEMPTS/, "daily limit is enforced");
  const client = readFileSync("src/components/verification/CacInstantCheck.tsx", "utf8");
  assert.doesNotMatch(client, /DOJAH/, "no provider secrets in the browser component");
  assert.equal(docs.DOC_FORMATS_LABEL, "PDF, JPG, PNG or WebP, up to 10 MB");
  assert.deepEqual([...docs.DOC_MIME_TYPES], ["application/pdf", "image/jpeg", "image/png", "image/webp"]);
});

test("CAC's own VAS answer becomes a record: people's names in two parts, roles joined, dates read", () => {
  const record = cac.parseCacVas({
    statusCode: 200,
    success: true,
    data: {
      rc_number: "80569782",
      entity_name: "MyTest Ventures",
      entity_type: "BUSINESS_NAME",
      registration_date: "Thu Jul 02 13:50:56 GMT 2026",
      address: "Apt. 855 West Ports",
      entity_status: "ACTIVE",
      affiliates: [
        { first_name: "Edwardo", surname: "Jacobson", affiliation_type: ["DIRECTOR"], status: "" },
        { first_name: "Old", surname: "Partner", affiliation_type: ["PROPRIETOR"], status: "RESIGNED" },
        { first_name: "Cody", surname: "Hodkiewicz", affiliation_type: ["WITNESS"], status: "ACTIVE" },
      ],
    },
  });
  assert.equal(record.companyName, "MyTest Ventures");
  assert.equal(record.rcNumber, "80569782");
  assert.equal(record.registeredAt, "2026-07-02");
  assert.deepEqual(record.affiliates.map((a) => `${a.firstName} ${a.lastName}: ${a.role}`), ["Edwardo Jacobson: DIRECTOR", "Cody Hodkiewicz: WITNESS"]);
  assert.equal(cac.evaluateCac(record, { enteredName: "MyTest Ventures", ownerName: "Edwardo Jacobson" }).outcome, "verified");
  assert.equal(cac.evaluateCac(record, { enteredName: "MyTest Ventures", ownerName: "Cody Hodkiewicz" }).outcome, "needs_review", "a witness isn't the owner");
  assert.equal(cac.parseCacVas({ statusCode: 400, success: false, error: "company not found" }), null);
  assert.equal(cac.cacVasEntityType("INCORPORATED_TRUSTEES"), "INCORPORATED_TRUSTEE");
  assert.equal(cac.cacVasEntityType("BUSINESS_NAME"), "BUSINESS_NAME");
});

test("the CAC registry's own API goes first when its key is set, with the key kept on the server", () => {
  const server = readFileSync("src/lib/kyb/verify-cac.server.ts", "utf8");
  assert.match(server, /\["cac", Boolean\(cacVasKey\(\)\), lookupCacVas\],\s*\["korapay"/);
  const vas = readFileSync("src/lib/cac-vas.server.ts", "utf8");
  assert.match(vas, /^import "server-only";/);
  assert.match(vas, /headers: \{ X_API_KEY: key/);
  assert.match(vas, /vasapp\.cac\.gov\.ng/);
  assert.doesNotMatch(readFileSync("src/components/verification/CacInstantCheck.tsx", "utf8"), /CAC_VAS/);
});

test("the CAC check never silently greys out: it says what's missing and asks for the type instead of guessing", () => {
  const client = readFileSync("src/components/verification/CacInstantCheck.tsx", "utf8");
  assert.match(client, /const canCheck = !missing && !busy;/, "the type isn't needed to press the button");
  assert.match(client, /if \(!effectiveType\) \{\s*setResult\(\{ tone: "error", text: t\("cac\.needType"\) \}\);/);
  assert.match(client, /\{missing && \(name \|\| number\) \?/, "what's missing shows under the button");
  const admin = readFileSync("src/app/admin/wallets/page.tsx", "utf8");
  assert.match(admin, /<CacChecksStatus providers=\{cacProviders\(\)\} \/>/, "the team sees which CAC lookups are on");
});
