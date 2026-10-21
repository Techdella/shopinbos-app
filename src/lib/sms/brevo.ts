import "server-only";

import { getPublicEnv } from "@/lib/env";
import { call } from "./http";
import { e164, parseBrevoStatus, providerWebhookUrl, readBrevoSend, type SendOutcome } from "./pure";
import type { SmsCredentials, SmsProvider, SmsSendInput, VerifyOutcome } from "./types";

// Brevo transactional SMS (https://developers.brevo.com/docs/transactional-sms-endpoints).
// POST https://api.brevo.com/v3/transactionalSMS/send with the api-key header and
// { sender, recipient: "2348012345678", content, type: "transactional", webUrl? }. One recipient per call, so a
// list is sent one by one. The sender is up to 11 letters or 15 digits (Nigerian networks want it registered with
// Brevo first). Credits are bought in Brevo › SMS. One-way: no inbound SMS. When SMS_WEBHOOK_SECRET is set, each
// message carries webUrl so Brevo posts its delivery events to /api/webhooks/sms/brevo?token=….

const BASE = "https://api.brevo.com/v3";

function headers(credentials: SmsCredentials) {
  return { "api-key": credentials.apiKey, "Content-Type": "application/json", Accept: "application/json" };
}

function statusUrl() {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (!secret) return undefined;
  try {
    return providerWebhookUrl(getPublicEnv().appUrl, "sms", "brevo", null, secret);
  } catch {
    return undefined;
  }
}

async function send(credentials: SmsCredentials, input: SmsSendInput): Promise<SendOutcome> {
  if (!credentials.apiKey) return { ok: false, error: "Brevo isn't set up (no API key)." };
  if (!credentials.senderId) return { ok: false, error: "Brevo needs a sender name (BREVO_SMS_SENDER)." };
  const to = input.to.map((n) => (e164(n) ?? "").replace(/^\+/, "")).filter(Boolean);
  if (!to.length) return { ok: false, error: "No phone number to send to." };
  const webUrl = statusUrl();
  let first: SendOutcome | null = null;
  for (const recipient of to) {
    const res = await call(`${BASE}/transactionalSMS/send`, {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({
        sender: credentials.senderId,
        recipient,
        content: input.body,
        type: credentials.route === "marketing" ? "marketing" : "transactional",
        unicodeEnabled: /[^\u0000-\u007f]/.test(input.body),
        ...(webUrl ? { webUrl } : {}),
      }),
    });
    const outcome: SendOutcome = "error" in res ? { ok: false, error: "Couldn't reach Brevo. Try again." } : readBrevoSend(res.ok, res.json);
    // A one-number send (OTPs, order texts) reports its own result; for a list, the first success stands.
    if (!first || (!first.ok && outcome.ok)) first = outcome;
    if (to.length === 1) return outcome;
  }
  return first ?? { ok: false, error: "No phone number to send to." };
}

async function verify(credentials: SmsCredentials): Promise<VerifyOutcome> {
  const res = await call(`${BASE}/account`, { headers: headers(credentials) });
  if ("error" in res) return { ok: false, error: "Couldn't reach Brevo to check the API key." };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "Brevo rejected the API key. Create one in Brevo › SMTP & API › API keys." };
  return { ok: true, detail: credentials.senderId || "Brevo" };
}

export const brevo: SmsProvider = {
  key: "brevo",
  label: "Brevo",
  twoWay: false,
  send,
  verify,
  parseInbound: () => null,
  parseStatus: parseBrevoStatus,
  verifySignature: () => null,
};
