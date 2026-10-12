import { NextRequest } from "next/server";
import { isValidEmail } from "@shared/phone";
import { getAuthRouteClient } from "@/lib/auth/session.server";
import { consumeAuthLimit } from "@/lib/auth/throttle";
import { clientIp, logAuthEvent } from "@/lib/auth/events";
import { authError, authJson, rateLimited } from "@/lib/auth/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends a password-reset link. Always answers "sent" (unless rate-limited) so it never reveals whether an
// email has an account. The link is single-use and expires (Supabase); /auth/callback turns it into a
// short-lived reset session for /reset-password.

const ROLES = new Set(["seller", "supplier", "logistics_partner", "admin"]);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; role?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!isValidEmail(email)) return authError("BAD_REQUEST", "Enter the email you use for Shopinbos.");
  const role = body?.role && ROLES.has(body.role) ? body.role : "seller";

  const wait = await consumeAuthLimit("passwordReset", clientIp(request), email);
  if (wait) return rateLimited(wait, "reset emails");

  try {
    const supabase = await getAuthRouteClient();
    const callback = new URL("/auth/callback", request.nextUrl.origin);
    callback.searchParams.set("role", role);
    callback.searchParams.set("next", "/reset-password");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback.toString() });
    if (error?.status === 429) return rateLimited(60, "reset emails");
    if (error && (error.status ?? 0) >= 500) {
      return authError("UNAVAILABLE", "We couldn't send the email right now. Please try again shortly.", 503);
    }
    await logAuthEvent(request, { type: "password_reset_requested", detail: error ? { outcome: "not_sent" } : undefined });
  } catch (error) {
    console.error("Password reset request failed", error);
    return authError("UNAVAILABLE", "We couldn't send the email right now. Please try again shortly.", 503);
  }
  return authJson({ sent: true });
}
