import 'server-only';
import { HttpError } from '../api/respond';
import { supabaseServer, supabaseStateless } from '../supabase/server';

export interface AuthClaims {
  sub: string;
  phone?: string;
  email?: string;
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  const m = h && /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

/**
 * Verifies the caller: `Authorization: Bearer <supabase-jwt>` (mobile, API) or the web session cookie.
 * getClaims verifies asymmetric JWTs locally against the project's JWKS.
 */
export async function getClaims(req?: Request): Promise<AuthClaims | null> {
  const token = req ? bearer(req) : null;
  const supabase = token ? supabaseStateless() : await supabaseServer();
  const { data, error } = await supabase.auth.getClaims(token ?? undefined);
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as { sub: string; phone?: string; email?: string };
  return { sub: c.sub, phone: c.phone || undefined, email: c.email || undefined };
}

export async function requireClaims(req?: Request): Promise<AuthClaims> {
  const claims = await getClaims(req);
  if (!claims) throw new HttpError('UNAUTHENTICATED', 'Sign in to continue.');
  return claims;
}
