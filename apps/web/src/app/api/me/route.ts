import { handler, ok } from '@/lib/api/respond';
import { requireClaims } from '@/lib/auth/claims';
import { getMe } from '@/server/users';

export const dynamic = 'force-dynamic';

/** GET /api/me — profile and memberships (orgs, roles, permissions, stores). */
export const GET = handler(async (req: Request) => {
  const claims = await requireClaims(req);
  return ok(await getMe(claims));
});
