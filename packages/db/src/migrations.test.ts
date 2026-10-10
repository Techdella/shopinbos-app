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

  it('never touches the legacy public schema', () => {
    for (const f of [
      'prisma/migrations/20261010000001_init/migration.sql',
      'sql/0002_rls.sql',
      'sql/0003_storage.sql',
    ]) {
      expect(read(f), f).not.toMatch(/\bpublic\./i);
      expect(read(f), f).not.toMatch(/in schema public/i);
      expect(read(f), f).not.toMatch(/\bdrop\s+(table|schema|policy|function)/i);
    }
  });

  it('every table in the init migration has RLS enabled', () => {
    const tables = [
      ...read('prisma/migrations/20261010000001_init/migration.sql').matchAll(
        /CREATE TABLE "shopinbos"\."(\w+)"/g,
      ),
    ].map((m) => m[1]);
    const rls = read('sql/0002_rls.sql');
    expect(tables.length).toBeGreaterThan(5);
    for (const t of tables)
      expect(rls, t).toContain(`alter table shopinbos."${t}" enable row level security`);
  });
});
