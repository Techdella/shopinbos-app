// Checkout phone check for delivery partners (spec §6.1): the signed challenge and phoneToken
// (src/lib/commerce/phone-verify.ts), and the wiring in the routes, checkout API and pages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pv = await import("../src/lib/commerce/phone-verify.ts");
const read = (file) => readFileSync(file, "utf8");

const SECRET = "test-secret";
const PHONE = "+2348031234567";
const STORE = "store_1";

test("codes are 6 digits; typed codes are cleaned; the message names the store", () => {
  for (let i = 0; i < 50; i++) assert.match(pv.generatePhoneCode(), /^\d{6}$/);
  assert.equal(pv.cleanPhoneCode(" 123 456 "), "123456");
  assert.equal(pv.cleanPhoneCode("12345"), null);
  assert.equal(pv.cleanPhoneCode(123456), null);
  assert.equal(pv.phoneCodeMessage("  Mama's   Kitchen ", "123456"), "Mama's Kitchen: your delivery phone code is 123456. Don't share it with anyone.");
  assert.match(pv.phoneCodeMessage("", "000111"), /^Shopinbos: your delivery phone code is 000111/);
  assert.ok(pv.phoneCodeMessage("x".repeat(200), "123456").length < 120, "long names are cut");
});

test("the secret: env first, a dev key outside production, nothing in production (fail closed)", () => {
  assert.equal(pv.phoneVerifySecret({ CHECKOUT_PHONE_SECRET: "a", JWT_SECRET: "b" }), "a");
  assert.equal(pv.phoneVerifySecret({ JWT_SECRET: "b", SUPABASE_SERVICE_ROLE_KEY: "c" }), "b");
  assert.equal(pv.phoneVerifySecret({ SUPABASE_SERVICE_ROLE_KEY: "c", NODE_ENV: "production" }), "c");
  assert.equal(pv.phoneVerifySecret({ NODE_ENV: "production" }), "");
  assert.ok(pv.phoneVerifySecret({ NODE_ENV: "development" }).length > 0);
  assert.throws(() => pv.createPhoneToken({ phone: PHONE, storeId: STORE }, ""), /secret/);
});

test("a challenge accepts its own code, for its phone and store, until it expires", () => {
  const now = 1_700_000_000_000;
  const { challenge, nonce, expiresAt } = pv.createPhoneChallenge({ phone: PHONE, storeId: STORE, code: "123456", now }, SECRET);
  assert.equal(expiresAt, now + pv.PHONE_CODE_TTL_MS);
  assert.ok(!challenge.includes("123456"), "the code isn't in the challenge");
  const payload = JSON.parse(Buffer.from(challenge.split(".")[0], "base64url").toString("utf8"));
  assert.ok(!Object.values(payload).includes("123456"));

  const check = (over = {}) => pv.checkPhoneChallenge({ challenge, phone: PHONE, storeId: STORE, code: "123456", now: now + 1000, ...over }, SECRET);
  assert.deepEqual(check(), { ok: true });
  assert.deepEqual(check({ code: "123 456" }), { ok: true }, "spaces are fine");
  assert.deepEqual(check({ code: "654321" }), { ok: false, reason: "wrong_code" });
  assert.deepEqual(check({ code: "12" }), { ok: false, reason: "wrong_code" });
  assert.deepEqual(check({ phone: "+2348030000000" }), { ok: false, reason: "invalid" }, "another phone");
  assert.deepEqual(check({ storeId: "store_2" }), { ok: false, reason: "invalid" }, "another store");
  assert.deepEqual(check({ now: now + pv.PHONE_CODE_TTL_MS + 1 }), { ok: false, reason: "invalid" }, "expired");
  assert.deepEqual(pv.checkPhoneChallenge({ challenge, phone: PHONE, storeId: STORE, code: "123456", now }, "other-secret"), { ok: false, reason: "invalid" }, "another secret");

  assert.deepEqual(pv.readPhoneChallenge(challenge, { phone: PHONE, storeId: STORE, now }, SECRET), { nonce });
  assert.equal(pv.readPhoneChallenge(challenge, { phone: PHONE, storeId: "store_2", now }, SECRET), null);
});

test("forged or tampered strings are refused; a challenge is not a token and the other way round", () => {
  const now = Date.now();
  const { challenge } = pv.createPhoneChallenge({ phone: PHONE, storeId: STORE, code: "123456", now }, SECRET);
  const { phoneToken } = pv.createPhoneToken({ phone: PHONE, storeId: STORE, now }, SECRET);
  const [payload, signature] = phoneToken.split(".");
  // Tamper with the signature's first character: it carries six whole bits, so the bytes always change. (Replacing
  // the last two with "AA" left the signature valid about once in a thousand runs, when it already decoded that way.)
  const tampered = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  const swapped = Buffer.from(JSON.stringify({ p: "+2348030000000", s: STORE, e: now + 1e9 })).toString("base64url");
  for (const bad of [undefined, null, "", "abc", `${payload}`, `${payload}.${signature}.x`, `${swapped}.${signature}`, `${payload}.${tampered}`, "x".repeat(3000)]) {
    assert.equal(pv.verifyPhoneToken(bad, { phone: PHONE, storeId: STORE, now }, SECRET), false, String(bad).slice(0, 30));
  }
  assert.equal(pv.verifyPhoneToken(challenge, { phone: PHONE, storeId: STORE, now }, SECRET), false, "a challenge isn't a token");
  assert.deepEqual(pv.checkPhoneChallenge({ challenge: phoneToken, phone: PHONE, storeId: STORE, code: "123456", now }, SECRET), { ok: false, reason: "invalid" }, "a token isn't a challenge");
});

