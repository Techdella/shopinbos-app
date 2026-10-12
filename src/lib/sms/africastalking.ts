import "server-only";

import { call } from "./http";
import { e164, parseAfricasTalkingInbound, parseAfricasTalkingStatus, readAfricasTalkingCall, readAfricasTalkingSend, type SendOutcome } from "./pure";
import type { SmsCredentials, SmsProvider, SmsSendInput, VerifyOutcome } from "./types";

// Africa's Talking (https://developers.africastalking.com). Requests carry the app's API key in an "apiKey"
// header and the app username in the body; the username "sandbox" uses the sandbox hosts.
//   SMS    POST /version1/messaging (form): username, to (comma list), message, from (sender ID or shortcode)
//   Voice  POST https://voice.africastalking.com/call (form): username, from (AT virtual number), to, clientRequestId
// Incoming messages, delivery reports and voice events are form POSTs to callback URLs set in the AT dashboard
// (there is no API to set them, and no signature: our URLs carry a secret token).

const sandbox = (credentials: SmsCredentials) => credentials.username === "sandbox";
const apiHost = (credentials: SmsCredentials) => (sandbox(credentials) ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com");
const voiceHost = (credentials: SmsCredentials) => (sandbox(credentials) ? "https://voice.sandbox.africastalking.com" : "https://voice.africastalking.com");

function headers(credentials: SmsCredentials) {
  return { apiKey: credentials.apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" };
}

async function send(credentials: SmsCredentials, input: SmsSendInput): Promise<SendOutcome> {
  if (!credentials.apiKey || !credentials.username) return { ok: false, error: "Africa's Talking isn't set up (username and API key)." };
  const to = input.to.map((n) => e164(n) ?? n).filter(Boolean);
  if (!to.length) return { ok: false, error: "No phone number to send to." };
  const form = new URLSearchParams({ username: credentials.username, to: to.join(","), message: input.body });
  // Replies only come back when sending from the store's shortcode; a sender ID is one-way.
  const from = credentials.senderId || credentials.phoneNumber;
  if (from) form.set("from", from);
  if (to.length > 1) form.set("enqueue", "1");
  const res = await call(`${apiHost(credentials)}/version1/messaging`, { method: "POST", headers: headers(credentials), body: form.toString() });
  if ("error" in res) return { ok: false, error: "Couldn't reach Africa's Talking. Try again." };
  return readAfricasTalkingSend(res.ok, res.json);
}

async function verify(credentials: SmsCredentials): Promise<VerifyOutcome> {
  if (!credentials.username) return { ok: false, error: "Enter your Africa's Talking app username." };
  const res = await call(`${apiHost(credentials)}/version1/user?username=${encodeURIComponent(credentials.username)}`, { headers: { apiKey: credentials.apiKey, Accept: "application/json" } });
  if ("error" in res) return { ok: false, error: "Couldn't reach Africa's Talking to check the API key." };
  const user = (res.json.UserData ?? {}) as Record<string, unknown>;
  if (!res.ok || user.balance === undefined) return { ok: false, error: "Africa's Talking rejected the username or API key. Check both in your AT app's Settings → API Key." };
  return { ok: true, detail: credentials.username };
}

/**
 * Click-to-call: AT rings the seller's phone from the store's AT number. When they pick up, AT asks the number's
 * voice callback what to do, and /api/webhooks/voice/africastalking answers with a Dial to the customer.
 * Returns the AT sessionId, which the callback uses to find the call.
 */
export async function startCall(credentials: SmsCredentials, input: { to: string; clientRequestId: string }): Promise<SendOutcome> {
  if (!credentials.apiKey || !credentials.username || !credentials.phoneNumber) return { ok: false, error: "Phone calls aren't connected." };
  const form = new URLSearchParams({ username: credentials.username, from: credentials.phoneNumber, to: input.to, clientRequestId: input.clientRequestId });
  const res = await call(`${voiceHost(credentials)}/call`, { method: "POST", headers: headers(credentials), body: form.toString() });
  if ("error" in res) return { ok: false, error: "Couldn't reach Africa's Talking. Try again." };
  return readAfricasTalkingCall(res.ok, res.json);
}

export const africastalking: SmsProvider = {
  key: "africastalking",
  label: "Africa's Talking",
  twoWay: true,
  send,
  verify,
  parseInbound: parseAfricasTalkingInbound,
  parseStatus: parseAfricasTalkingStatus,
  verifySignature: () => null,
};
