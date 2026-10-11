import "server-only";
import { appUrl, providerError, readJson, type SendInput, type SendResult } from "./types";

// Twilio SMS and Voice. Credentials: accountSid, authToken, phoneNumber (E.164, an SMS/voice-capable Twilio number).

function auth(credentials: Record<string, string>) {
  return `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`;
}

async function twilioPost(credentials: Record<string, string>, path: string, form: Record<string, string>) {
  return fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/${path}`, {
    method: "POST",
    headers: { Authorization: auth(credentials), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => error);
}

export async function sendTwilioSms(input: SendInput): Promise<SendResult> {
  const { accountSid, authToken, phoneNumber } = input.credentials;
  if (!accountSid || !authToken || !phoneNumber) return { ok: false, error: "SMS isn't connected." };
  const res = await twilioPost(input.credentials, "Messages.json", {
    To: input.to,
    From: phoneNumber,
    Body: input.body,
    StatusCallback: `${appUrl()}/api/webhooks/twilio/status`,
  });
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Twilio. Try again." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "Twilio didn't accept the message.") };
  return { ok: true, externalId: typeof json.sid === "string" ? json.sid : null };
}

/** Click-to-call: Twilio rings the seller's phone, then bridges them to the customer from the store's number. */
export async function startBridgedCall(credentials: Record<string, string>, input: { sellerPhone: string; customer: string; conversationId: string }): Promise<SendResult> {
  const bridge = new URL(`${appUrl()}/api/webhooks/twilio/voice`);
  bridge.searchParams.set("step", "bridge");
  bridge.searchParams.set("to", input.customer);
  bridge.searchParams.set("conversation", input.conversationId);
  const res = await twilioPost(credentials, "Calls.json", {
    To: input.sellerPhone,
    From: credentials.phoneNumber,
    Url: bridge.toString(),
  });
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Twilio. Try again." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "Twilio couldn't start the call.") };
  return { ok: true, externalId: typeof json.sid === "string" ? json.sid : null };
}

/** Checks the account and that the number belongs to it; returns the number's friendly name. */
export async function verifyTwilio(credentials: Record<string, string>): Promise<{ ok: true; displayName: string; numberSid: string } | { ok: false; error: string }> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(credentials.phoneNumber)}`,
    { headers: { Authorization: auth(credentials) }, signal: AbortSignal.timeout(15_000) },
  ).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Twilio to check the account." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "Twilio rejected the Account SID or Auth Token.") };
  const number = (json.incoming_phone_numbers as Array<{ sid: string; friendly_name?: string; phone_number?: string }> | undefined)?.[0];
  if (!number) return { ok: false, error: "That number isn't in this Twilio account. Use a number you bought in Twilio, in +234… format." };
  return { ok: true, displayName: number.friendly_name || number.phone_number || credentials.phoneNumber, numberSid: number.sid };
}

/** Points the Twilio number's SMS or voice webhook at Shopinbos, so the seller doesn't paste URLs by hand. */
export async function pointTwilioNumber(credentials: Record<string, string>, numberSid: string, kind: "sms" | "voice") {
  const form: Record<string, string> =
    kind === "sms"
      ? { SmsUrl: `${appUrl()}/api/webhooks/twilio/sms`, SmsMethod: "POST" }
      : { VoiceUrl: `${appUrl()}/api/webhooks/twilio/voice?step=incoming`, VoiceMethod: "POST", StatusCallback: `${appUrl()}/api/webhooks/twilio/voice?step=status`, StatusCallbackMethod: "POST" };
  const res = await twilioPost(credentials, `IncomingPhoneNumbers/${encodeURIComponent(numberSid)}.json`, form);
  if (res instanceof Error) return { ok: false as const, error: "Couldn't reach Twilio to set the webhook." };
  const json = await readJson(res);
  return res.ok ? { ok: true as const } : { ok: false as const, error: providerError(json, "Twilio didn't update the number's webhook.") };
}
