import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { riderNotifyPrefs } from "@/lib/notifications/notify.server";
import { mergeRiderNotifyPrefs } from "@shared/message-notifications";

export const dynamic = "force-dynamic";

// Riders app › Me › Notifications (phone and web), X-Rider-Token header. Riders have no account, so the settings
// live on the rider (LogisticsTeamMember.notifyPrefs, shared/message-notifications.ts):
//   GET → { company, shops, quiet: { enabled, start, end } }   which messages buzz the phone, and quiet hours (Lagos)
//   PUT { company?, shops?, quiet?: { enabled?, start?, end? } } → the same, saved

const LINK_ERROR = "This link no longer works. Ask your dispatcher for a new one.";

async function session(req: NextRequest) {
  const found = await riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
  if (found.ok) return { ok: true as const, riderId: found.rider.id };
  return { ok: false as const, response: found.reason === "limited" ? apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429) : apiError("UNAUTHORIZED", LINK_ERROR, 401) };
}

export async function GET(req: NextRequest) {
  const rider = await session(req);
  if (!rider.ok) return rider.response;
  return ok(await riderNotifyPrefs(rider.riderId));
}

export async function PUT(req: NextRequest) {
  const rider = await session(req);
  if (!rider.ok) return rider.response;
  const next = mergeRiderNotifyPrefs(await riderNotifyPrefs(rider.riderId), await req.json().catch(() => null));
  if (!next) return apiError("BAD_REQUEST", "Check your choices.");
  try {
    await db.logisticsTeamMember.update({ where: { id: rider.riderId }, data: { notifyPrefs: next as unknown as Prisma.InputJsonValue }, select: { id: true } });
  } catch {
    return apiError("UNAVAILABLE", "Notification settings aren't ready yet. Try again later.", 503);
  }
  return ok(next);
}
