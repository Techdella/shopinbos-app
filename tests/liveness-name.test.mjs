import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { livenessUser, livenessNamePart } = await import("../shared/liveness-name.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("liveness names carry no digits or symbols (Korapay refuses \"unsafe characters\")", () => {
  assert.deepEqual(livenessUser("qa", "partner2+20261028", "Partner"), { firstName: "qa", lastName: "partner" });
  assert.deepEqual(livenessUser("Adaeze", "Okafor-Eze", "Partner"), { firstName: "Adaeze", lastName: "Okafor-Eze" });
  assert.deepEqual(livenessUser("Ọlá", "O'Neil", "Partner"), { firstName: "Ọlá", lastName: "O Neil" });
  assert.deepEqual(livenessUser("", "", "Supplier"), { firstName: "Supplier", lastName: undefined });
  assert.equal(livenessNamePart("Techdella & Co. Ltd."), "Techdella Co Ltd");
});

test("every liveness start goes through livenessUser", () => {
  for (const file of ["src/components/logistics/verification/SelfieCapture.tsx", "src/components/onboarding/supplier/SelfieCapture.tsx", "apps/mobile/src/components/kyc/KoraLiveness.native.tsx"]) {
    assert.match(read(file), /user: livenessUser\(/, file);
  }
});
