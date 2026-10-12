// SMS and voice providers (Termii, Africa's Talking, Sendchamp): provider choice, webhook checks, parsers,
// send-response readers and Africa's Talking voice XML. Pure helpers only (src/lib/sms/pure.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const sms = await import("../src/lib/sms/pure.ts");

test("platform SMS provider order follows SMS_PROVIDER, then every other configured provider", () => {
  const all = { TERMII_API_KEY: "t", AFRICASTALKING_API_KEY: "a", AFRICASTALKING_USERNAME: "shop", SENDCHAMP_API_KEY: "s" };
  assert.deepEqual(sms.platformProviderOrder(all), ["termii", "africastalking", "sendchamp"], "default order");
  assert.deepEqual(sms.platformProviderOrder({ ...all, SMS_PROVIDER: "sendchamp" }), ["sendchamp", "termii", "africastalking"]);
  assert.deepEqual(sms.platformProviderOrder({ ...all, SMS_PROVIDER: "africastalking, termii" }), ["africastalking", "termii", "sendchamp"]);
  assert.deepEqual(sms.platformProviderOrder({ ...all, SMS_PROVIDER: "Africa's Talking" }), ["africastalking", "termii", "sendchamp"], "label spelling works");
  assert.deepEqual(sms.platformProviderOrder({ ...all, SMS_PROVIDER: "twilio" }), ["termii", "africastalking", "sendchamp"], "unknown names are ignored");
  assert.deepEqual(sms.platformProviderOrder({ SMS_PROVIDER: "termii", SENDCHAMP_API_KEY: "s" }), ["sendchamp"], "providers without keys are skipped");
  assert.deepEqual(sms.platformProviderOrder({ AFRICASTALKING_API_KEY: "a" }), [], "Africa's Talking needs the username too");
  assert.deepEqual(sms.platformProviderOrder({}), []);
});

test("Termii signatures: HMAC-SHA512 of the raw body with the secret key", () => {
  const body = '{"type":"inbound","sender":"2348012345678","receiver":"2349000000000","message":"Hi","message_id":"1"}';
  const hex = createHmac("sha512", "termii-secret").update(body).digest("hex");
  assert.equal(sms.verifyTermiiSignature(body, hex, "termii-secret"), true);
  assert.equal(sms.verifyTermiiSignature(body, hex.toUpperCase(), "termii-secret"), true, "hex case doesn't matter");
  assert.equal(sms.verifyTermiiSignature(body, createHmac("sha512", "termii-secret").update(body).digest("base64"), "termii-secret"), true);
  assert.equal(sms.verifyTermiiSignature(body + " ", hex, "termii-secret"), false, "a changed body fails");
  assert.equal(sms.verifyTermiiSignature(body, hex, "other"), false);
  assert.equal(sms.verifyTermiiSignature(body, null, "termii-secret"), false);
  assert.equal(sms.verifyTermiiSignature(body, hex, ""), false, "no secret, no pass");
});

test("URL tokens and the optional IP allow list", () => {
  assert.equal(sms.verifyUrlToken("abc123", "abc123"), true);
  assert.equal(sms.verifyUrlToken("abc124", "abc123"), false);
  assert.equal(sms.verifyUrlToken("abc", "abc123"), false);
  assert.equal(sms.verifyUrlToken(null, "abc123"), false);
  assert.equal(sms.verifyUrlToken("abc123", null), false, "a channel without a secret never matches");

  assert.equal(sms.ipAllowed("1.2.3.4", ""), true, "no list allows everyone");
  assert.equal(sms.ipAllowed(null, undefined), true);
  assert.equal(sms.ipAllowed("1.2.3.4", "1.2.3.4, 5.6.7.8"), true);
  assert.equal(sms.ipAllowed("::ffff:5.6.7.8", "5.6.7.8"), true, "IPv4-mapped IPv6");
  assert.equal(sms.ipAllowed("1.2.3.5", "1.2.3.4"), false);
  assert.equal(sms.ipAllowed("10.0.3.200", "10.0.0.0/16"), true);
  assert.equal(sms.ipAllowed("10.1.0.1", "10.0.0.0/16"), false);
  assert.equal(sms.ipAllowed(null, "10.0.0.0/16"), false);
  assert.equal(sms.ipAllowed("2001:db8::1", "2001:db8::1"), true);

  const headers = new Map([["x-forwarded-for", "41.58.1.2, 10.0.0.1"]]);
  assert.equal(sms.clientIp({ get: (name) => headers.get(name) ?? null }), "41.58.1.2");

  const url = sms.providerWebhookUrl("https://app.example/", "sms", "termii", "row_1", "tok en");
  assert.equal(url, "https://app.example/api/webhooks/sms/termii?channel=row_1&token=tok+en");
  assert.equal(sms.providerWebhookUrl("https://app.example", "voice", "africastalking", "row_2", "t"), "https://app.example/api/webhooks/voice/africastalking?channel=row_2&token=t");
});

