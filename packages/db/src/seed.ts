/**
 * Phase 0 seed: the prototype's demo world (SPEC 16), identity and stores only.
 * Products, orders and the rest arrive with their phases.
 * Seeded users have no supabaseId; the first sign-in with the same phone links the account.
 * Phone numbers are in the unassigned +234 800 000 xxxx range.
 */
import { PERMISSION_PRESETS } from '@shopinbos/validation';
import { getDb } from './client';

const db = getDb();

async function upsertUser(phone: string, name: string) {
  return db.user.upsert({ where: { phone }, update: { name }, create: { phone, name } });
}

async function main() {
  const adaeze = await upsertUser('+2348000000001', 'Adaeze');
  const chinedu = await upsertUser('+2348000000002', 'Chinedu');
  const aba = await upsertUser('+2348000000101', 'Aba Leatherworks');
  const swift = await upsertUser('+2348000000201', 'Swift Dispatch');

  const seller = await db.organization.upsert({
    where: { id: 'seed_org_adaeze' },
    update: {},
    create: {
      id: 'seed_org_adaeze',
      type: 'SELLER',
      name: 'Adaeze Studio',
      state: 'Lagos',
      city: 'Yaba',
    },
  });
  const supplier = await db.organization.upsert({
    where: { id: 'seed_org_aba' },
    update: {},
    create: {
      id: 'seed_org_aba',
      type: 'SUPPLIER',
      name: 'Aba Leatherworks',
      state: 'Abia',
      city: 'Aba',
    },
  });
  const logistics = await db.organization.upsert({
    where: { id: 'seed_org_swift' },
    update: {},
    create: {
      id: 'seed_org_swift',
      type: 'LOGISTICS',
      name: 'Swift Dispatch Ltd',
      state: 'Lagos',
      city: 'Ikeja',
    },
  });

  const members: [string, string, 'OWNER' | 'STAFF', readonly string[]][] = [
    [adaeze.id, seller.id, 'OWNER', PERMISSION_PRESETS.full],
    [chinedu.id, seller.id, 'STAFF', PERMISSION_PRESETS.ordersAndDelivery],
    [aba.id, supplier.id, 'OWNER', PERMISSION_PRESETS.full],
    [swift.id, logistics.id, 'OWNER', PERMISSION_PRESETS.full],
  ];
  for (const [userId, orgId, role, permissions] of members) {
    await db.membership.upsert({
      where: { userId_orgId: { userId, orgId } },
      update: { role, permissions: [...permissions] },
      create: { userId, orgId, role, permissions: [...permissions] },
    });
  }

  const store = await db.store.upsert({
    where: { slug: 'adaeze' },
    update: {},
    create: {
      orgId: seller.id,
      slug: 'adaeze',
      name: 'Adaeze Studio',
      tagline: 'Easy linen and knits, made for Lagos heat',
      category: 'Fashion',
      whatsappNumber: adaeze.phone,
    },
  });

  await db.brandKit.upsert({
    where: { storeId: store.id },
    update: {},
    create: {
      storeId: store.id,
      palette: { bg: '#FBF7F0', ink: '#1E1A16', accent: '#C2562B', soft: '#F1E6D6' },
      headingFont: 'Fraunces',
      bodyFont: 'Plus Jakarta Sans',
      voice: 'Warm and short. A little Pidgin when the customer uses it.',
      logoStyle: 'editorial',
      source: 'REX',
    },
  });

  await db.domain.upsert({
    where: { hostname: 'adaeze.shopinbos.com' },
    update: {},
    create: {
      storeId: store.id,
      hostname: 'adaeze.shopinbos.com',
      type: 'SUBDOMAIN',
      status: 'ACTIVE',
      isPrimary: true,
      sslStatus: 'active',
    },
  });

  console.log(
    'Seeded: Adaeze Studio (seller), Aba Leatherworks (supplier), Swift Dispatch Ltd (logistics).',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
