import { Badge, Button, Card } from '@shopinbos/ui-web';
import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getClaims } from '@/lib/auth/claims';
import { getMe } from '@/server/users';

export const metadata: Metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

const orgTypeLabel = {
  SELLER: 'Shop',
  SUPPLIER: 'Supplier',
  LOGISTICS: 'Delivery partner',
  SOURCING_PARTNER: 'Sourcing partner',
  PLATFORM: 'Shopinbos',
} as const;

export default async function HomePage() {
  const claims = await getClaims();
  if (!claims) redirect('/sign-in');
  const me = await getMe(claims);
  const name = me.user.name ?? 'there';

  return (
    <main className="min-h-dvh">
      <header className="bg-wash px-4 pt-10 pb-8 md:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-sub">Shopinbos</p>
            <h1 className="text-3xl font-extrabold tracking-tight">Hi {name}</h1>
          </div>
          <form action="/sign-out" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 md:px-10">
        {me.memberships.length === 0 ? (
          <Card tone="ai" className="flex items-center gap-4">
            <Image src="/rex.png" alt="" width={64} height={64} />
            <div className="flex-1">
              <p className="text-lg font-bold">You&apos;re signed in.</p>
              <p className="text-sm">Rex will help you set up your shop here soon.</p>
            </div>
          </Card>
        ) : (
          <>
            <h2 className="text-lg font-bold">Your businesses</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {me.memberships.map((m) => (
                <li key={m.id}>
                  <Card className="flex h-full flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-lg font-bold">{m.organization.name}</p>
                      <Badge tone="neutral">{orgTypeLabel[m.organization.type]}</Badge>
                    </div>
                    <p className="text-sm text-sub">
                      {m.role === 'OWNER'
                        ? 'Owner'
                        : m.role.charAt(0) + m.role.slice(1).toLowerCase()}{' '}
                      · {m.permissions.length} permissions
                    </p>
                    {m.stores.map((s) => (
                      <p key={s.id} className="flex items-center gap-2 text-sm">
                        <Badge tone={s.status === 'LIVE' ? 'ok' : 'warn'}>
                          {s.status === 'LIVE' ? 'Live' : s.status === 'DRAFT' ? 'Draft' : 'Paused'}
                        </Badge>
                        {s.slug}.{process.env.NEXT_PUBLIC_STORE_ROOT_DOMAIN ?? 'shopinbos.com'}
                      </p>
                    ))}
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
