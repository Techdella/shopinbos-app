import "server-only";

import { call } from "./http";
import { e164, parseSendchampStatus, readSendchampSend, type SendOutcome } from "./pure";
import type { SmsCredentials, SmsProvider, SmsSendInput, VerifyOutcome } from "./types";

// Sendchamp (https://docs.sendchamp.com). POST https://api.sendchamp.com/api/v1/sms/send with a Bearer key and
// { to: [...], message, sender_name, route: "dnd" | "non_dnd" | "international" }. Sender names are requested in
// the dashboard ("Sendchamp" works until one is approved). One-way: Sendchamp has no inbound SMS, so customers
// can't text back. Delivery reports go to the webhook set in the dashboard (no documented signature).

const BASE = "https://api.sendchamp.com/api/v1";

function headers(credentials: SmsCredentials) {
  return { Authorization: `Bearer ${credentials.apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function send(credentials: SmsCredentials, input: SmsSendInput): Promise<SendOutcome> {
  if (!credentials.apiKey) return { ok: false, error: "Sendchamp isn't set up (no API key)." };
  const to = input.to.map((n) => (e164(n) ?? n).replace(/^\+/, "")).filter(Boolean);
  if (!to.length) return { ok: false, error: "No phone number to send to." };
  const route = ["dnd", "non_dnd", "international"].includes(credentials.route ?? "") ? credentials.route : "dnd";
  const res = await call(`${BASE}/sms/send`, {
    method: "POST",
    headers: headers(credentials),
    body: JSON.stringify({ to, message: input.body, sender_name: credentials.senderId || "Sendchamp", route }),
  });
  if ("error" in res) return { ok: false, error: "Couldn't reach Sendchamp. Try again." };
  return readSendchampSend(res.ok, res.json);
}

async function verify(credentials: SmsCredentials): Promise<VerifyOutcome> {
  const res = await call(`${BASE}/wallet/wallet_balance`, { headers: headers(credentials) });
  if ("error" in res) return { ok: false, error: "Couldn't reach Sendchamp to check the API key." };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "Sendchamp rejected the API key. Copy the public access key from Account → API Keys & Webhooks." };
  // Other failures (an endpoint change) don't prove the key is wrong; the first send will tell.
  return { ok: true, detail: credentials.senderId || "Sendchamp" };
}

export const sendchamp: SmsProvider = {
  key: "sendchamp",
  label: "Sendchamp",
  twoWay: false,
  send,
  verify,
  parseInbound: () => null,
  parseStatus: parseSendchampStatus,
  verifySignature: () => null,
};
