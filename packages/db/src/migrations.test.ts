import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(`${root}/${p}`, 'utf8');

describe('SQL sources match migrations', () => {
  it.each([
    ['sql/0002_rls.sql', 'prisma/migrations/20261010000002_rls/migration.sql'],
    ['sql/0003_storage.sql', 'prisma/migrations/20261010000003_storage/migration.sql'],
  ])('%s', (src, migration) => {
    expect(read(migration)).toBe(read(src));
  });

  it('every table in the init migration has RLS enabled', () => {
    const tables = [
      ...read('prisma/migrations/20261010000001_init/migration.sql').matchAll(
        /CREATE TABLE "(\w+)"/g,
      ),
    ].map((m) => m[1]);
    const rls = read('sql/0002_rls.sql');
    expect(tables.length).toBeGreaterThan(5);
    for (const t of tables)
      expect(rls, t).toContain(`alter table "${t}" enable row level security`);
  });
});
