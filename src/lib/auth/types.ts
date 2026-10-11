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
}

export interface JWTClaims {
  sub: string;
  email: string | null;
  /** Verified phone in E.164 (+234…), for accounts created with a phone number. */
  phone: string | null;
  user_metadata: {
    role: Role;
    name?: string;
  };
  exp: number;
  iat: number;
}
