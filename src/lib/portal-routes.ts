import type { AuthRole } from "@/lib/brand";

export const PORTAL_ROUTES = {
  seller: {
    login: "/login",
    signup: "/signup",
    onboarding: "/onboarding",
    dashboard: "/home",
  },
  supplier: {
    login: "/supplier/login",
    signup: "/supplier/signup",
    onboarding: "/supplier/onboarding",
    dashboard: "/supplier/dashboard",
  },
  logistics_partner: {
    login: "/logistics/login",
    signup: "/logistics/signup",
    onboarding: "/logistics/onboarding",
    dashboard: "/logistics/dashboard",
  },
  admin: {
    login: "/admin/login",
    signup: "/admin/login",
    onboarding: "/admin/dashboard",
    dashboard: "/admin/dashboard",
  },
} as const satisfies Record<AuthRole, { login: string; signup: string; onboarding: string; dashboard: string }>;

export function portalRoutesFor(role: AuthRole) {
  return PORTAL_ROUTES[role] ?? PORTAL_ROUTES.seller;
}

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function portalRoleFromPath(pathname: string): AuthRole {
  // Segment-aware so public pages like /suppliers/[slug] are not treated as the supplier portal.
  if (isUnder(pathname, "/supplier")) return "supplier";
  if (isUnder(pathname, "/logistics")) return "logistics_partner";
  if (isUnder(pathname, "/admin")) return "admin";
  return "seller";
}

export function portalOnboardingPath(role: AuthRole) {
  return portalRoutesFor(role).onboarding;
}

export function portalDashboardPath(role: AuthRole) {
  return portalRoutesFor(role).dashboard;
}

export function portalLoginPath(role: AuthRole) {
  return portalRoutesFor(role).login;
}

export function portalSignupPath(role: AuthRole) {
  return portalRoutesFor(role).signup;
}
