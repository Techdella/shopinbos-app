import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { appUrl } from "./channels/types";

// Shared bits for the provider webhook routes under /api/webhooks/*.

/** Twilio signs the exact URL it called. Behind a proxy req.url can differ, so check both spellings. */
export function signedUrls(req: NextRequest) {
  const external = `${appUrl()}${req.nextUrl.pathname}${req.nextUrl.search}`;
  return Array.from(new Set([external, req.url]));
}

export async function formParams(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) params[key] = value;
  return params;
}

export function twiml(xml: string, status = 200) {
  return new NextResponse(xml, { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

/** Meta's GET handshake: echo hub.challenge when the verify token matches the platform's or a connected channel's. */
export async function metaVerifyHandshake(req: NextRequest, channels: string[]) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = req.nextUrl.searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe" || !token) return new NextResponse("Forbidden", { status: 403 });
  const platform = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const ok = (platform && token === platform) || (await db.inboxChannel.findFirst({ where: { webhookSecret: token, channel: { in: channels } }, select: { id: true } }));
  return ok ? new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } }) : new NextResponse("Forbidden", { status: 403 });
}
