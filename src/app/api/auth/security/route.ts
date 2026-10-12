import { currentSession, getAuthRouteClient } from "@/lib/auth/session.server";
import { recentSecurityActivity } from "@/lib/auth/events";
import { authError, authJson } from "@/lib/auth/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings > Security: how this account signs in, and its recent security activity. */
export async function GET() {
  const supabase = await getAuthRouteClient();
  const session = await currentSession(supabase);
  if (!session) return authError("UNAUTHORIZED", "Authentication required", 401);
  const activity = await recentSecurityActivity(session.user.id);
  return authJson({ email: session.user.email ?? null, phone: session.user.phone ? `+${session.user.phone.replace(/^\+/, "")}` : null, activity });
}
