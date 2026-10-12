import { NextRequest } from "next/server";
import { currentSession, getAuthRouteClient, RECOVERY_COOKIE } from "@/lib/auth/session.server";
import { logAuthEvent } from "@/lib/auth/events";
import { authJson } from "@/lib/auth/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signs out this browser ("local") or every device on the account ("global": all refresh tokens are revoked,
// and pages and APIs stop accepting the old sessions on their next check). Clears the session cookies.

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { scope?: string } | null;
  const scope = body?.scope === "global" ? "global" : "local";
  const supabase = await getAuthRouteClient();
  const session = await currentSession(supabase).catch(() => null);
  await supabase.auth.signOut({ scope }).catch(() => null);
  if (session) await logAuthEvent(request, { type: scope === "global" ? "logout_all" : "logout", supabaseId: session.user.id });
  const response = authJson({ signedOut: true, scope });
  response.cookies.set(RECOVERY_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
