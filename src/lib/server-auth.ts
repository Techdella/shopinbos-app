import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { appUserInputFromSupabaseUser, ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { loginRedirectPath } from "@/lib/auth/route-access";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { portalDashboardPath } from "@/lib/portal-routes";
import { recordActivity } from "@/lib/platform-analytics/activity.server";
import type { AuthUser, Role } from "@/lib/auth/types";

/** Set by src/proxy.ts on every page request so server code can send people back after sign-in. */
export const REQUEST_PATH_HEADER = "x-shopinbos-path";

const USER_SELECT = {
  id: true,
  supabaseId: true,
  email: true,
  role: true,
  name: true,
  avatarUrl: true,
  phone: true,
  city: true,
  country: true,
} as const;

export async function getCurrentAppUser(options?: { redirectTo?: string; expectedRole?: Role }): Promise<AuthUser | null> {
  let user: AuthUser | null = null;
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (!error && data.user) {
      const u = data.user;
      user = await db.user.findUnique({ where: { supabaseId: u.id }, select: USER_SELECT });

      if (!user) {
        const ensured = await ensureAppUserForSupabaseUser({
          ...appUserInputFromSupabaseUser(u),
          role: appUserInputFromSupabaseUser(u).role ?? options?.expectedRole,
        });
        user = await db.user.findUnique({ where: { id: ensured.id }, select: USER_SELECT });
      }
    }
  } catch {
    user = null;
  }

  if (user) recordActivity(user);
  if (!user && options?.redirectTo) redirect(await withNextPath(options.redirectTo));
  return user;
}

/** "/login" → "/login?next=/home/orders" using the page the proxy saw, so sign-in returns there. */
async function withNextPath(loginPath: string) {
  if (loginPath.includes("?")) return loginPath;
  const requested = (await headers()).get(REQUEST_PATH_HEADER);
  if (!requested) return loginPath;
  const [pathname, search = ""] = requested.split(/(?=\?)/);
  return loginRedirectPath(loginPath, pathname ?? "", search);
}

/**
 * For pages: signed out → the given login page (with ?next=); signed in with another role → their own
 * portal's dashboard (never a login form they're already past).
 */
export async function requireRole(roles: Role[], redirectTo: string): Promise<AuthUser> {
  const user = await getCurrentAppUser({ expectedRole: roles.length === 1 ? roles[0] : undefined });

  if (!user) {
    redirect(await withNextPath(redirectTo));
  }
  if (!roles.includes(user.role)) {
    redirect(portalDashboardPath(user.role));
  }

  return user;
}

/** Any signed-in account, whatever its role. */
export async function requireUser(redirectTo = "/login"): Promise<AuthUser> {
  const user = await getCurrentAppUser();
  if (!user) redirect(await withNextPath(redirectTo));
  return user;
}