test("Termii base URLs only point at termii.com over HTTPS", () => {
  assert.equal(sms.termiiBaseUrl(""), sms.TERMII_DEFAULT_BASE_URL);
  assert.equal(sms.termiiBaseUrl("https://v3.api.termii.com/"), "https://v3.api.termii.com");
  assert.equal(sms.termiiBaseUrl("api.ng.termii.com"), "https://api.ng.termii.com");
  assert.equal(sms.termiiBaseUrl("http://v3.api.termii.com"), null, "not plain HTTP");
  assert.equal(sms.termiiBaseUrl("https://termii.com.evil.example"), null);
  assert.equal(sms.termiiBaseUrl("https://evil.example/termii.com"), null);
  assert.equal(sms.termiiBaseUrl("https://user:pw@v3.api.termii.com"), null);
});

test("inbound SMS and delivery reports from each provider", () => {
  const termiiIn = sms.parseTermiiInbound({ type: "inbound", id: "r1", message_id: "3905204342778053556", receiver: "2349012345678", sender: "08012345678", message: "Is it available?", received_at: "2020-12-16T10:51:03.000000Z", status: "Received", channel: null });
  assert.deepEqual([termiiIn.to, termiiIn.phone, termiiIn.text, termiiIn.externalId], ["+2349012345678", "+2348012345678", "Is it available?", "3905204342778053556"]);
  assert.equal(termiiIn.timestamp.toISOString(), "2020-12-16T10:51:03.000Z");
  assert.equal(sms.parseTermiiInbound({ type: "sms", message_id: "1", status: "DELIVERED" }), null, "a delivery report isn't a message");
  assert.equal(sms.parseTermiiStatus({ type: "inbound", sender: "1", receiver: "2" }), null, "an inbound message isn't a report");
  assert.deepEqual(sms.parseTermiiStatus({ type: "sms", id: "req", message_id: "m1", status: "DELIVERED", channel: "dnd" }), { externalId: "m1", status: "delivered", error: null });
  assert.deepEqual(sms.parseTermiiStatus({ message_id: "m2", status: "DND Active on Phone Number" }), { externalId: "m2", status: "failed", error: "Termii: DND Active on Phone Number" });
  assert.equal(sms.parseTermiiStatus({ message_id: "m3", status: "Message Failed" }).status, "failed");

  const atIn = sms.parseAfricasTalkingInbound({ from: "+2348012345678", to: "33012", text: "SHOP price?", id: "ATXid_1", date: "2026-10-12 09:30:00", linkId: "x", networkCode: "62130" });
  assert.deepEqual([atIn.to, atIn.phone, atIn.text, atIn.externalId], ["33012", "+2348012345678", "SHOP price?", "ATXid_1"], "shortcodes stay as digits");
  assert.equal(atIn.timestamp.toISOString(), "2026-10-12T09:30:00.000Z");
  assert.equal(sms.parseAfricasTalkingInbound({ id: "1", status: "Success", phoneNumber: "+234" }), null);
  assert.deepEqual(sms.parseAfricasTalkingStatus({ id: "ATXid_9", status: "Success", phoneNumber: "+2348012345678", networkCode: "62130" }), { externalId: "ATXid_9", status: "delivered", error: null });
  assert.deepEqual(sms.parseAfricasTalkingStatus({ id: "ATXid_8", status: "Failed", failureReason: "UserInBlacklist" }), { externalId: "ATXid_8", status: "failed", error: "Africa's Talking: UserInBlacklist" });
  assert.equal(sms.parseAfricasTalkingStatus({ id: "ATXid_7", status: "Buffered" }).status, "sent");
  assert.equal(sms.parseAfricasTalkingStatus({ from: "+234", to: "1", text: "hi", id: "x", status: "Success" }), null, "an incoming message isn't a report");

  assert.deepEqual(sms.parseSendchampStatus({ event: "sms.status", data: { reference: "sc_1", status: "delivered" } }), { externalId: "sc_1", status: "delivered", error: null });
  assert.equal(sms.parseSendchampStatus({ id: "sc_2", status: "failed", reason: "Invalid number" }).error, "Sendchamp: Invalid number");
  assert.equal(sms.parseSendchampStatus({ id: "sc_3", status: "something new" }), null, "unknown statuses are ignored");

  assert.equal(sms.statusFrom("Undelivered"), "failed", "'undelivered' isn't 'delivered'");
  assert.equal(sms.statusFrom("Received"), null);

  assert.deepEqual(sms.parseBody('{"a":1}'), { a: 1 });
  assert.deepEqual(sms.parseBody("from=%2B234801&text=hi+there"), { from: "+234801", text: "hi there" });
  assert.deepEqual(sms.parseBody("{bad json"), {});
});

