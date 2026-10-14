import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { appUserInputFromSupabaseUser, ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { csrfRejection } from "@/lib/auth/csrf";
import { loginRedirectPath, PORTAL_API_PREFIXES, PROTECTED_PREFIXES, rolesForPath, type PortalRole } from "@/lib/auth/route-access";
import { decodeAccessToken, sessionMaxAgeMs, sessionTooOld } from "@/lib/auth/session-claims";
import { getPlatformRootDomain } from "@/lib/domains/storefront";
import { resolveCustomDomainSlug } from "@/lib/domains/lookup";
import { getOnboardingDestination } from "@/lib/onboarding-router";
import { portalDashboardPath, portalLoginPath, portalOnboardingPath, portalRoleFromPath } from "@/lib/portal-routes";
import { classifyHost, storePathAction } from "@/lib/storefront/host-routing";

const GUEST_ROUTES = [
  "/login",
  "/signup",
  "/supplier/login",
  "/supplier/signup",
  "/logistics/login",
  "/logistics/signup",
  "/admin/login",
];
// Every signed-in area (see src/lib/auth/route-access.ts for which role each needs).
const AUTH_ROUTES = PROTECTED_PREFIXES;
// Public pages that must stay open to guests and every role (some live under a portal prefix).
const PUBLIC_ROUTES = ["/logistics/partners", "/email", "/rider", "/data-deletion"];
/** Lets server code (requireRole) know which page was asked for, to send people back after sign-in. */
const REQUEST_PATH_HEADER = "x-shopinbos-path";
const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const SESSION_COOKIE_OPTIONS = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

// Store hosts need the proxy on every path (including /s/ and /api/public, so they can be kept to their own
// store); on app hosts those two are passed straight through below, exactly as when the matcher skipped them.
export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|brand|fonts/).*)"],
};

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** Paths the matcher used to skip on app hosts; the proxy still leaves them alone there. */
function skippedOnAppHost(pathname: string) {
  return pathname.startsWith("/api/public") || pathname.startsWith("/s/");
}

function hostRoute(request: NextRequest) {
  return classifyHost(request.headers.get("host") || request.nextUrl.host, {
    rootDomain: getPlatformRootDomain(),
    appHosts: [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL, process.env.CSRF_TRUSTED_ORIGINS],
  });
}

