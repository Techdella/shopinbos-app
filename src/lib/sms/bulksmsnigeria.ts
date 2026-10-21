import "server-only";

import { call } from "./http";
import { e164, readBulkSmsNigeriaSend, type SendOutcome } from "./pure";
import type { SmsCredentials, SmsProvider, SmsSendInput, VerifyOutcome } from "./types";

// BulkSMS Nigeria (https://www.bulksmsnigeria.com/api). POST https://www.bulksmsnigeria.com/api/v2/sms with a
// Bearer API token and { from, to: "2348…,2348…", body, gateway? }. The sender ID must be registered and approved
// in the dashboard (Sender IDs). gateway (BULKSMSNIGERIA_GATEWAY) is optional and left to the account's default
// when unset. One-way, and no documented delivery webhook, so messages stay "sent".

const BASE = "https://www.bulksmsnigeria.com/api";

function headers(credentials: SmsCredentials) {
  return { Authorization: `Bearer ${credentials.apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function send(credentials: SmsCredentials, input: SmsSendInput): Promise<SendOutcome> {
  if (!credentials.apiKey) return { ok: false, error: "BulkSMS Nigeria isn't set up (no API token)." };
  if (!credentials.senderId) return { ok: false, error: "BulkSMS Nigeria needs an approved sender ID (BULKSMSNIGERIA_SENDER_ID)." };
  const to = input.to.map((n) => (e164(n) ?? "").replace(/^\+/, "")).filter(Boolean);
  if (!to.length) return { ok: false, error: "No phone number to send to." };
  const res = await call(`${BASE}/v2/sms`, {
    method: "POST",
    headers: headers(credentials),
    body: JSON.stringify({ from: credentials.senderId, to: to.join(","), body: input.body, ...(credentials.route ? { gateway: credentials.route } : {}) }),
  });
  if ("error" in res) return { ok: false, error: "Couldn't reach BulkSMS Nigeria. Try again." };
  return readBulkSmsNigeriaSend(res.ok, res.json);
}

async function verify(credentials: SmsCredentials): Promise<VerifyOutcome> {
  const res = await call(`${BASE}/wallet/balance`, { headers: headers(credentials) });
  if ("error" in res) return { ok: false, error: "Couldn't reach BulkSMS Nigeria to check the API token." };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "BulkSMS Nigeria rejected the API token. Create one in your dashboard › API tokens." };
  return { ok: true, detail: credentials.senderId || "BulkSMS Nigeria" };
}

export const bulksmsnigeria: SmsProvider = {
  key: "bulksmsnigeria",
  label: "BulkSMS Nigeria",
  twoWay: false,
  send,
  verify,
  parseInbound: () => null,
  parseStatus: () => null,
  verifySignature: () => null,
};
