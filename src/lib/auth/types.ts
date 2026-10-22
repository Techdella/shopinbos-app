import type { Role } from "@prisma/client";

export type { Role };

export interface AuthUser {
  id: string;
  supabaseId: string;
  email: string | null;
  role: Role;
  name: string;
  avatarUrl?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  /**
   * Set when a seller's staff member is signed in (src/lib/staff/staff.server.ts): the rest of this object is the
   * store owner, so their store and credits are used; owner-only places check this and turn staff away.
   */
  staff?: { id: string; userId: string; name: string; email: string | null };
}

export interface JWTClaims {
  sub: string;
  email: string | null;
  /** Verified phone in E.164 (+234…), for accounts created with a phone number. */
  phone: string | null;
  user_metadata: {
    /** The metadata role, or "seller" when none is set. */
    role: Role;
    /** The metadata role exactly as saved, null when none is set (a Google sign-up before its first sync). */
    rawRole?: Role | null;
    name?: string;
  };
  exp: number;
  iat: number;
}
