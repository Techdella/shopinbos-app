import 'server-only';
import { getDb, Prisma, type User } from '@shopinbos/db';
import type { MeDto } from '@shopinbos/validation';
import type { AuthClaims } from '@/lib/auth/claims';

const toE164 = (phone?: string) =>
  phone ? (phone.startsWith('+') ? phone : `+${phone}`) : undefined;

/**
 * Finds the Shopinbos user for a verified Supabase identity, creating it on first sign-in.
 * A seeded or invited user (no supabaseId yet) is linked by the verified phone or email.
 */
export async function getOrCreateUser(claims: AuthClaims): Promise<User> {
  const db = getDb();
  const existing = await db.user.findUnique({ where: { supabaseId: claims.sub } });
  if (existing) {
    return db.user.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
  }

  const phone = toE164(claims.phone);
  const email = claims.email?.toLowerCase();
  const or: Prisma.UserWhereInput[] = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });

  if (or.length) {
    const invited = await db.user.findFirst({
      where: { supabaseId: null, deletedAt: null, OR: or },
    });
    if (invited) {
      return db.user.update({
        where: { id: invited.id },
        data: { supabaseId: claims.sub, lastSeenAt: new Date() },
      });
    }
  }

  try {
    return await db.user.create({
      data: { supabaseId: claims.sub, phone, email, lastSeenAt: new Date() },
    });
  } catch (err) {
    // Two first requests racing: the other one created the row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return db.user.findUniqueOrThrow({ where: { supabaseId: claims.sub } });
    }
    throw err;
  }
}

export async function getMe(claims: AuthClaims): Promise<MeDto> {
  const user = await getOrCreateUser(claims);
  const memberships = await getDb().membership.findMany({
    where: { userId: user.id, deletedAt: null, organization: { deletedAt: null } },
    orderBy: { createdAt: 'asc' },
    include: {
      organization: {
        include: {
          stores: {
            where: { deletedAt: null },
            select: { id: true, slug: true, name: true, status: true },
          },
        },
      },
    },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
    },
    memberships: memberships.map((m) => ({
      id: m.id,
      role: m.role,
      permissions: Array.isArray(m.permissions) ? (m.permissions as string[]) : [],
      organization: {
        id: m.organization.id,
        name: m.organization.name,
        type: m.organization.type,
        kycStatus: m.organization.kycStatus,
      },
      stores: m.organization.stores,
    })),
  };
}
