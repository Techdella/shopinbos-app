/**
 * Cross-org RLS test (SPEC 6.13, phase 0 acceptance).
 * Needs a throwaway Postgres: RLS_DATABASE_URL=postgresql://postgres@localhost:5432/postgres
 * Creates a fresh database, applies Supabase stubs + all migrations, then reads as two users.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const adminUrl = process.env.RLS_DATABASE_URL;
const dbName = `rls_${Date.now()}`;
const root = fileURLToPath(new URL('..', import.meta.url));

const userA = randomUUID();
const userB = randomUUID();

let client: pg.Client;

function urlFor(db: string): string {
  const u = new URL(adminUrl!);
  u.pathname = `/${db}`;
  return u.toString();
}

async function asUser<T>(sub: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: 'authenticated' }),
    ]);
    return await fn(client);
  } finally {
    await client.query('rollback');
  }
}

const count = async (c: pg.Client, sql: string, params: unknown[] = []) =>
  Number((await c.query(`select count(*)::int as n from (${sql}) q`, params)).rows[0].n);

describe.skipIf(!adminUrl)('row level security', () => {
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    await admin.end();

    client = new pg.Client({ connectionString: urlFor(dbName) });
    await client.connect();
    await client.query(readFileSync(`${root}/sql/supabase-stub.sql`, 'utf8'));

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: root,
      env: { ...process.env, DIRECT_URL: urlFor(dbName), DATABASE_URL: urlFor(dbName) },
      stdio: 'pipe',
    });

    await client.query(`
      insert into "User"(id, "supabaseId", phone, name, "updatedAt") values
        ('u_a', '${userA}', '+2348000000001', 'Adaeze', now()),
        ('u_b', '${userB}', '+2348000000002', 'Musa', now());
      insert into "Organization"(id, type, name, "updatedAt") values
        ('org_a', 'SELLER', 'Adaeze Studio', now()),
        ('org_b', 'SELLER', 'Other Shop', now());
      insert into "Membership"(id, "userId", "orgId", role, "updatedAt") values
        ('m_a', 'u_a', 'org_a', 'OWNER', now()),
        ('m_b', 'u_b', 'org_b', 'OWNER', now());
      insert into "Store"(id, "orgId", slug, name, "updatedAt") values
        ('s_a', 'org_a', 'adaeze', 'Adaeze Studio', now()),
        ('s_b', 'org_b', 'othershop', 'Other Shop', now());
      insert into "BrandKit"(id, "storeId", "updatedAt") values ('bk_a', 's_a', now()), ('bk_b', 's_b', now());
      insert into "Asset"(id, "storeId", bucket, path, mime, kind, "updatedAt") values
        ('as_a', 's_a', 'public-store', 's_a/logo.png', 'image/png', 'LOGO', now()),
        ('as_b', 's_b', 'public-store', 's_b/logo.png', 'image/png', 'LOGO', now());
      insert into "Domain"(id, "storeId", hostname, type, "updatedAt") values
        ('d_a', 's_a', 'adaeze.shopinbos.com', 'SUBDOMAIN', now()),
        ('d_b', 's_b', 'othershop.shopinbos.com', 'SUBDOMAIN', now());
      insert into "Device"(id, "userId", app, platform, "expoPushToken", "updatedAt") values
        ('dev_a', 'u_a', 'SELLER', 'IOS', 'ExponentPushToken[aaaaaaaaaa]', now()),
        ('dev_b', 'u_b', 'SELLER', 'IOS', 'ExponentPushToken[bbbbbbbbbb]', now());
      insert into "KycCheck"(id, "orgId", kind, provider, "updatedAt") values ('k_a', 'org_a', 'CAC', 'dojah', now());
      insert into "AuditLog"(id, "orgId", action, entity, "updatedAt") values ('al_a', 'org_a', 'store.publish', 'Store', now());
    `);
  });

  afterAll(async () => {
    await client?.end();
    if (!adminUrl) return;
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  });

  it('a user sees only their own org, store and related rows', async () => {
    await asUser(userA, async (c) => {
      expect(await count(c, 'select * from "User"')).toBe(1);
      expect((await c.query('select id from "Organization"')).rows).toEqual([{ id: 'org_a' }]);
      expect((await c.query('select id from "Store"')).rows).toEqual([{ id: 's_a' }]);
      expect(await count(c, 'select * from "Membership"')).toBe(1);
      expect(await count(c, 'select * from "BrandKit"')).toBe(1);
      expect(await count(c, 'select * from "Asset"')).toBe(1);
      expect(await count(c, 'select * from "Domain"')).toBe(1);
      expect(await count(c, 'select * from "Device"')).toBe(1);
    });
  });

  it.each([
    ['User', `select * from "User" where id = 'u_b'`],
    ['Organization', `select * from "Organization" where id = 'org_b'`],
    ['Membership', `select * from "Membership" where "orgId" = 'org_b'`],
    ['Store', `select * from "Store" where id = 's_b'`],
    ['BrandKit', `select * from "BrandKit" where "storeId" = 's_b'`],
    ['Asset', `select * from "Asset" where "storeId" = 's_b'`],
    ['Domain', `select * from "Domain" where "storeId" = 's_b'`],
    ['Device', `select * from "Device" where "userId" = 'u_b'`],
  ])('cross-org read of %s returns zero rows', async (_table, sql) => {
    expect(await asUser(userA, (c) => count(c, sql))).toBe(0);
  });

  it('server-only tables return nothing to clients', async () => {
    await asUser(userA, async (c) => {
      expect(await count(c, 'select * from "KycCheck"')).toBe(0);
      expect(await count(c, 'select * from "AuditLog"')).toBe(0);
    });
  });

  it('a user with no account row sees nothing', async () => {
    await asUser(randomUUID(), async (c) => {
      expect(await count(c, 'select * from "Store"')).toBe(0);
      expect(await count(c, 'select * from "Organization"')).toBe(0);
    });
  });

  it('clients cannot write', async () => {
    await expect(
      asUser(userA, (c) => c.query(`update "Store" set name = 'hacked' where id = 's_a'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('anon reads nothing', async () => {
    await client.query('begin');
    try {
      await client.query('set local role anon');
      await expect(client.query('select * from "Store"')).rejects.toThrow(/permission denied/);
    } finally {
      await client.query('rollback');
    }
  });
});
