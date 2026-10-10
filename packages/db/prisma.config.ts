import { defineConfig } from 'prisma/config';

// Migrations use the direct connection; the app uses the pooled DATABASE_URL at runtime.
// `prisma generate` does not need a database, so a placeholder keeps CI working without secrets.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed.ts',
  },
  datasource: {
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      'postgresql://placeholder@localhost:5432/placeholder',
  },
});
