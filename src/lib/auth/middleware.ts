import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser, JWTClaims, Role } from "./types";
import { apiError } from "@/lib/api/response";
import { e164FromSupabase } from "@/lib/auth/app-user";
import { asAccountRole } from "@/lib/auth/role-rules";
import { appSessionMaxAgeMs, decodeAccessToken, sessionTooOld } from "@/lib/auth/session-claims";
import { recordActivity } from "@/lib/platform-analytics/activity.server";
import { adminCanOpen } from "@/lib/admin-team/pure";
import { OWNER_ONLY_API, actingUser, isOwnerOnlyPath } from "@/lib/staff/acting.server";

// ─── Verify a raw access token via Supabase Admin client ─────────────────────

export async function verifyJWT(token: string): Promise<JWTClaims | null> {
  try {
    const supabase = await getSupabaseServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const u = data.user;
    return {
      sub: u.id,
      email: u.email || null,
      phone: e164FromSupabase(u.phone),
      user_metadata: {
        role: (u.user_metadata?.role as Role) ?? "seller",
        rawRole: asAccountRole(u.user_metadata?.role),
        name: u.user_metadata?.name,
      },
      exp: 0,
      iat: 0,
    };
  } catch {
    return null;
  }
}

// ─── Resolve AuthUser from JWT claims ────────────────────────────────────────

export async function resolveUser(claims: JWTClaims): Promise<AuthUser | null> {
  try {
    const user = await db.user.findUnique({
      where: { supabaseId: claims.sub },
      select: {
        id: true,
        supabaseId: true,
        email: true,
        role: true,
        name: true,
        city: true,
        country: true,
      },
    });
    return user ?? null;
  } catch {
    return null;
  }
}

// ─── Resolve Supabase user ID from request (header or cookie) ─────────────────

/** A Bearer token Supabase accepted, but from a sign-in older than the app's session lifetime: sign in again. */
export const SESSION_EXPIRED = "expired" as const;

/** The phone's session is past AUTH_APP_SESSION_MAX_DAYS since the person last signed in (only on a verified token). */
export function bearerSessionExpired(token: string, supabaseId: string) {
  const claims = decodeAccessToken(token);
  return claims?.sub === supabaseId && sessionTooOld(claims, appSessionMaxAgeMs(process.env));
}

async function resolveSupabaseId(req: NextRequest): Promise<{ id: string; email: string | null; role: Role; metadataRole: Role | null; fullName?: string; businessName?: string; phone?: string | null } | typeof SESSION_EXPIRED | null> {
  // 1. Try Authorization: Bearer <token>
  const auth = req.headers.get("authorization");
  const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (bearerToken) {
    const claims = await verifyJWT(bearerToken);
    if (claims && bearerSessionExpired(bearerToken, claims.sub)) return SESSION_EXPIRED;
    if (claims) {
      return { id: claims.sub, email: claims.email, phone: claims.phone, role: claims.user_metadata.role, metadataRole: claims.user_metadata.rawRole ?? null, fullName: claims.user_metadata.name };
    }
  }

  // 2. Fall back to session cookies set by @supabase/ssr createBrowserClient
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      return {
        id: data.user.id,
        email: data.user.email || null,
        role: (data.user.user_metadata?.role as Role) ?? "seller",
        metadataRole: asAccountRole(data.user.user_metadata?.role),
        fullName:
          (data.user.user_metadata?.fullName as string | undefined) ??
          (data.user.user_metadata?.full_name as string | undefined) ??
          (data.user.user_metadata?.name as string | undefined),
        businessName:
          (data.user.user_metadata?.businessName as string | undefined) ??
          (data.user.user_metadata?.business_name as string | undefined),
        phone: e164FromSupabase(data.user.phone) ?? (data.user.user_metadata?.phone as string | undefined),
      };
    }
  } catch {
    // cookies() may not be available in some edge contexts
  }

  return null;
}

// ─── Route handler wrapper — requires auth + optional role check ──────────────

type Handler = (req: NextRequest, ctx: { user: AuthUser; params: any }) => Promise<NextResponse>;

export function withAuth(handler: Handler, allowedRoles?: Role[]) {
  return async (req: NextRequest, { params }: { params: Promise<any> }) => {
    const identity = await resolveSupabaseId(req);
    if (identity === SESSION_EXPIRED) return apiError("SESSION_EXPIRED", "Your session has ended. Log in again.", 401);
    if (!identity) return apiError("UNAUTHORIZED", "Authentication required", 401);

    let user = await db.user.findUnique({
      where: { supabaseId: identity.id },
      select: {
        id: true,
        supabaseId: true,
        email: true,
        role: true,
        name: true,
        city: true,
        country: true,
      },
    }).catch(() => null);

    // Auto-create the app User/profile rows if the Supabase session is valid but sync-user was never called.
    if (!user) {
      const ensured = await ensureAppUserForSupabaseUser({
        supabaseId: identity.id,
        email: identity.email,
        // The role saved at sign-up; only an account with none at all takes the portal it first called.
        role: !identity.metadataRole && allowedRoles?.length === 1 ? allowedRoles[0] : identity.role,
        fullName: identity.fullName,
        businessName: identity.businessName,
        phone: identity.phone,
      }).catch(() => null);
      user = ensured
        ? await db.user.findUnique({
            where: { id: ensured.id },
            select: {
              id: true,
              supabaseId: true,
              email: true,
              role: true,
              name: true,
              city: true,
              country: true,
            },
          }).catch(() => null)
        : null;
    }

    if (!user) return apiError("UNAUTHORIZED", "Could not resolve user — check your database connection", 401);
    recordActivity(user);
    // A seller's staff member works in the owner's store (src/lib/staff/staff.server.ts).
    const acting: AuthUser = await actingUser(user as AuthUser, (id) => db.user.findUnique({ where: { id }, select: { id: true, supabaseId: true, email: true, role: true, name: true, city: true, country: true } }));
    if (acting.staff && isOwnerOnlyPath(req.nextUrl.pathname, OWNER_ONLY_API)) return apiError("FORBIDDEN", "Only the store owner can do this.", 403);

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return apiError("FORBIDDEN", `Role '${user.role}' cannot access this resource`, 403);
    }
    // Admin › Team roles: an admin API route is only for the roles whose section it belongs to.
    if (user.role === "admin" && req.nextUrl.pathname.startsWith("/api/admin")) {
      const member = await db.user.findUnique({ where: { id: user.id }, select: { adminRole: true } }).catch(() => null);
      if (!adminCanOpen(member?.adminRole, req.nextUrl.pathname)) return apiError("FORBIDDEN", "Your admin role can't open this.", 403);
    }

    // Next.js 16 passes route params as a Promise; resolve once so handlers can read params.id directly.
    return handler(req, { user: acting, params: (await params) ?? {} });
  };
}

// ─── Convenience role wrappers ────────────────────────────────────────────────

export const withSeller         = (h: Handler) => withAuth(h, ["seller"]);
export const withSupplier       = (h: Handler) => withAuth(h, ["supplier"]);
export const withLogistics      = (h: Handler) => withAuth(h, ["logistics_partner"]);
export const withAdmin          = (h: Handler) => withAuth(h, ["admin"]);
export const withSellerOrAdmin  = (h: Handler) => withAuth(h, ["seller", "admin"]);