test("the phoneToken is for one phone and store, for a day", () => {
  const now = 1_700_000_000_000;
  const { phoneToken, expiresAt } = pv.createPhoneToken({ phone: PHONE, storeId: STORE, now }, SECRET);
  assert.equal(expiresAt, now + pv.PHONE_TOKEN_TTL_MS);
  assert.equal(pv.PHONE_TOKEN_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(pv.verifyPhoneToken(phoneToken, { phone: PHONE, storeId: STORE, now: now + 60_000 }, SECRET), true);
  assert.equal(pv.verifyPhoneToken(phoneToken, { phone: "+2348030000000", storeId: STORE, now }, SECRET), false);
  assert.equal(pv.verifyPhoneToken(phoneToken, { phone: null, storeId: STORE, now }, SECRET), false);
  assert.equal(pv.verifyPhoneToken(phoneToken, { phone: PHONE, storeId: "store_2", now }, SECRET), false);
  assert.equal(pv.verifyPhoneToken(phoneToken, { phone: PHONE, storeId: STORE, now: now + pv.PHONE_TOKEN_TTL_MS + 1 }, SECRET), false);
  assert.equal(pv.verifyPhoneToken(phoneToken, { phone: PHONE, storeId: STORE, now }, "other-secret"), false);
});

test("the pure module stays pure (node --test loads it directly)", () => {
  const source = read("src/lib/commerce/phone-verify.ts");
  assert.doesNotMatch(source, /from\s+["']@\//);
  assert.doesNotMatch(source, /server-only/);
  assert.match(source, /timingSafeEqual/, "constant-time compares");
});

test("wiring: routes, limits, checkout API and both pages", () => {
  const send = read("src/app/api/public/store/[slug]/checkout/phone-code/route.ts");
  assert.match(send, /phoneCodeSendLimited\(req\.headers, phone\)/);
  assert.match(send, /createPhoneChallenge\(/);
  assert.match(send, /withCors\(/);
  assert.match(send, /export async function OPTIONS/);
  const verify = read("src/app/api/public/store/[slug]/checkout/phone-verify/route.ts");
  assert.match(verify, /phoneCodeCheckLimited\(phone, challenge\.nonce\)/);
  assert.match(verify, /createPhoneToken\(/);

  const server = read("src/lib/commerce/phone-verify.server.ts");
  assert.match(server, /maxRequests: 3, windowMs: 10 \* MINUTE/, "3 codes per phone per 10 minutes");
  assert.match(server, /maxRequests: 8, windowMs: 24 \* 60 \* MINUTE/, "8 a day");
  assert.match(server, /maxRequests: PHONE_CODE_MAX_ATTEMPTS/, "5 tries per code");
  assert.match(server, /failClosed: true/);
  assert.match(server, /platformSmsReady\(\) \|\| whatsappCodesAvailable\(env\)/, "skipped only without any way to send codes");
  assert.match(server, /checkoutMode === "partners"/, "codes only for stores with delivery partners");

  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /phoneToken: z\.string\(\)\.max\(2000\)\.optional\(\)/);
  assert.match(checkout, /if \(partnerParcels\.length\) \{\s*const phoneCheck = checkCheckoutPhoneToken\(\{ storeId: store\.id, buyerPhone, phoneToken: parsed\.data\.phoneToken \}\)/);
  assert.match(server, /Verify your phone number so the delivery partner can reach you\./);

  for (const page of ["src/app/s/[slug]/checkout/CheckoutClient.tsx", "src/app/s/[slug]/pay/[code]/PayLinkClient.tsx"]) {
    const source = read(page);
    assert.match(source, /usePhoneCheck\(\{ storeSlug: store\.slug, phone: details\.phone, enabled: partners && !preview, needed: hasPartnerParcels\(marketOption\) \}\)/, page);
    assert.match(source, /phoneToken: phoneCheck\.phoneToken/, page);
    assert.match(source, /if \(phoneCheck\.blocker\) return blockOnPhone\(phoneCheck\.blocker\)/, page);
    assert.match(source, /<PhoneCheck theme=\{theme\} check=\{phoneCheck\}/, page);
  }
  const box = read("src/components/storefront/checkout/PhoneCheck.tsx");
  assert.match(box, /sessionStorage/);
  assert.match(box, /try \{/);
});
