import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { appLockMs, idleTimeoutMs } from "@/lib/auth/idle";
import { bearerSessionExpired, verifyJWT } from "@/lib/auth/middleware";
import { currentSession, getAuthRouteClient } from "@/lib/auth/session.server";
import { authError, authJson } from "@/lib/auth/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The heartbeat a portal page sends while someone is using it (components/auth/IdleSignOut.tsx), and the phone app's
// session check on launch and resume (apps/mobile/src/components/SessionGuard.tsx, with its Bearer token). For a
// browser, the proxy has already checked the session isn't idle and moved the "last active" cookie on
// (src/lib/auth/idle.ts). The answer says how long the page may sit unused (idleMs), how long the app may stay away
// before it locks (appLockMs), and whether the person has confirmed they're 18 or older (src/lib/auth/age.ts).

async function supabaseIdFrom(request: NextRequest): Promise<string | "expired" | null> {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (bearer) {
    const claims = await verifyJWT(bearer);
    if (!claims) return null;
    return bearerSessionExpired(bearer, claims.sub) ? "expired" : claims.sub;
  }
  const session = await currentSession(await getAuthRouteClient()).catch(() => null);
  return session?.user.id ?? null;
}

export async function POST(request: NextRequest) {
  const supabaseId = await supabaseIdFrom(request);
  if (supabaseId === "expired") return authError("SESSION_EXPIRED", "Your session has ended. Log in again.", 401);
  if (!supabaseId) return authError("UNAUTHORIZED", "Log in again.", 401);
  const user = await db.user.findUnique({ where: { supabaseId }, select: { role: true, preferences: true } }).catch(() => null);
  const preferences = user?.preferences && typeof user.preferences === "object" && !Array.isArray(user.preferences) ? (user.preferences as Record<string, unknown>) : {};
  return authJson({
    idleMs: idleTimeoutMs(user?.role, process.env),
    appLockMs: appLockMs(process.env),
    // No account row yet (it's being made): don't ask.
    ageConfirmed: !user || Boolean(preferences.ageConfirmedAt),
  });
}
