import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { decryptJson } from "@/lib/inbox/crypto";
import { platformCredentials, smsProvider } from "./index";
import { clientIp, ipAllowed, verifyUrlToken, type SmsProviderKey } from "./pure";

// Who is calling /api/webhooks/{sms,voice}/[provider]. Every URL we hand out carries a secret token:
//   ?channel=<InboxChannel id>&token=<its webhookSecret>  a store's own account (pasted in their dashboard)
//   ?token=<SMS_WEBHOOK_SECRET>                          the platform's account (delivery reports only)
// Termii also signs with X-Termii-Signature when a secret key is known; a wrong signature is refused.
// Africa's Talking and Sendchamp don't sign, so the token (plus SMS_WEBHOOK_ALLOWED_IPS when set) is the check.

export type WebhookChannel = { row: { id: string; storeId: string; externalId: string | null }; credentials: Record<string, string> };

export type WebhookAuth = { ok: true; channel: WebhookChannel | null } | { ok: false; response: NextResponse };

const deny = (status: number, text: string): WebhookAuth => ({ ok: false, response: new NextResponse(text, { status }) });

export async function authenticateWebhook(req: NextRequest, kind: "sms" | "voice", provider: SmsProviderKey, rawBody: string): Promise<WebhookAuth> {
  if (!ipAllowed(clientIp(req.headers), process.env.SMS_WEBHOOK_ALLOWED_IPS)) return deny(403, "Forbidden");
  const token = req.nextUrl.searchParams.get("token");
  const channelId = req.nextUrl.searchParams.get("channel");
  const handler = smsProvider(provider)!;

  if (!channelId) {
    if (kind !== "sms") return deny(404, "Unknown channel");
    const signed = handler.verifySignature(rawBody, req.headers, platformCredentials(provider));
    if (signed === true || verifyUrlToken(token, process.env.SMS_WEBHOOK_SECRET)) return { ok: true, channel: null };
    return deny(403, "Invalid token");
  }

  const row = await db.inboxChannel.findUnique({ where: { id: channelId } }).catch(() => null);
  const settings = (row?.settings ?? {}) as { provider?: unknown };
  if (!row || row.channel !== kind || row.status !== "connected" || settings.provider !== provider) return deny(404, "Unknown channel");
  if (!verifyUrlToken(token, row.webhookSecret)) return deny(403, "Invalid token");
  const credentials = decryptJson<Record<string, string>>(row.credentials) ?? {};
  const header = req.headers.get("x-termii-signature");
  if (header && handler.verifySignature(rawBody, req.headers, credentials as never) === false) return deny(403, "Invalid signature");
  return { ok: true, channel: { row: { id: row.id, storeId: row.storeId, externalId: row.externalId }, credentials } };
}
