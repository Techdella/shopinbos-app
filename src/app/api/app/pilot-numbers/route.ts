import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { appFromHeaders } from "@/lib/feature-switches.server";
import { pilotNumbersOnFor, storePilotNumbers } from "@/lib/pilot-numbers.server";
import { APP_VERSION_HEADER } from "@shared/feature-switches";

export const dynamic = "force-dynamic";

// The shop's Pilot numbers (shared/pilot-numbers.ts), for the phone's pilot-numbers screen: only when a pilot feature
// (post_to_plug, resell, notify_followers, plug_follow_card) is on for this account on the app asking.
//   GET → { data: { plugLive, plugJoins, visits, followers, buyers, resell, videos, videoViews } }
export const GET = withSeller(async (req, { user }) => {
  const version = req.headers.get(APP_VERSION_HEADER)?.trim().slice(0, 32) || null;
  if (!(await pilotNumbersOnFor(user.id, appFromHeaders(req.headers), version))) return apiError("NOT_FOUND", "Pilot numbers aren't on for your shop.", 404);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await storePilotNumbers(store.id));
});
