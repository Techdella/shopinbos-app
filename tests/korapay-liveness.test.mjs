// Kora face check: the server's reading of Kora's answer (src/lib/korapay-liveness.ts) and the wiring that makes sure
// the phone's own "success" is never trusted, the NIN is the verified one and consent comes first.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const { readKorapayFaceCheck, safeKoraReference } = await import("../src/lib/korapay-liveness.ts");

const ok = (data) => readKorapayFaceCheck(200, { status: true, message: "ok", data });

const done = (verification, extra = {}) => ok({ reference: "LC-1", status: "passed", workflow_status: "completed", verification, ...extra });

test("passed only on Kora's own rule: liveness passed, workflow completed, result valid (and no selfie mismatch)", () => {
  assert.equal(done({ status: "found", result: "valid", validation: { selfie: { match: true } } }).outcome, "passed");
  assert.equal(done({ status: "found", result: "valid" }).outcome, "passed");
  assert.equal(ok({ reference: "LC-1", status: "passed", workflow_status: "processing_face_match" }).outcome, "review", "still running");
  assert.equal(ok({ reference: "LC-1", status: "passed" }).outcome, "review", "no face match yet");
  assert.equal(ok({ status: "found", result: "valid" }).outcome, "review", "an ID lookup alone isn't a face check");
});

test("a clear no is failed; errors and unknown shapes go to review, never a pass", () => {
  assert.equal(done({ status: "found", result: "valid", validation: { selfie: { match: false } } }).outcome, "failed");
  assert.equal(done({ status: "found", result: "invalid" }).outcome, "failed");
  assert.equal(done({ status: "not_found" }).outcome, "failed");
  assert.equal(ok({ status: "failed" }).outcome, "failed");
  assert.equal(ok({ status: "passed", workflow_status: "failed" }).outcome, "failed");
  assert.equal(readKorapayFaceCheck(404, { status: false, message: "not found" }).outcome, "failed");
  assert.equal(readKorapayFaceCheck(500, null).outcome, "review");
  assert.equal(readKorapayFaceCheck(200, { status: false, message: "Identity not enabled" }).outcome, "review");
  assert.equal(done({ id: "555-5555-5555", status: "found", result: "valid" }).idNumber, "55555555555");
});

test("references from the phone are short tokens only", () => {
  assert.equal(safeKoraReference(" LC-abc123 "), "LC-abc123");
  assert.equal(safeKoraReference("../balances"), null);
  assert.equal(safeKoraReference(42), null);
});

test("wiring: consent first, same NIN, server confirms with Kora, one reference per wallet", () => {
  const identity = read("src/lib/wallet/identity.server.ts");
  assert.match(identity, /input\.consent !== true/);
  assert.match(identity, /kycIdHash !== idHash\(nin\)/);
  assert.match(identity, /fetchKorapayFaceCheck\(reference\)/);
  assert.match(identity, /kycFaceReference: reference, NOT: \{ id: wallet\.id \}/);
  assert.match(read("src/lib/korapay.ts"), /\/identities\/verifications\//);
  assert.match(read("prisma/schema.prisma"), /kycFaceStatus/);
  assert.match(read("docs/migrations/2026-12-02-kora-face-check.sql"), /"kycFaceStatus"/);
});