test("send responses: accepted means the provider took it, with its message id", () => {
  assert.deepEqual(sms.readTermiiSend(true, { code: "ok", message_id: "9122821270554876574", message: "Successfully Sent", balance: 9, user: "Ada" }), { ok: true, externalId: "9122821270554876574" });
  assert.deepEqual(sms.readTermiiSend(false, { message: "ApplicationSenderId not found" }), { ok: false, error: "ApplicationSenderId not found" });

  const at = { SMSMessageData: { Message: "Sent to 1/1 Total Cost: NGN 2.20", Recipients: [{ statusCode: 101, number: "+2348012345678", status: "Success", cost: "NGN 2.20", messageId: "ATXid_abc" }] } };
  assert.deepEqual(sms.readAfricasTalkingSend(true, at), { ok: true, externalId: "ATXid_abc" });
  const atFail = { SMSMessageData: { Message: "Sent to 0/1", Recipients: [{ statusCode: 405, number: "+234", status: "InsufficientBalance", messageId: "None" }] } };
  assert.deepEqual(sms.readAfricasTalkingSend(true, atFail), { ok: false, error: "Africa's Talking: InsufficientBalance" });
  assert.equal(sms.readAfricasTalkingSend(false, {}).ok, false);

  assert.deepEqual(sms.readSendchampSend(true, { code: 200, status: "success", message: "ok", data: { id: "sc_77", status: "sent" } }), { ok: true, externalId: "sc_77" });
  assert.deepEqual(sms.readSendchampSend(false, { status: "error", message: "Sender name not approved" }), { ok: false, error: "Sender name not approved" });

  assert.deepEqual(sms.readAfricasTalkingCall(true, { entries: [{ phoneNumber: "+2348012345678", status: "Queued", sessionId: "ATVId_1" }], errorMessage: "None" }), { ok: true, externalId: "ATVId_1" });
  assert.equal(sms.readAfricasTalkingCall(true, { entries: [{ status: "InvalidPhoneNumber" }], errorMessage: "None" }).error, "Africa's Talking couldn't start the call: InvalidPhoneNumber");
});

test("Africa's Talking voice: callbacks and call-handling XML", () => {
  const live = sms.parseAfricasTalkingVoice({ isActive: "1", sessionId: "ATVId_5", direction: "Inbound", callerNumber: "+2348012345678", destinationNumber: "+2342010000000" });
  assert.deepEqual([live.active, live.direction, live.callerNumber, live.recordingUrl], [true, "inbound", "+2348012345678", null]);
  const done = sms.parseAfricasTalkingVoice({ isActive: "0", sessionId: "ATVId_5", direction: "Outbound", durationInSeconds: "75", dialDurationInSeconds: "61", recordingUrl: "https://voice.africastalking.com/rec/1.mp3", hangupCause: "NORMAL_CLEARING", clientRequestId: "conv_1" });
  assert.deepEqual([done.active, done.direction, done.durationSeconds, done.dialDurationSeconds, done.clientRequestId], [false, "outbound", 75, 61, "conv_1"]);
  assert.equal(sms.parseAfricasTalkingVoice({ isActive: "1" }), null, "no session, no event");

  const vm = sms.incomingCallXml({ storeName: "Ada & Co <Lagos>", forwardTo: null, callbackUrl: "https://a/x?channel=1&token=t&step=recording" });
  assert.match(vm, /^<\?xml version="1.0" encoding="UTF-8"\?><Response><Record /);
  assert.match(vm, /Ada &amp; Co &lt;Lagos&gt;/, "the store name is escaped");
  assert.match(vm, /callbackUrl="https:\/\/a\/x\?channel=1&amp;token=t&amp;step=recording"/);
  assert.match(vm, /maxLength="120"/);
  const forward = sms.incomingCallXml({ storeName: "Ada", forwardTo: "+2348012345678", callbackUrl: "r" });
  assert.match(forward, /<Dial phoneNumbers="\+2348012345678" sequential="true" maxDuration="3600"\/>/);
  assert.match(sms.bridgeCallXml("+2348099999999"), /<Say>Connecting your call.<\/Say><Dial phoneNumbers="\+2348099999999"/);
  assert.match(sms.sayXml("A & B"), /<Say>A &amp; B<\/Say>/);
  assert.equal(sms.formatDuration(61), "1m 1s");
  assert.equal(sms.formatDuration(9), "9s");
});

test("numbers: E.164 for phones, digits for shortcodes", () => {
  assert.equal(sms.e164("0801 234 5678"), "+2348012345678");
  assert.equal(sms.e164("sms:+2348012345678"), "+2348012345678");
  assert.equal(sms.e164("12"), null);
  assert.equal(sms.storeNumber("33012"), "33012");
  assert.equal(sms.storeNumber("+234 901 234 5678"), "+2349012345678");
  assert.equal(sms.storeNumber("ab"), null);
});

test("Twilio is gone from the app: no routes, no adapter, no copy", () => {
  assert.equal(existsSync(new URL("../src/app/api/webhooks/twilio", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/lib/inbox/channels/twilio.ts", import.meta.url)), false);
  for (const file of ["../src/app/home/inbox/channels/ChannelsClient.tsx", "../src/app/home/inbox/settings/InboxSettingsClient.tsx", "../src/lib/marketing/channels.ts", "../src/lib/inbox/connect.ts"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /twilio/i, file);
  }
});
