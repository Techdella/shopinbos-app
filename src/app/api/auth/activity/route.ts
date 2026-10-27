import { db } from "@/lib/db/client";
import { idleTimeoutMs } from "@/lib/auth/idle";
import { currentSession, getAuthRouteClient } from "@/lib/auth/session.server";
import { authError, authJson } from "@/lib/auth/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The heartbeat a portal page sends while someone is using it (components/auth/IdleSignOut.tsx). The proxy has already
// checked the session isn't idle and moved the "last active" cookie on (src/lib/auth/idle.ts); this only tells the
// page how long it may sit unused before it signs itself out.

export async function POST() {
  const session = await currentSession(await getAuthRouteClient()).catch(() => null);
  if (!session) return authError("UNAUTHORIZED", "Log in again.", 401);
  const user = await db.user.findUnique({ where: { supabaseId: session.user.id }, select: { role: true } }).catch(() => null);
  return authJson({ idleMs: idleTimeoutMs(user?.role, process.env) });
}
