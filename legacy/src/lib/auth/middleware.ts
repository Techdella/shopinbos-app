import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser, JWTClaims, Role } from "./types";
import { apiError } from "@/lib/api/response";

// ─── Verify a raw access token via Supabase Admin client ─────────────────────

export async function verifyJWT(token: string): Promise<JWTClaims | null> {
  try {
    const supabase = await getSupabaseServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const u = data.user;
    return {
      sub: u.id,
      email: u.email ?? "",
      user_metadata: {
        role: (u.user_metadata?.role as Role) ?? "seller",
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

async function resolveSupabaseId(req: NextRequest): Promise<{ id: string; email: string; role: Role; fullName?: string; businessName?: string; phone?: string } | null> {
  // 1. Try Authorization: Bearer <token>
  const auth = req.headers.get("authorization");
  const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (bearerToken) {
    const claims = await verifyJWT(bearerToken);
    if (claims) {
      return { id: claims.sub, email: claims.email, role: claims.user_metadata.role, fullName: claims.user_metadata.name };
    }
  }

  // 2. Fall back to session cookies set by @supabase/ssr createBrowserClient
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      return {
        id: data.user.id,
        email: data.user.email ?? "",
        role: (data.user.user_metadata?.role as Role) ?? "seller",
        fullName:
          (data.user.user_metadata?.fullName as string | undefined) ??
          (data.user.user_metadata?.full_name as string | undefined) ??
          (data.user.user_metadata?.name as string | undefined),
        businessName:
          (data.user.user_metadata?.businessName as string | undefined) ??
          (data.user.user_metadata?.business_name as string | undefined),
        phone: data.user.user_metadata?.phone as string | undefined,
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
  return async (req: NextRequest, { params }: { params?: any } = {}) => {
    const identity = await resolveSupabaseId(req);
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
        role: identity.role === "seller" && allowedRoles?.length === 1 ? allowedRoles[0] : identity.role,
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

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return apiError("FORBIDDEN", `Role '${user.role}' cannot access this resource`, 403);
    }

    return handler(req, { user, params });
  };
}

// ─── Convenience role wrappers ────────────────────────────────────────────────

export const withSeller         = (h: Handler) => withAuth(h, ["seller"]);
export const withSupplier       = (h: Handler) => withAuth(h, ["supplier"]);
export const withLogistics      = (h: Handler) => withAuth(h, ["logistics_partner"]);
export const withAdmin          = (h: Handler) => withAuth(h, ["admin"]);
export const withSellerOrAdmin  = (h: Handler) => withAuth(h, ["seller", "admin"]);
