import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const meta = await import("../src/lib/meta/signed-request.ts");

const SECRET = "test-app-secret";

test("parses a signed_request built the way Meta builds it", () => {
  const signed = meta.signRequest({ user_id: "1234567890", issued_at: 1700000000 }, SECRET);
  const parsed = meta.parseSignedRequest(signed, SECRET);
  assert.equal(parsed?.userId, "1234567890");
  assert.equal(parsed?.issuedAt, 1700000000);
});

test("matches Meta's documented format: HMAC-SHA256 over the base64url payload text", () => {
  // Built by hand, independently of signRequest.
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "42", issued_at: 1 })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  assert.equal(meta.parseSignedRequest(`${sig}.${payload}`, SECRET)?.userId, "42");
  // Standard base64 (with + / =) in the signature still verifies.
  const padded = createHmac("sha256", SECRET).update(payload).digest("base64");
  assert.equal(meta.parseSignedRequest(`${padded}.${payload}`, SECRET)?.userId, "42");
});

test("rejects a wrong secret, a tampered payload and junk", () => {
  const signed = meta.signRequest({ user_id: "1234567890" }, SECRET);
  assert.equal(meta.parseSignedRequest(signed, "other-secret"), null);
  const [sig] = signed.split(".");
  const forged = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" })).toString("base64url");
  assert.equal(meta.parseSignedRequest(`${sig}.${forged}`, SECRET), null);
  for (const junk of ["", "abc", "a.b.c", ".", `${sig}.`, null, undefined]) assert.equal(meta.parseSignedRequest(junk, SECRET), null);
  assert.equal(meta.parseSignedRequest(signed, ""), null);
});

test("rejects other algorithms and missing or odd user ids", () => {
  const sign = (body) => {
    const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
    return `${createHmac("sha256", SECRET).update(payload).digest("base64url")}.${payload}`;
  };
  assert.equal(meta.parseSignedRequest(sign({ algorithm: "none", user_id: "1" }), SECRET), null);
  assert.equal(meta.parseSignedRequest(sign({ algorithm: "HMAC-SHA256" }), SECRET), null);
  assert.equal(meta.parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "12 OR 1=1" }), SECRET), null);
  assert.equal(meta.parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: 77 }), SECRET)?.userId, "77");
});

test("reads signed_request from Meta's form post and from JSON", () => {
  const signed = meta.signRequest({ user_id: "5" }, SECRET);
  assert.equal(meta.signedRequestFromBody(`signed_request=${encodeURIComponent(signed)}`, "application/x-www-form-urlencoded"), signed);
  assert.equal(meta.signedRequestFromBody(JSON.stringify({ signed_request: signed }), "application/json"), signed);
  assert.equal(meta.signedRequestFromBody("{nope", "application/json"), null);
  assert.equal(meta.signedRequestFromBody("other=1", null), null);
});

test("confirmation codes are 12 unambiguous characters and the user id is only kept hashed", () => {
  const codes = new Set(Array.from({ length: 200 }, () => meta.newConfirmationCode()));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.ok(meta.isConfirmationCode(code), code);
  assert.equal(meta.isConfirmationCode("O0I1ABCDEFGH"), false);
  assert.equal(meta.isConfirmationCode("abc"), false);
  const hash = meta.hashMetaUserId("1234567890");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes("1234567890"));
  assert.equal(hash, meta.hashMetaUserId("1234567890"));
});
