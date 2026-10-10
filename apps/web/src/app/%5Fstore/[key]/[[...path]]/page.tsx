import { getDb } from '@shopinbos/db';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Storefront entry. The proxy rewrites {slug}.shopinbos.com and custom domains here.
 * Phase 0 only resolves the store; the theme renderer arrives in phase 1.
 */
async function findStore(key: string) {
  const db = getDb();
  if (key.startsWith('slug:'))
    return db.store.findFirst({ where: { slug: key.slice(5), deletedAt: null } });
  if (key.startsWith('host:')) {
    const domain = await db.domain.findFirst({
      where: { hostname: key.slice(5), status: 'ACTIVE', deletedAt: null },
      include: { store: true },
    });
    return domain?.store.deletedAt ? null : (domain?.store ?? null);
  }
  return null;
}

export default async function StoreEntry({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = await findStore(decodeURIComponent(key));
  if (!store) notFound();

  const message =
    store.status === 'PAUSED'
      ? 'Back soon.'
      : store.status === 'DRAFT'
        ? 'This shop is getting ready.'
        : 'Our shop is opening here soon.';

  return (
    <main className="bg-wash flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">{store.name}</h1>
      {store.tagline && <p className="text-sub">{store.tagline}</p>}
      <p className="mt-4 rounded-pill bg-paper px-4 py-2 text-sm font-semibold">{message}</p>
    </main>
  );
}
