import "server-only";
import { GRAPH_URL, providerError, readJson, type SendInput, type SendResult } from "./types";

// Facebook Messenger and Instagram DMs through the Messenger Platform (Graph API). Credentials:
// pageAccessToken (a Page token with pages_messaging, plus instagram_manage_messages for Instagram),
// pageId, igAccountId (Instagram only), optional appSecret (else META_APP_SECRET).
// Standard messaging allows replies within 24 hours of the customer's last message.

export async function sendMetaMessage(input: SendInput): Promise<SendResult> {
  const { pageAccessToken } = input.credentials;
  if (!pageAccessToken) return { ok: false, error: "This channel isn't connected." };
  const res = await fetch(`${GRAPH_URL}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: input.to }, messaging_type: "RESPONSE", message: { text: input.body } }),
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Meta. Try again." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "Meta didn't accept the message.") };
  return { ok: true, externalId: typeof json.message_id === "string" ? json.message_id : null };
}

/** Checks the Page token; for Instagram also that the Page is linked to the given Instagram account. */
export async function verifyMetaPage(credentials: Record<string, string>, instagram: boolean): Promise<{ ok: true; displayName: string; pageId: string; igAccountId?: string } | { ok: false; error: string }> {
  const fields = instagram ? "id,name,instagram_business_account{id,username}" : "id,name";
  const res = await fetch(`${GRAPH_URL}/me?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(credentials.pageAccessToken)}`, { signal: AbortSignal.timeout(15_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Meta to check the token." };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "Meta rejected the Page token.") };
  const pageId = String(json.id ?? "");
  if (!instagram) return { ok: true, displayName: String(json.name ?? "Facebook Page"), pageId };
  const ig = json.instagram_business_account as { id?: string; username?: string } | undefined;
  if (!ig?.id) return { ok: false, error: "This Page has no Instagram professional account linked. Link one in Meta Business Suite first." };
  return { ok: true, displayName: ig.username ? `@${ig.username}` : "Instagram account", pageId, igAccountId: ig.id };
}

/** Subscribes the Page to the app's messaging webhooks (needs the Page token). */
export async function subscribePage(pageId: string, pageAccessToken: string) {
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) return { ok: false as const, error: "Couldn't reach Meta to subscribe the Page." };
  const json = await readJson(res);
  return res.ok ? { ok: true as const } : { ok: false as const, error: providerError(json, "Meta didn't subscribe the Page to messages.") };
}

/** The customer's name for a new Messenger/Instagram conversation (best effort; needs the profile permission). */
export async function fetchMetaProfile(id: string, pageAccessToken: string, instagram: boolean): Promise<{ name: string | null; handle: string | null }> {
  const fields = instagram ? "name,username" : "first_name,last_name";
  const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(id)}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!res || !res.ok) return { name: null, handle: null };
  const json = await readJson(res);
  if (instagram) return { name: typeof json.name === "string" ? json.name : null, handle: typeof json.username === "string" ? `@${json.username}` : null };
  const name = [json.first_name, json.last_name].filter((part) => typeof part === "string" && part).join(" ");
  return { name: name || null, handle: null };
}
