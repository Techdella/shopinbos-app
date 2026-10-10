-- Test-only: the bits of Supabase that our migrations rely on, for a plain Postgres.
-- Never apply to a real Supabase project (it already has these).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase grants client roles access to public by default (legacy tables live there).
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;

-- A legacy table in public, to prove our migrations never touch it.
create table if not exists public."User" (id text primary key, email text);
insert into public."User" (id, email) values ('legacy_1', 'legacy@example.com') on conflict do nothing;
grant select on public."User" to anon, authenticated;
