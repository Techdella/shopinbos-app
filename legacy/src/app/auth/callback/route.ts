import { NextRequest, NextResponse } from "next/server";
import type { AuthRole } from "@/lib/brand";
import { portalLoginPath, portalOnboardingPath } from "@/lib/portal-routes";
import { appUserInputFromSupabaseUser, ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import intentRouting from "@/lib/intent-routing";

const { sanitizeNextPath } = intentRouting;

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
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"), request.nextUrl.origin);
  const destination = next ?? portalOnboardingPath(role);
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(redirectUrl(request, portalLoginPath(role), "missing_confirmation_code"));
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(redirectUrl(request, portalLoginPath(role), "confirmation_failed"));
  }

  await ensureAppUserForSupabaseUser({
    ...appUserInputFromSupabaseUser(data.user),
    role,
  });

  return NextResponse.redirect(redirectUrl(request, destination));
}
