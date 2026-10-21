// Riders sign in on the phone app with their number and a code (src/app/api/mobile/rider-sign-in/route.ts): codes
// only go to numbers a partner added as an active rider, the signed challenge is scoped to rider sign-in (a checkout
// phone challenge can't be replayed), wrong codes are limited, and only a right code makes a new Riders app key.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../src/app/api/mobile/rider-sign-in/route.ts", import.meta.url), "utf8");
const verify = await import("../src/lib/commerce/phone-verify.ts");

test("rider sign-in: rules in the route", () => {
  assert.match(route, /role: "rider", status: "active"/);
  assert.match(route, /e164\(rider\.phone\) === phone/, "the number must match exactly, not just its last digits");
  assert.match(route, /phoneCodeSendLimited\(req\.headers, phone\)/);
  assert.match(route, /phoneCodeCheckLimited\(phone, read\.nonce\)/);
  // The key is made only after the code checks out.
  assert.ok(route.indexOf("checkPhoneChallenge(") < route.indexOf("newRiderToken()"));
  assert.match(route, /data: \{ riderTokenHash: hash \}/, "only the hash is stored");
});

test("rider sign-in: a checkout challenge for the same phone doesn't sign a rider in", () => {
  const secret = "test-secret-123456789";
  const phone = "+2348031234567";
  const code = "123456";
  const checkout = verify.createPhoneChallenge({ phone, storeId: "store_1", code }, secret);
  assert.equal(verify.checkPhoneChallenge({ challenge: checkout.challenge, phone, storeId: "rider-sign-in", code }, secret).ok, false);
  const rider = verify.createPhoneChallenge({ phone, storeId: "rider-sign-in", code }, secret);
  assert.equal(verify.checkPhoneChallenge({ challenge: rider.challenge, phone, storeId: "rider-sign-in", code }, secret).ok, true);
  assert.equal(verify.checkPhoneChallenge({ challenge: rider.challenge, phone, storeId: "rider-sign-in", code: "000000" }, secret).ok, false);
});