function notFound(pathname: string) {
  const headers = { "Cache-Control": "public, max-age=60" };
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404, headers });
  }
  return new NextResponse("Not found", { status: 404, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * <slug>.shopinbos.com and a seller's own (active store's) domain serve that store's storefront at /s/<slug>.
 * The app's portals and APIs are never reachable there; hosts that are neither app nor store get a 404.
 */
async function routeStoreHost(request: NextRequest, route: Exclude<ReturnType<typeof classifyHost>, { kind: "app" }>) {
  const { pathname } = request.nextUrl;
  let slug: string | null | undefined = null;
  if (route.kind === "store") slug = route.slug;
  else if (route.kind === "custom") slug = await resolveCustomDomainSlug(route.domain);
  if (slug === undefined) return new NextResponse("Temporarily unavailable", { status: 503, headers: { "Retry-After": "30" } });
  if (!slug) return notFound(pathname);

  const action = storePathAction(pathname, slug);
  if (action.action === "pass") return NextResponse.next();
  if (action.action === "not-found") return notFound(pathname);
  const url = request.nextUrl.clone();
  url.pathname = action.pathname;
  return NextResponse.rewrite(url);
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

function trustedOrigins() {
  return [process.env.NEXT_PUBLIC_APP_URL, ...(process.env.CSRF_TRUSTED_ORIGINS ?? "").split(",")].filter((value): value is string => Boolean(value?.trim()));
}

export async function proxy(request: NextRequest) {
  const route = hostRoute(request);
  if (route.kind !== "app") return routeStoreHost(request, route);
  if (skippedOnAppHost(request.nextUrl.pathname)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const portalApi = isApi && matchesRoute(pathname, PORTAL_API_PREFIXES);
  const protectedPage = !isApi && matchesRoute(pathname, AUTH_ROUTES) && !matchesRoute(pathname, PUBLIC_ROUTES);

  // Cookie-authenticated JSON APIs only accept writes from our own pages (Bearer callers are exempt).
  const csrf = csrfRejection({ method: request.method, pathname, headers: request.headers, trustedOrigins: trustedOrigins() });
  if (csrf) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: csrf } }, { status: 403 });
  }

  const forwardHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_PATH_HEADER, `${pathname}${search}`);
    return headers;
  };
  const sessionCookies: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  // Rebuilt whenever Supabase refreshes the session, so pages rendered after this see the new cookies too.
  const buildResponse = () => {
    const next = NextResponse.next({ request: { headers: forwardHeaders() } });
    for (const cookie of sessionCookies) next.cookies.set(cookie.name, cookie.value, cookie.options);
    // Signed-in pages and portal APIs must never be cached, so Back after logging out can't show them.
    if (protectedPage || portalApi) next.headers.set("Cache-Control", NO_STORE);
    return next;
  };
  let response = buildResponse();

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    const queryStart = path.indexOf("?");
    url.pathname = queryStart === -1 ? path : path.slice(0, queryStart);
    url.search = queryStart === -1 ? "" : path.slice(queryStart);
    const redirect = NextResponse.redirect(url);
    for (const cookie of sessionCookies) redirect.cookies.set(cookie.name, cookie.value, cookie.options);
    redirect.headers.set("Cache-Control", NO_STORE);
    return redirect;
  };

  if (matchesRoute(pathname, PUBLIC_ROUTES)) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          sessionCookies.push({ name, value, options });
        }
        response = buildResponse();
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
    return redirectTo(getRoleHome(appUser.role));
  }

  // Password reset and the auth callback work on their own session; never steer them into onboarding.
  if (matchesRoute(pathname, ["/reset-password", "/forgot-password", "/auth"])) {
    return response;
  }

  if (!authenticated && matchesRoute(pathname, AUTH_ROUTES)) {
    return redirectTo(loginRedirectPath(getLoginPath(pathname), pathname, search));
  }

  if (!authenticated || !data.user) {
    return response;
  }

  let appUser = await db.user.findUnique({
    where: { supabaseId: data.user.id },
    select: { id: true, role: true },
  }).catch(() => null);

  // Absolute session lifetime (AUTH_SESSION_MAX_DAYS, shorter for admins): after it, sign in again.
  // (/api/auth is left alone so signing in again and signing out always work.)
  const dataApi = portalApi && !matchesRoute(pathname, ["/api/auth"]);
  if (protectedPage || dataApi) {
    const { data: sessionData } = await supabase.auth.getSession();
    const claims = decodeAccessToken(sessionData.session?.access_token);
    if (claims?.sub === data.user.id && sessionTooOld(claims, sessionMaxAgeMs(appUser?.role, process.env))) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
      if (dataApi) {
        const expired = NextResponse.json({ error: { code: "SESSION_EXPIRED", message: "Your session has ended. Log in again." } }, { status: 401 });
        for (const cookie of sessionCookies) expired.cookies.set(cookie.name, cookie.value, cookie.options);
        return expired;
      }
      const login = loginRedirectPath(getLoginPath(pathname), pathname, search);
      return redirectTo(`${login}${login.includes("?") ? "&" : "?"}reason=expired`);
    }
  }

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
        return redirectTo(portalOnboardingPath(metadataRole));
      }
    }
  }

  if (matchesRoute(pathname, ["/supplier"]) && appUser.role !== "supplier") {
    return redirectTo(getRoleHome(appUser.role));
  }
  if (matchesRoute(pathname, ["/logistics"]) && appUser.role !== "logistics_partner") {
    return redirectTo(getRoleHome(appUser.role));
  }
  if (matchesRoute(pathname, ["/admin"]) && appUser.role !== "admin") {
    return redirectTo(getRoleHome(appUser.role));
  }
  // Seller-only areas (/home, /products, /marketplace, /studio…): other roles go to their own portal.
  const allowedRoles = isApi ? null : rolesForPath(pathname);
  if (allowedRoles && !allowedRoles.includes(appUser.role as PortalRole)) {
    return redirectTo(pathname.startsWith("/onboarding") ? portalOnboardingPath(appUser.role) : getRoleHome(appUser.role));
  }

  if (appUser.role !== "seller") {
    return response;
  }

  const store = await db.store.findUnique({
    where: { userId: appUser.id },
    select: { onboardingState: true, firstDashboardVisitComplete: true },
  }).catch(() => null);

  if (!store) {
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/api/")) return response;
    return redirectTo("/onboarding/rex");
  }

  // Only page navigations get steered into onboarding. API calls made *from* onboarding (saving progress,
  // Rex, uploads) must reach their handlers instead of being redirected to an HTML page.
  if (store.firstDashboardVisitComplete || pathname.startsWith("/onboarding") || pathname.startsWith("/api/")) {
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
    return redirectTo(destination);
  }

  return response;
}
