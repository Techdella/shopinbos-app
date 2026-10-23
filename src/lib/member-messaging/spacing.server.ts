import "server-only";

import { db } from "@/lib/db/client";
import { SPACING_EXEMPT_KINDS, spacingCheck, type Touch, type TouchChannel } from "./spacing";

// Everything a member got from us in the last 7 days, from every sender's own log, for spacing.ts:
// MemberMessage (tips, journeys, announcements and their WhatsApps), product news, the weekly summary and the
// sellers' setup nudges (kept on the store).

const WEEK = 7 * 86_400_000;

export async function memberTouches(userId: string, now = new Date()): Promise<Touch[]> {
  const since = new Date(now.getTime() - WEEK);
  const [messages, news, summaries, store] = await Promise.all([
    db.memberMessage.findMany({
      where: { userId, status: "sent", sentAt: { gte: since }, channel: { in: ["email", "whatsapp"] }, kind: { notIn: [...SPACING_EXEMPT_KINDS] } },
      select: { channel: true, sentAt: true },
    }),
    db.productNewsRecipient.findMany({ where: { userId, status: "sent", sentAt: { gte: since } }, select: { sentAt: true } }).catch(() => []),
    db.weeklySummaryLog.findMany({ where: { userId, status: "sent", sentAt: { gte: since } }, select: { sentAt: true } }).catch(() => []),
    db.store.findUnique({ where: { userId }, select: { brandSettings: true } }).catch(() => null),
  ]);
  const touches: Touch[] = [
    ...messages.map((row) => ({ channel: row.channel as TouchChannel, at: row.sentAt! })),
    ...news.map((row) => ({ channel: "email" as const, at: row.sentAt! })),
    ...summaries.map((row) => ({ channel: "email" as const, at: row.sentAt! })),
  ];
  const nudges = ((store?.brandSettings as { setup?: { lifecycleEmails?: unknown } } | null)?.setup?.lifecycleEmails ?? []) as unknown[];
  for (const value of Array.isArray(nudges) ? nudges : []) {
    const at = typeof value === "string" ? new Date(value) : null;
    if (at && Number.isFinite(at.getTime()) && at >= since) touches.push({ channel: "email", at });
  }
  return touches;
}

/** May this member get a marketing message on this channel now? */
export async function canContactMember(userId: string, channel: TouchChannel, now = new Date()) {
  return spacingCheck(channel, await memberTouches(userId, now), now);
}
