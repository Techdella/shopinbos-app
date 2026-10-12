import "server-only";

import { call } from "./http";
import { parseTermiiInbound, parseTermiiStatus, readTermiiSend, termiiBaseUrl, verifyTermiiSignature, type SendOutcome } from "./pure";
import type { SmsCredentials, SmsProvider, SmsSendInput, VerifyOutcome } from "./types";

// Termii (https://developers.termii.com). Send: POST {base}/api/sms/send (one number) or /api/sms/send/bulk
// (up to 100) with { api_key, to, from, sms, type: "plain", channel: "dnd" | "generic" }. "dnd" reaches numbers
// on Do-Not-Disturb and suits transactional messages; "generic" is promotional, skips DND numbers and is held
// for MTN between 8pm and 8am. Without a sender ID, a store with a Termii number sends from it
// (POST /api/sms/number/send), which is what makes replies possible.
// Delivery reports and inbound messages go to the one webhook URL set in the Termii console.

const BULK_LIMIT = 100;

function base(credentials: SmsCredentials) {
  return termiiBaseUrl(credentials.baseUrl) ?? termiiBaseUrl(null)!;
}

const digits = (to: string) => to.replace(/[^\d]/g, "");

async function send(credentials: SmsCredentials, input: SmsSendInput): Promise<SendOutcome> {
  if (!credentials.apiKey) return { ok: false, error: "Termii isn't set up (no API key)." };
  const to = input.to.map(digits).filter(Boolean);
  if (!to.length) return { ok: false, error: "No phone number to send to." };

  if (!credentials.senderId && credentials.phoneNumber) {
    // Send from the store's Termii number, one recipient at a time (the number API takes a single "to").
    let last: SendOutcome = { ok: false, error: "Termii didn't accept the message." };
    for (const number of to) {
      const res = await call(`${base(credentials)}/api/sms/number/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ api_key: credentials.apiKey, to: number, sms: input.body }),
      });
      if ("error" in res) return { ok: false, error: "Couldn't reach Termii. Try again." };
      last = readTermiiSend(res.ok, res.json);
      if (!last.ok) return last;
    }
    return last;
  }

  const from = credentials.senderId || "Shopinbos";
  const channel = credentials.route === "generic" ? "generic" : "dnd";
  let first: SendOutcome | null = null;
  for (let i = 0; i < to.length; i += BULK_LIMIT) {
    const chunk = to.slice(i, i + BULK_LIMIT);
    const bulk = chunk.length > 1;
    const res = await call(`${base(credentials)}/api/sms/send${bulk ? "/bulk" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_key: credentials.apiKey, to: bulk ? chunk : chunk[0], from, sms: input.body, type: "plain", channel }),
    });
    if ("error" in res) return { ok: false, error: "Couldn't reach Termii. Try again." };
    const outcome = readTermiiSend(res.ok, res.json);
    if (!outcome.ok) return outcome;
    first ??= outcome;
  }
  return first ?? { ok: false, error: "Termii didn't accept the message." };
}

async function verify(credentials: SmsCredentials): Promise<VerifyOutcome> {
  if (termiiBaseUrl(credentials.baseUrl) === null) return { ok: false, error: "The Termii base URL must be your https://….termii.com address from the Termii dashboard." };
  const res = await call(`${base(credentials)}/api/get-balance?api_key=${encodeURIComponent(credentials.apiKey)}`, { headers: { Accept: "application/json" } });
  if ("error" in res) return { ok: false, error: "Couldn't reach Termii to check the API key." };
  if (!res.ok || res.json.balance === undefined) return { ok: false, error: typeof res.json.message === "string" ? `Termii: ${res.json.message}`.slice(0, 300) : "Termii rejected the API key. Copy it again from the Termii dashboard." };
  const user = typeof res.json.user === "string" ? res.json.user : "Termii";
  return { ok: true, detail: user };
}

export const termii: SmsProvider = {
  key: "termii",
  label: "Termii",
  twoWay: true,
  send,
  verify,
  parseInbound: parseTermiiInbound,
  parseStatus: parseTermiiStatus,
  verifySignature(rawBody, headers, credentials) {
    const secret = credentials?.secretKey;
    if (!secret) return null;
    return verifyTermiiSignature(rawBody, headers.get("x-termii-signature"), secret);
  },
};
