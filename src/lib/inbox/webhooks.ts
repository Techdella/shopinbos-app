import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";

// Shared bits for the provider webhook routes under /api/webhooks/*.

export async function formParams(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) params[key] = value;
  return params;
}

/** Constant-time string compare (hashing first so different lengths don't leak through timing). */
function sameSecret(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Meta's GET handshake: echo hub.challenge when the verify token matches the platform's or a connected channel's. */
export async function metaVerifyHandshake(req: NextRequest, channels: string[]) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token") ?? "";
  // Only digits are echoed back, so the handshake can't be used to reflect content.
  const challenge = (req.nextUrl.searchParams.get("hub.challenge") ?? "").replace(/\D/g, "").slice(0, 64);
  if (mode !== "subscribe" || !token) return new NextResponse("Forbidden", { status: 403 });
  const platform = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const ok = (platform && sameSecret(token, platform)) || (await db.inboxChannel.findFirst({ where: { webhookSecret: token, channel: { in: channels } }, select: { id: true } }));
  return ok ? new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } }) : new NextResponse("Forbidden", { status: 403 });
}
