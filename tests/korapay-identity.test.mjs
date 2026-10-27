// Korapay Identity: BVN/NIN answers read against what the person typed (src/lib/korapay-identity-rules.ts) and the
// CAC answer (src/lib/kyb/cac.ts). Pure helpers, plus where Korapay sits ahead of Youverify and Dojah.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kp = await import("../src/lib/korapay-identity-rules.ts");
const cac = await import("../src/lib/kyb/cac.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const typed = { firstName: "Bimbo", lastName: "Olakunle", dateOfBirth: "1988-04-04" };
const found = (data) => ({ status: true, message: "NIN verified successfully", data: { reference: "VR-1", id: "55555555555", id_type: "ng_nin", ...data } });

test("a NIN whose name and date of birth match passes every field (compared here, not from Korapay's flags)", () => {
  const body = found({
    first_name: "BIMBO",
    middle_name: "Doherty",
    last_name: "OLAKUNLE",
    date_of_birth: "1988-04-04",
    validation: { first_name: { value: "Bimbo", match: false }, last_name: { value: "Olakunle", match: false }, date_of_birth: { value: "1988-04-04", match: false } },
  });
  const result = kp.readKorapayIdentity(200, body, typed);
  assert.equal(result.ok, true);
  assert.deepEqual(result.identity.matches, { firstName: true, lastName: true, dateOfBirth: true });
  assert.equal(result.identity.reference, "VR-1");
  assert.deepEqual(kp.readKorapayIdentity(200, body, { ...typed, firstName: "Doherty" }).identity.matches.firstName, true, "a middle name may be typed as the first name");
});

test("a wrong name or date fails, and a field Korapay didn't return is never a pass", () => {
  const body = found({ first_name: "BIMBO", last_name: "OLAKUNLE", date_of_birth: "1988-04-04" });
  assert.equal(kp.readKorapayIdentity(200, body, { ...typed, lastName: "Olakunleh" }).identity.matches.lastName, false);
  assert.equal(kp.readKorapayIdentity(200, body, { ...typed, dateOfBirth: "1988-04-05" }).identity.matches.dateOfBirth, false);
  const bare = kp.readKorapayIdentity(200, found({ first_name: "BIMBO", last_name: "OLAKUNLE" }), typed);
  assert.equal(bare.identity.matches.dateOfBirth, null);
});

test("an unknown number is 'not found'; key, access and balance problems never count against the person", () => {
  assert.deepEqual(kp.readKorapayIdentity(404, { status: false, message: "NIN not found" }, typed), { ok: false, notFound: true, message: "NIN not found" });
  assert.equal(kp.readKorapayIdentity(400, { status: false, message: "Invalid NIN" }, typed).notFound, true);
  assert.equal(kp.readKorapayIdentity(401, { status: false, message: "Invalid authorization key" }, typed).notFound, false);
  assert.equal(kp.readKorapayIdentity(403, { status: false, message: "Identity is not enabled for this merchant" }, typed).notFound, false);
  assert.equal(kp.readKorapayIdentity(400, { status: false, message: "Insufficient balance to perform verification" }, typed).notFound, false);
  assert.equal(kp.readKorapayIdentity(402, { status: false, message: "Payment required" }, typed).notFound, false);
  assert.equal(kp.readKorapayIdentity(500, null, typed).notFound, false);
  assert.equal(kp.readKorapayIdentity(200, { status: false, message: "failed" }, typed).ok, false);
});

test("Korapay's CAC answer becomes a record: active key personnel only, one name line each", () => {
  const record = cac.parseKorapayCac({
    status: true,
    data: {
      id: "RC00000011",
      name: "John Doe Inc",
      registration_number: "RC00000000",
      registration_date: "2017-06-09T00:00:00.000+00:00",
      type_of_entity: "PRIVATE COMPANY LIMITED BY SHARES",
      address: "1ST FLOOR,SUM HOUSE,Fake Street",
      company_status: "ACTIVE",
      key_personnel: [
        { name: "PETER DOE", designation: "WITNESS", status: "ACTIVE" },
        { name: "MICHAEL DOE", designation: "DIRECTOR", status: "ACTIVE" },
        { name: "OLD DIRECTOR", designation: "DIRECTOR", status: "RESIGNED" },
      ],
    },
  });
  assert.equal(record.companyName, "John Doe Inc");
  assert.equal(record.rcNumber, "RC00000000");
  assert.equal(record.registeredAt, "2017-06-09");
  assert.deepEqual(record.affiliates.map((person) => person.fullName), ["PETER DOE", "MICHAEL DOE"]);
  const evaluation = cac.evaluateCac(record, { enteredName: "John Doe Inc.", ownerName: "Michael Doe" });
  assert.equal(evaluation.outcome, "verified");
  assert.equal(cac.evaluateCac(record, { enteredName: "John Doe Inc", ownerName: "Peter Doe" }).outcome, "needs_review", "a witness isn't the owner");
  assert.equal(cac.parseKorapayCac({ status: true, data: {} }), null);
  assert.equal(cac.parseKorapayCac(null), null);
});

test("Korapay runs ID and CAC checks when its key is set, ahead of Youverify and Dojah, with the key kept on the server", () => {
  const server = read("src/lib/kyb/verify-cac.server.ts");
  assert.match(server, /\["korapay", korapayIdentityReady\(\), lookupKorapayCac\],\s*\["cac", Boolean\(cacVasKey\(\)\), lookupCacVas\],\s*\["youverify", youverifyReady\(\), lookupYouverifyCac\],\s*\["dojah", dojahReady\(\), lookupCac\]/, "Korapay, then CAC, then Youverify, then Dojah");
  assert.match(server, /if \(lookup\.ok \|\| lookup\.reason === "busy"\) break;/, "an unavailable provider hands over to the next");
  assert.match(server, /"\/identities\/ng\/cac"/);
  const client = read("src/lib/korapay.ts");
  assert.match(client, /^import "server-only";/);
  assert.match(client, /readKorapayIdentity\(httpStatus, json, input\)/);
});

test("NIN with a selfie: Korapay's facial match is read from data.validation.selfie", () => {
  const typed = { firstName: "Ada", lastName: "Obi", dateOfBirth: "1990-01-02" };
  const answer = (selfie) => ({ status: true, message: "ok", data: { reference: "r1", first_name: "ADA", last_name: "OBI", date_of_birth: "1990-01-02", validation: { selfie } } });
  assert.deepEqual(kp.readKorapayIdentity(200, answer({ value: "data:…", match: true, confidence_rating: 94 }), typed).identity.selfie, { match: true, confidence: 94 });
  assert.deepEqual(kp.readKorapayIdentity(200, answer({ match: false, confidence_rating: "12" }), typed).identity.selfie, { match: false, confidence: 12 });
  assert.equal(kp.readKorapayIdentity(200, { status: true, data: { first_name: "ADA", last_name: "OBI" } }, typed).identity.selfie, undefined, "no selfie sent, no result");
});
