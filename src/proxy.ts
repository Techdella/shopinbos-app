import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { appUserInputFromSupabaseUser, ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { getOnboardingDestination } from "@/lib/onboarding-router";
import { portalDashboardPath, portalLoginPath, portalOnboardingPath, portalRoleFromPath } from "@/lib/portal-routes";

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const GUEST_ROUTES = [
  "/login",
  "/signup",
  "/supplier/login",
  "/supplier/signup",
  "/logistics/login",
  "/logistics/signup",
  "/admin/login",
];
const AUTH_ROUTES = ["/home", "/onboarding", "/supplier", "/logistics", "/admin"];
// Public pages that live under a portal prefix and must stay open to guests and other roles.
const PUBLIC_ROUTES = ["/logistics/partners", "/email"];

export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|brand|api/public|s/).*)"],
};

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isKnownAppHost(host: string) {
  return LOCAL_APP_HOSTS.has(host) || host.endsWith(".vercel.app") || host.endsWith(".shopinbos.com");
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

function getLoginPath(pathname: string) {
  return portalLoginPath(portalRoleFromPath(pathname));
}

function getRoleHome(role: string) {
  if (role === "supplier" || role === "logistics_partner" || role === "admin" || role === "seller") {
    return portalDashboardPath(role);
  }
  return portalDashboardPath("seller");
}

function getMetadataPortalRole(role: unknown) {
  return role === "supplier" || role === "logistics_partner" ? role : null;
}

function redirectTo(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname, host } = request.nextUrl;
  let response = NextResponse.next({ request });

  if (!isKnownAppHost(hostnameFromHost(host))) {
    return response;
  }

  if (matchesRoute(pathname, PUBLIC_ROUTES)) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = hasSupabaseAuthCookie(request)
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const authenticated = Boolean(data.user);

  if (matchesRoute(pathname, GUEST_ROUTES)) {
    if (!authenticated || !data.user) return response;

    const appUser = await db.user.findUnique({
      where: { supabaseId: data.user.id },
      select: { id: true, role: true },
    }).catch(() => null);

    if (!appUser) return response;
    const requestedRole = portalRoleFromPath(pathname);
    if (appUser.role !== requestedRole) return response;
    return redirectTo(request, getRoleHome(appUser.role));
  }

  if (!authenticated && matchesRoute(pathname, AUTH_ROUTES)) {
    return redirectTo(request, getLoginPath(pathname));
  }

  if (!authenticated || !data.user) {
    return response;
  }

  let appUser = await db.user.findUnique({
    where: { supabaseId: data.user.id },
    select: { id: true, role: true },
  }).catch(() => null);

  if (!appUser) {
    return response;
  }

  const metadataRole = getMetadataPortalRole(data.user.user_metadata?.role);
  if (metadataRole && appUser.role !== metadataRole) {
    const repairedUser = await ensureAppUserForSupabaseUser({
      ...appUserInputFromSupabaseUser(data.user),
      role: metadataRole,
    }).catch(() => null);

    if (repairedUser) {
      appUser = { id: repairedUser.id, role: repairedUser.role };
      if (pathname.startsWith("/onboarding") || pathname === "/home") {
        return redirectTo(request, portalOnboardingPath(metadataRole));
      }
    }
  }

  if (matchesRoute(pathname, ["/supplier"]) && appUser.role !== "supplier") {
    return redirectTo(request, getRoleHome(appUser.role));
  }
  if (matchesRoute(pathname, ["/logistics"]) && appUser.role !== "logistics_partner") {
    return redirectTo(request, getRoleHome(appUser.role));
  }
  if (matchesRoute(pathname, ["/admin"]) && appUser.role !== "admin") {
    return redirectTo(request, getRoleHome(appUser.role));
  }

  if (appUser.role !== "seller") {
    return response;
  }

  const store = await db.store.findUnique({
    where: { userId: appUser.id },
    select: { onboardingState: true, firstDashboardVisitComplete: true },
  }).catch(() => null);

  if (!store) {
    if (pathname.startsWith("/onboarding")) return response;
    return redirectTo(request, "/onboarding/path-picker");
  }

  if (store.firstDashboardVisitComplete || pathname.startsWith("/onboarding")) {
    return response;
  }

  if (store.onboardingState === "SKIPPED" || store.onboardingState === "INCOMPLETE" || store.onboardingState === "LIVE") {
    await db.store.update({
      where: { userId: appUser.id },
      data: { firstDashboardVisitComplete: true },
    }).catch(() => null);
    return response;
  }

  const destination = await getOnboardingDestination(appUser.id);
  if (destination !== "/home") {
    return redirectTo(request, destination);
  }

  return response;
}

function hostnameFromHost(host: string) {
  return host.split(":")[0] ?? host;
}
