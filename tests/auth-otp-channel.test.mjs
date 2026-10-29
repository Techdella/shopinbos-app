// Phone sign-in codes on WhatsApp with an SMS fallback (src/lib/auth/otp-channel.ts): WhatsApp only through WhatsApp
// Cloud, which channel to try, the fallback order, what the screen is told, and the request shape. Never Twilio.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const otp = await import("../src/lib/auth/otp-channel.ts");

const TERMII = { TERMII_API_KEY: "tk", TERMII_SENDER_ID: "Shopinbos" };
const SENDCHAMP = { SENDCHAMP_API_KEY: "sk", AUTH_OTP_WHATSAPP_SENDER: "+234 801 234 5678", AUTH_OTP_WHATSAPP_TEMPLATE: "tpl_123" };
const META = { WHATSAPP_OTP_PHONE_NUMBER_ID: "1234567890", WHATSAPP_OTP_TOKEN: "EAAG-test", AUTH_OTP_WHATSAPP_TEMPLATE: "shopinbos_login_code" };

test("WhatsApp codes only go through WhatsApp Cloud, and only when AUTH_OTP_WHATSAPP is on", () => {
  assert.equal(otp.whatsappCodeConfig({ ...META }), null, "flag off");
  assert.equal(otp.whatsappCodeConfig({ ...META, AUTH_OTP_WHATSAPP: "0" }), null);
  assert.equal(otp.whatsappCodeConfig({ AUTH_OTP_WHATSAPP: "1" }), null, "no WhatsApp Cloud keys");
  assert.equal(otp.whatsappCodeConfig({ AUTH_OTP_WHATSAPP: "1", TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "x" }), null, "never Twilio");
  // SMS providers' keys never send WhatsApp.
  assert.equal(otp.whatsappCodeConfig({ ...TERMII, AUTH_OTP_WHATSAPP: "1" }), null, "not Termii");
  assert.equal(otp.whatsappCodeConfig({ ...SENDCHAMP, AUTH_OTP_WHATSAPP: "1" }), null, "not Sendchamp");
  assert.equal(otp.whatsappCodeConfig({ AUTH_OTP_WHATSAPP: "1", BREVO_API_KEY: "b" }), null, "not Brevo");
  const all = { ...TERMII, ...SENDCHAMP, ...META, AUTH_OTP_WHATSAPP: "1", SMS_PROVIDER: "sendchamp", AUTH_OTP_WHATSAPP_PROVIDER: "termii" };
  assert.equal(otp.whatsappCodeConfig(all).provider, "meta", "WhatsApp Cloud whatever else is set");
  assert.equal(otp.whatsappCodesAvailable(all), true);
  assert.equal(otp.whatsappCodesAvailable({}), false);
  for (const name of ["termiiWhatsAppRequest", "sendchampWhatsAppRequest"]) assert.equal(otp[name], undefined, `${name} is gone`);
});

test("channel choice: 'Send it by SMS' always means SMS; otherwise WhatsApp only when it is set up", () => {
  assert.equal(otp.chooseCodeChannel("sms", true), "sms");
  assert.equal(otp.chooseCodeChannel("sms", false), "sms");
  assert.equal(otp.chooseCodeChannel("whatsapp", true), "whatsapp");
  assert.equal(otp.chooseCodeChannel("whatsapp", false), "sms", "not set up: SMS");
  assert.equal(otp.chooseCodeChannel(undefined, true), "whatsapp", "older clients get WhatsApp when available");
  assert.equal(otp.chooseCodeChannel(undefined, false), "sms");
  assert.equal(otp.chooseCodeChannel("carrier-pigeon", false), "sms");
});

test("fallback: WhatsApp then SMS; SMS only when SMS was asked for, nothing was noted, or WhatsApp is off", () => {
  assert.deepEqual(otp.deliveryPlan("whatsapp", true), ["whatsapp", "sms"]);
  assert.deepEqual(otp.deliveryPlan("whatsapp", false), ["sms"], "switched off since the request");
  assert.deepEqual(otp.deliveryPlan("sms", true), ["sms"]);
  assert.deepEqual(otp.deliveryPlan(null, true), ["sms"], "no note (e.g. a resend from Supabase itself): SMS");
  assert.deepEqual(otp.deliveryPlan(undefined, false), ["sms"]);
});

