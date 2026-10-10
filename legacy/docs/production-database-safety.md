# Production Database Safety

Do not accept destructive Prisma prompts on the live Supabase database.

If `prisma db push` says it will drop Supabase Auth tables, public account tables, stores, profiles, messages, conversations, or other non-empty tables, answer `N` or stop the command with `Ctrl+C`.

## Why

The production Supabase database contains app tables plus Supabase-managed and legacy tables. `prisma db push` is a schema sync tool; against a mixed live database it can propose drops for tables that are not represented in `prisma/schema.prisma`.

## Safe Release Flow

1. Back up the database from Supabase before schema changes.
2. Generate a migration or SQL diff for review.
3. Inspect the SQL and remove any `DROP TABLE`, `DROP COLUMN`, or destructive `ALTER` that is not intentional.
4. Run the reviewed SQL in a staging database first.
5. Apply the reviewed SQL to production only after staging passes.

## NotificationPreference Duplicate Check

Before adding the unique key on `NotificationPreference(userId, eventKey, category)`, check for duplicates:

```sql
SELECT "userId", "eventKey", "category", COUNT(*)
FROM "NotificationPreference"
GROUP BY "userId", "eventKey", "category"
HAVING COUNT(*) > 1;
```

If duplicates exist, merge or delete duplicates before applying the constraint.

## Supabase Auth

Never let Prisma drop or recreate Supabase `auth.*` tables. Those tables are owned by Supabase Auth.
