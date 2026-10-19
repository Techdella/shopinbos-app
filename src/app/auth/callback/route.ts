import { NextRequest, NextResponse } from "next/server";
import type { AuthRole } from "@/lib/brand";
import { roleDestination } from "@/lib/brand";
import { portalLoginPath, portalOnboardingPath, portalSignupPath } from "@/lib/portal-routes";
import { alignRoleMetadata, appUserInputFromSupabaseUser, ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { asAccountRole, asSignupRole, withPortalNote } from "@/lib/auth/role-rules";
import { getAuthRouteClient, recoveryCookieOptions, recoveryMarker, RECOVERY_COOKIE } from "@/lib/auth/session.server";
import { decodeAccessToken } from "@/lib/auth/session-claims";
import { safeNextPath } from "@/lib/auth/route-access";
import { deviceCookie, recordSignIn } from "@/lib/auth/events";

const RESET_PATH = "/reset-password";

function roleFromValue(value: string | null): AuthRole {
  if (value === "supplier" || value === "logistics_partner" || value === "admin" || value === "seller") {
    return value;
  }
  return "seller";
}

function redirectUrl(request: NextRequest, path: string, error?: string) {
  const url = new URL(path, request.nextUrl.origin);
  if (error) {
    url.searchParams.set("error", error);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const role = roleFromValue(request.nextUrl.searchParams.get("role"));
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const destination = next ?? portalOnboardingPath(role);
  const code = request.nextUrl.searchParams.get("code");
  const isReset = next === RESET_PATH;

  if (!code) {
    return NextResponse.redirect(redirectUrl(request, isReset ? RESET_PATH : portalLoginPath(role), isReset ? "link_expired" : "missing_confirmation_code"));
  }

  const supabase = await getAuthRouteClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    // Reset codes work once: a second click lands on the reset page's "link expired" screen.
    return NextResponse.redirect(redirectUrl(request, isReset ? RESET_PATH : portalLoginPath(role), isReset ? "link_expired" : "confirmation_failed"));
  }

  // Google (and email links) say which portal's page they came from (?role=). That only decides the role of a
  // brand-new account; an existing account keeps its own role (src/lib/auth/role-rules.ts).
  const metadataRole = asAccountRole(data.user.user_metadata?.role);
  const appUser = await ensureAppUserForSupabaseUser({
    ...appUserInputFromSupabaseUser(data.user),
    role: isReset ? metadataRole ?? role : role,
  });
  await alignRoleMetadata(data.user.id, data.user.user_metadata?.role, appUser.role);

  let landing = destination;
  if (!isReset && appUser.role !== role) {
    const pageRole = asSignupRole(role);
    if (request.nextUrl.searchParams.get("mode") === "signup" && pageRole) {
      // Signed up on the supplier page with an email that already has a seller account (or any other mix): say so
      // on that sign-up page ("This email already has a seller account…") instead of quietly changing anything.
      landing = `${portalSignupPath(pageRole)}?conflict=${appUser.role}&via=email`;
    } else {
      // Logged in on another portal's page: open their own portal, with a note saying why.
      landing = withPortalNote(roleDestination(appUser.role), role);
    }
  }

  const response = NextResponse.redirect(redirectUrl(request, landing));
  response.headers.set("Cache-Control", "private, no-store");
  const claims = decodeAccessToken(data.session?.access_token);

  if (isReset) {
    // Lets /reset-password (and only this session) set a new password without the old one, for an hour.
    if (claims?.session_id) response.cookies.set(RECOVERY_COOKIE, recoveryMarker(claims.session_id), recoveryCookieOptions());
  } else {
    const method = claims?.amr?.[0]?.method ?? data.user.app_metadata?.provider ?? "link";
    const deviceId = await recordSignIn(request, data.user, method === "oauth" ? String(data.user.app_metadata?.provider ?? "oauth") : method);
    const device = deviceCookie(deviceId);
    response.cookies.set(device.name, device.value, device.options);
  }

  return response;
}