test("the screen is only told WhatsApp when the hook noted WhatsApp", () => {
  assert.equal(otp.reportedChannel("whatsapp"), "whatsapp");
  assert.equal(otp.reportedChannel("sms"), "sms");
  assert.equal(otp.reportedChannel(null), "sms", "no note: Supabase's SMS path");
  assert.equal(otp.reportedChannel(undefined), "sms");
});

test("code messages", () => {
  assert.match(otp.signInCodeMessage("111222"), /111222/);
  // SMS codes end with the WebOTP line, so Android Chrome fills the code in on app.shopinbos.com.
  assert.match(otp.signInCodeSms("111222"), /\n\n@app\.shopinbos\.com #111222$/);
  assert.match(otp.signInCodeSms("111222"), /^Your Shopinbos code is 111222\./);
});

test("wiring: send route, hook, flag endpoint, env docs and the migration", () => {
  const route = readFileSync("src/app/api/auth/otp/route.ts", "utf8");
  assert.match(route, /export async function GET\(\)/, "public flag for the screens");
  assert.match(route, /whatsapp: whatsappCodesAvailable\(process\.env\)/);
  assert.match(route, /rememberWantedChannel\(phone, wanted\)/);
  assert.match(route, /channel: await channelUsedFor\(phone\)/, "reports the channel actually used");
  assert.match(route, /channel: "sms"/, "Supabase itself is always asked for SMS");
  const hook = readFileSync("src/app/api/webhooks/supabase-sms/route.ts", "utf8");
  assert.match(hook, /deliverSignInCode\(phone, otp\)/);
  const delivery = readFileSync("src/lib/auth/otp-delivery.server.ts", "utf8");
  assert.match(delivery, /deliveryPlan\(note\?\.wanted, Boolean\(whatsapp\)\)/);
  assert.match(delivery, /sendPlatformSms/, "SMS fallback through the platform providers");
  for (const file of [route, hook, delivery]) {
    assert.doesNotMatch(file, /from\s+["'][^"']*twilio/i, "no Twilio import");
    assert.doesNotMatch(file, /TWILIO_|api\.twilio\.com/i, "no Twilio keys or API");
  }
  const env = readFileSync(".env.local.example", "utf8");
  for (const name of ["AUTH_OTP_WHATSAPP=", "AUTH_OTP_WHATSAPP_TEMPLATE=", "WHATSAPP_OTP_PHONE_NUMBER_ID=", "WHATSAPP_OTP_TOKEN="]) assert.ok(env.includes(name), name);
  assert.ok(existsSync("docs/migrations/2026-10-21-auth-code-channel.sql"));
  assert.match(readFileSync("prisma/schema.prisma", "utf8"), /model AuthCodeChannel \{/);
});

test("Meta Cloud API: Shopinbos's own WhatsApp number sends the authentication template", () => {
  assert.equal(otp.whatsappCodeConfig(META), null, "off until AUTH_OTP_WHATSAPP=1");
  assert.equal(otp.whatsappCodeConfig({ ...META, AUTH_OTP_WHATSAPP: "1", AUTH_OTP_WHATSAPP_TEMPLATE: "" }), null, "needs the template");
  const config = otp.whatsappCodeConfig({ ...META, AUTH_OTP_WHATSAPP: "1" });
  assert.equal(config.provider, "meta");
  assert.equal(config.language, "en");
  const req = otp.metaWhatsAppRequest({ ...config, graphVersion: "v21.0" }, "+234 803 123 4567", "481516");
  assert.equal(req.url, "https://graph.facebook.com/v21.0/1234567890/messages");
  assert.equal(req.body.to, "2348031234567");
  assert.equal(req.body.template.name, "shopinbos_login_code");
  assert.deepEqual(req.body.template.components[0], { type: "body", parameters: [{ type: "text", text: "481516" }] });
  assert.deepEqual(req.body.template.components[1], { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "481516" }] });
  assert.deepEqual(otp.readWhatsAppSend("meta", true, { messages: [{ id: "wamid.1" }] }), { ok: true });
  assert.deepEqual(otp.readWhatsAppSend("meta", false, { error: { message: "Template not approved" } }), { ok: false, error: "Template not approved" });
  // Never Twilio, on any path.
  assert.doesNotMatch(readFileSync("src/lib/auth/otp-channel.ts", "utf8") + readFileSync("scripts/create-whatsapp-otp-template.mjs", "utf8"), /twilio\.com|from "twilio"/i);
});
