// The contract every outbound channel adapter follows.

export interface SendInput {
  /** The conversation's external thread id: a phone number, PSID/IGSID, chat id or email address. */
  to: string;
  body: string;
  subject?: string | null;
  store: { id: string; name: string; slug: string };
  credentials: Record<string, string>;
  externalId?: string | null;
  /** WhatsApp only: an interactive list or reply-button message (body is then the inbox's text version). */
  interactive?: Record<string, unknown> | null;
}

/** `meta`: details kept on the sent message (the Gmail thread id, so later emails stay in one thread). */
export type SendResult = { ok: true; externalId: string | null; meta?: Record<string, string | null> } | { ok: false; error: string };

export const GRAPH_VERSION = "v21.0";
export const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com").replace(/\/$/, "");
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** The human part of a provider error body (Meta: error.message, SMS providers: message, Telegram: description). */
export function providerError(json: Record<string, unknown>, fallback: string) {
  const error = json.error as Record<string, unknown> | undefined;
  const message = (error && typeof error.message === "string" && error.message) || (typeof json.message === "string" && json.message) || (typeof json.description === "string" && json.description);
  return (message || fallback).slice(0, 300);
}
