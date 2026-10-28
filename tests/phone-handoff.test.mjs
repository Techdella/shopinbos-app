import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// "Do it on your phone": the QR link from a computer's selfie or ID screen (src/lib/kyc/handoff.ts).
const handoff = await import("../src/lib/kyc/handoff.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SECRET = "test-secret-for-handoff";

test("a phone link is signed, single-purpose and works for 20 minutes", () => {
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);
  const { token, expiresAt } = handoff.signHandoff(SECRET, { kind: "logistics", userId: "user_1", purpose: "selfie" }, now);
  assert.equal(expiresAt, now + 20 * 60_000);
  const read1 = handoff.readHandoff(SECRET, token, now + 60_000);
  assert.ok(read1.ok);
  assert.deepEqual(read1.handoff, { kind: "logistics", purpose: "selfie", userId: "user_1", expiresAt });
  assert.deepEqual(handoff.readHandoff(SECRET, token, expiresAt), { ok: false, reason: "expired" });
  assert.deepEqual(handoff.readHandoff("another-secret", token, now), { ok: false, reason: "invalid" });
  // Changing the payload (another account, another step) breaks the signature.
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "logistics", p: "id", u: "user_2", e: expiresAt })).toString("base64url");
  assert.deepEqual(handoff.readHandoff(SECRET, `${forged}.${sig}`, now), { ok: false, reason: "invalid" });
  assert.deepEqual(handoff.readHandoff(SECRET, `${payload}.${sig}x`, now), { ok: false, reason: "invalid" });
  for (const junk of [undefined, "", "abc", "a.b.c", 42]) assert.equal(handoff.readHandoff(SECRET, junk, now).ok, false);
  assert.equal(handoff.handoffPath(token), `/verify/phone/${token}`);
  assert.ok(handoff.isHandoffPurpose("id") && !handoff.isHandoffPurpose("bank"));
});

test("a document's stamp changes when the phone sends a new one", () => {
  const before = handoff.docStamp({ uploadedAt: "2026-10-28T12:00:00Z", updatedAt: "2026-10-28T12:00:00Z", status: "uploaded" });
  assert.notEqual(before, handoff.docStamp({ uploadedAt: "2026-10-28T12:05:00Z", updatedAt: "2026-10-28T12:05:00Z", status: "pending" }));
  assert.equal(handoff.docStamp(null), "");
});

test("the phone runs the same step as the signed-in screen", () => {
  // The routes only call the shared steps; the phone link calls the same functions.
  for (const [route, fn] of [["logistics/kyc/nin", "ninStep"], ["logistics/kyc/selfie", "selfieStep"], ["logistics/kyc/id-document", "idDocumentStep"], ["supplier/kyc/selfie", "supplierSelfieStep"], ["supplier/kyc/id-document", "supplierIdStep"]]) {
    assert.match(read(`src/app/api/${route}/route.ts`), new RegExp(`${fn}\\(`), route);
  }
  const server = read("src/lib/kyc/handoff.server.ts");
  for (const fn of ["ninStep", "selfieStep", "idDocumentStep", "supplierSelfieStep", "supplierIdStep"]) assert.match(server, new RegExp(`${fn}\\(`));
  assert.match(server, /checkRateLimitShared\(rateLimitKey\("kyc-handoff"/);
  // The NIN check keeps its daily limit wherever it runs.
  assert.match(read("src/lib/logistics/kyc-steps.server.ts"), /DAILY_ID_CHECKS/);
  assert.match(read("src/lib/kyc/supplier-steps.server.ts"), /DAILY_ID_CHECKS/);
  // The phone answers only "done", never the account's details.
  assert.match(server, /ok\(\{ done: true \}\)/);
});

test("the selfie and ID screens offer the phone, and move on when it's sent", () => {
  const card = read("src/components/kyc/PhoneHandoff.tsx");
  assert.match(card, /POLL_MS = 3000/);
  assert.match(card, /\(pointer: coarse\)/);
  assert.match(card, /<QrCode /);
  for (const file of ["src/components/logistics/verification/CheckScreens.tsx", "src/components/onboarding/SupplierOnboarding.tsx"]) {
    const source = read(file);
    assert.match(source, /<PhoneOrThisDevice purpose="selfie"/, file);
    assert.match(source, /<PhoneOrThisDevice purpose="id"/, file);
    assert.match(source, /onStartFailed=\{\(\) => setCameraFailed\(true\)\}/, file);
  }
  // The phone page gets the camera and Korapay's liveness hosts, like the verification screens.
  const config = read("next.config.ts");
  assert.match(config, /source: "\/verify\/phone\/:token",\s*headers: baseHeaders\(true\)/);
  assert.match(config, /\(\?!logistics\/verification\$\|supplier\/onboarding\$\|verify\/phone\/\)/);
  assert.match(read("src/app/api/logistics/kyc/handoff/route.ts"), /createHandoff\("logistics", user\.id/);
  assert.match(read("src/app/api/supplier/kyc/handoff/route.ts"), /createHandoff\("supplier", user\.id/);
});
