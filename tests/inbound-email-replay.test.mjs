// Inbound email webhooks (/api/webhooks/email and /api/support/inbound) must be replay-safe: signatures cover a
// timestamp that has to be within 5 minutes, and a repeated delivery maps to the same de-duplication id.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const inbox = await import("../src/lib/inbox/pure.ts");

const now = Date.parse("2026-10-12T09:00:00Z");
const ts = String(Math.floor(now / 1000));
const raw = JSON.stringify({ from: "Ada <ada@example.com>", to: "support@shopinbos.com", subject: "Help", text: "Hi", message_id: "<m1@example.com>" });

test("relay HMAC: a fresh, correctly signed request passes", () => {
  const signature = createHmac("sha256", "relay-secret").update(`${ts}.${raw}`).digest("hex");
  assert.equal(inbox.signInboundEmail(raw, ts, "relay-secret"), signature);
  assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: ts }, raw, "relay-secret", now), true);
  assert.equal(inbox.verifyInboundEmailSignature({ signature: `sha256=${signature.toUpperCase()}`, timestamp: ts }, raw, "relay-secret", now), true, "prefix and case are tolerated");
  assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: ts }, raw, "relay-secret", now + 299_000), true, "inside the window");
});

test("relay HMAC: wrong secret, changed body, changed timestamp or missing parts fail", () => {
  const signature = inbox.signInboundEmail(raw, ts, "relay-secret");
  assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: ts }, raw, "other-secret", now), false);
  assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: ts }, `${raw} `, "relay-secret", now), false);
  assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: String(Number(ts) + 1) }, raw, "relay-secret", now), false, "the timestamp is signed");
  assert.equal(inbox.verifyInboundEmailSignature({ signature: "abc", timestamp: ts }, raw, "relay-secret", now), false, "different lengths don't throw");
  assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: null }, raw, "relay-secret", now), false);
  assert.equal(inbox.verifyInboundEmailSignature({ signature: null, timestamp: ts }, raw, "relay-secret", now), false);
  assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: ts }, raw, "", now), false, "no secret, no pass");
});

test("relay HMAC: the old body-only signature no longer verifies", () => {
  const bodyOnly = createHmac("sha256", "relay-secret").update(raw).digest("hex");
  assert.equal(inbox.verifyInboundEmailSignature({ signature: bodyOnly, timestamp: ts }, raw, "relay-secret", now), false);
});

test("relay HMAC and Svix: stale or future timestamps fail even with a valid signature", () => {
  const old = String(Number(ts) - 301);
  const future = String(Number(ts) + 301);
  for (const stamp of [old, future]) {
    const signature = inbox.signInboundEmail(raw, stamp, "relay-secret");
    assert.equal(inbox.verifyInboundEmailSignature({ signature, timestamp: stamp }, raw, "relay-secret", now), false);
  }
  assert.equal(inbox.timestampFresh("1e9", now), false, "only plain unix seconds");
  assert.equal(inbox.timestampFresh("", now), false);
  assert.equal(inbox.timestampFresh(ts, now), true);

  const key = Buffer.from("resend-signing-key-for-tests").toString("base64");
  const svixSig = (id, stamp, body) => createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${stamp}.${body}`).digest("base64");
  const good = { id: "msg_1", timestamp: ts, signature: `v1,${svixSig("msg_1", ts, raw)}` };
  assert.equal(inbox.verifySvixSignature(good, raw, `whsec_${key}`, now), true);
  assert.equal(inbox.verifySvixSignature({ ...good, signature: `v1,${svixSig("msg_2", ts, raw)}` }, raw, `whsec_${key}`, now), false, "wrong signature");
  assert.equal(inbox.verifySvixSignature({ id: "msg_1", timestamp: old, signature: `v1,${svixSig("msg_1", old, raw)}` }, raw, `whsec_${key}`, now), false, "stale svix-timestamp");
});

test("a replayed delivery maps to the same de-duplication id", () => {
  assert.equal(inbox.inboundDedupeId("<m1@example.com>", "msg_1", "svix"), "<m1@example.com>", "Message-ID wins");
  assert.equal(inbox.inboundDedupeId(null, "msg_1", "svix"), "svix:msg_1");
  assert.equal(inbox.inboundDedupeId("  ", "msg_1", "svix"), "svix:msg_1");
  assert.equal(inbox.inboundDedupeId(null, null, "svix"), null);

  const signature = inbox.signInboundEmail(raw, ts, "relay-secret");
  const a = inbox.inboundDedupeId(null, inbox.normaliseHexSignature(signature), "relay");
  const b = inbox.inboundDedupeId(null, inbox.normaliseHexSignature(`sha256=${signature.toUpperCase()}`), "relay");
  assert.equal(a, b, "the same signed request can't dodge de-duplication by re-spelling the signature");

  // The support desk turns a unique-constraint race into a quiet "duplicate".
  assert.equal(inbox.isUniqueViolation({ code: "P2002" }), true);
  assert.equal(inbox.isUniqueViolation(new Error("boom")), false);
  assert.equal(inbox.isUniqueViolation(null), false);
});

test("both inbound email routes use the timestamped checks and de-duplicate quietly", () => {
  for (const file of ["src/app/api/webhooks/email/route.ts", "src/app/api/support/inbound/route.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /verifyInboundEmailSignature\(/, `${file} checks the timestamped relay signature`);
    assert.match(source, /x-inbox-timestamp/, file);
    assert.match(source, /verifySvixSignature\(/, file);
    assert.doesNotMatch(source, /verifyHmacHex/, `${file} no longer accepts a body-only HMAC`);
    assert.match(source, /inboundDedupeId\(/, file);
  }
  const support = readFileSync(new URL("../src/lib/support/service.server.ts", import.meta.url), "utf8");
  assert.match(support, /if \(seen\) return "duplicate"/);
  assert.match(support, /isUniqueViolation\(error\)\) return "duplicate"/);
  const service = readFileSync(new URL("../src/lib/inbox/service.ts", import.meta.url), "utf8");
  assert.match(service, /duplicate: true/);
});
