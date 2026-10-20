// Youverify ID and business checks: the pure parts (src/lib/youverify-rules.ts, src/lib/kyb/cac.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const yv = await import("../src/lib/youverify-rules.ts");
const cac = await import("../src/lib/kyb/cac.ts");
const docs = await import("../shared/verification-docs.ts");

const typed = { firstName: "Sarah", lastName: "Doe", dateOfBirth: "1988-04-04" };
const found = (data) => ({ success: true, statusCode: 200, message: "success", data: { id: "yv1", status: "found", ...data } });

test("a NIN whose name and date of birth match passes every field", () => {
  const result = yv.readYouverifyIdentity(200, found({ firstName: "SARAH", middleName: "Jane", lastName: "DOE", dateOfBirth: "1988-04-04" }), typed);
  assert.equal(result.ok, true);
  assert.deepEqual(result.identity.matches, { firstName: true, lastName: true, dateOfBirth: true });
  assert.equal(result.identity.reference, "yv1");
});

test("names are compared word by word: a middle name may be typed as the first name, a near miss never passes", () => {
  const record = found({ firstName: "Sarah", middleName: "Jane", lastName: "Doe", dateOfBirth: "04-04-1988" });
  assert.equal(yv.readYouverifyIdentity(200, record, { ...typed, firstName: "Jane" }).identity.matches.firstName, true);
  assert.equal(yv.readYouverifyIdentity(200, record, { ...typed, firstName: "Sara" }).identity.matches.firstName, false);
  assert.equal(yv.readYouverifyIdentity(200, record, { ...typed, lastName: "Does" }).identity.matches.lastName, false);
  assert.equal(yv.readYouverifyIdentity(200, record, typed).identity.matches.dateOfBirth, true, "DD-MM-YYYY is read too");
  assert.equal(yv.readYouverifyIdentity(200, record, { ...typed, dateOfBirth: "1988-04-05" }).identity.matches.dateOfBirth, false);
});

test("a field Youverify didn't return is unconfirmed (null), never a pass: BVN answers carry no date of birth", () => {
  const result = yv.readYouverifyIdentity(200, found({ firstName: "John", middleName: null, lastName: "Doe" }), { firstName: "John", lastName: "Doe", dateOfBirth: "1990-01-01" });
  assert.deepEqual(result.identity.matches, { firstName: true, lastName: true, dateOfBirth: null });
});

test("not found, pending and refused answers", () => {
  assert.deepEqual(yv.readYouverifyIdentity(404, { success: false, statusCode: 404, name: "ResourceNotFoundError", message: "Not found" }, typed), { ok: false, notFound: true, message: "Not found" });
  assert.equal(yv.readYouverifyIdentity(200, found({ status: "not_found" }), typed).notFound, true);
  assert.equal(yv.readYouverifyIdentity(200, found({ status: "pending" }), typed).pending, true);
  const noBalance = yv.readYouverifyIdentity(402, { success: false, statusCode: 402, name: "PaymentRequiredError", message: "Insufficient fund" }, typed);
  assert.equal(noBalance.ok, false);
  assert.equal(noBalance.notFound, false, "our balance running out is not the person's mistake");
});

test("Youverify's business profile becomes a CAC record; witnesses, secretaries and former directors don't count as owners", () => {
  const record = cac.parseYouverifyCac({
    success: true,
    data: {
      status: "found",
      name: "Ada Fabrics Limited",
      registrationNumber: "RC1234567",
      companyStatus: "ACTIVE",
      typeOfEntity: "PRIVATE COMPANY LIMITED BY SHARES",
      registrationDate: "2017-06-09T01:00:00.000+01:00",
      address: { addressLine: "12 Broad Street", city: "Lagos Island", state: "Lagos" },
      keyPersonnel: [
        { name: "OKAFOR ADA NGOZI", designation: "DIRECTOR", status: "ACTIVE" },
        { name: "BELLO MUSA", designation: "WITNESS", status: "ACTIVE" },
        { name: "EZE CHIOMA", designation: "SECRETARY_COMPANY", status: "ACTIVE" },
        { name: "OBI PETER", designation: "DIRECTOR", status: "RESIGNED" },
      ],
    },
  });
  assert.equal(record.companyName, "Ada Fabrics Limited");
  assert.equal(record.registeredAt, "2017-06-09");
  assert.equal(record.address, "12 Broad Street, Lagos Island, Lagos");
  assert.equal(record.affiliates.length, 3, "the resigned director is dropped");
  assert.equal(cac.evaluateCac(record, { enteredName: "Ada Fabrics Ltd", ownerName: "Ada Okafor" }).outcome, "verified");
  assert.equal(cac.evaluateCac(record, { enteredName: "Ada Fabrics Ltd", ownerName: "Musa Bello" }).outcome, "needs_review", "a witness isn't the owner");
  assert.equal(cac.evaluateCac(record, { enteredName: "Ada Fabrics Ltd", ownerName: "Peter Obi" }).outcome, "needs_review");
  assert.equal(cac.parseYouverifyCac({ success: true, data: { status: "not_found" } }), null);
  assert.equal(cac.prefixedCacNumber("3456789", "BUSINESS_NAME"), "BN3456789");
  assert.equal(cac.prefixedCacNumber("1234567", "COMPANY"), "RC1234567");
});

test("a passed Wallet ID check stands in for the ID document upload", () => {
  const [doc] = docs.normalizeVerificationDocs([{ id: "i1", type: "identity", status: "approved", idCheck: { source: "wallet", idType: "nin", idLast4: "8901", name: "Ada Okafor", checkedAt: "2026-10-18T10:00:00.000Z" } }]);
  assert.equal(doc.idCheck.idLast4, "8901");
  assert.equal(docs.isDocComplete(doc), true);
  const [bare] = docs.normalizeVerificationDocs([{ id: "i2", type: "identity", status: "approved" }]);
  assert.equal(docs.isDocComplete(bare), false, "no file and no ID check is not evidence");
});

test("the Wallet falls back to Youverify when Korapay isn't set up, sends the key as a token header, and keeps it on the server", () => {
  const client = readFileSync(new URL("../src/lib/youverify.ts", import.meta.url), "utf8");
  assert.match(client, /^import "server-only";/);
  assert.match(client, /headers: \{ token: key/);
  assert.doesNotMatch(client, /Authorization:/);
});
