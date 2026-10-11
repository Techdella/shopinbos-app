import "server-only";
import { GRAPH_URL, providerError, readJson, type SendInput, type SendResult } from "./types";

// WhatsApp Cloud API (Meta). Credentials: accessToken (a System User token with whatsapp_business_messaging),
// phoneNumberId, optional appSecret (else META_APP_SECRET) for webhook signatures.
// Free-form replies only reach the customer within 24 hours of their last message; Meta rejects them after that.

export async function sendWhatsApp(input: SendInput): Promise<SendResult> {
  const { accessToken, phoneNumberId } = input.credentials;
  if (!accessToken || !phoneNumberId) return { ok: false, error: "WhatsApp isn't connected." };
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to.replace(/^\+/, ""), type: "text", text: { preview_url: true, body: input.body } }),
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach WhatsApp. Try again." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "WhatsApp didn't accept the message.") };
  const id = (json.messages as Array<{ id?: string }> | undefined)?.[0]?.id ?? null;
  return { ok: true, externalId: id };
}

/** Checks a token and phone number id before saving them; returns the number's display name. */
export async function verifyWhatsApp(credentials: Record<string, string>): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> {
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Meta to check the token." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "Meta rejected the token or phone number id.") };
  return { ok: true, displayName: [json.verified_name, json.display_phone_number].filter(Boolean).join(" · ") || "WhatsApp number" };
}
