-- Row Level Security for schema v0 (SPEC 6.13).
-- Everything lives in the `shopinbos` schema; the legacy app's tables in `public` are never touched (ADR 0006).
-- Prisma (server) connects as the table owner / postgres and bypasses RLS.
-- Supabase clients (Realtime, Storage, mobile direct reads) use the `authenticated` role and must pass these policies.
-- All writes from clients go through API routes, so client roles get SELECT policies only.
-- Requires Supabase's auth.uid() and the anon/authenticated roles (stubbed in the RLS test).

create or replace function shopinbos.current_user_id() returns text
language sql stable security definer set search_path = shopinbos, pg_temp as $$
  select u.id from shopinbos."User" u where u."supabaseId" = auth.uid() and u."deletedAt" is null
$$;

create or replace function shopinbos.my_org_ids() returns setof text
language sql stable security definer set search_path = shopinbos, pg_temp as $$
  select m."orgId"
  from shopinbos."Membership" m
  join shopinbos."User" u on u.id = m."userId"
  where u."supabaseId" = auth.uid() and u."deletedAt" is null and m."deletedAt" is null
$$;

create or replace function shopinbos.my_store_ids() returns setof text
language sql stable security definer set search_path = shopinbos, pg_temp as $$
  select s.id from shopinbos."Store" s where s."orgId" in (select shopinbos.my_org_ids()) and s."deletedAt" is null
$$;

revoke all on function shopinbos.current_user_id() from public;
revoke all on function shopinbos.my_org_ids() from public;
revoke all on function shopinbos.my_store_ids() from public;

-- Client roles: signed-in users may read (RLS decides which rows); anonymous visitors get nothing.
revoke all on schema shopinbos from anon;
grant usage on schema shopinbos to authenticated;
grant select on all tables in schema shopinbos to authenticated;
alter default privileges in schema shopinbos grant select on tables to authenticated;
grant execute on function shopinbos.current_user_id() to authenticated;
grant execute on function shopinbos.my_org_ids() to authenticated;
grant execute on function shopinbos.my_store_ids() to authenticated;

alter table shopinbos."User" enable row level security;
alter table shopinbos."Organization" enable row level security;
alter table shopinbos."Membership" enable row level security;
alter table shopinbos."Device" enable row level security;
alter table shopinbos."KycCheck" enable row level security;
alter table shopinbos."AuditLog" enable row level security;
alter table shopinbos."Store" enable row level security;
alter table shopinbos."BrandKit" enable row level security;
alter table shopinbos."Asset" enable row level security;
alter table shopinbos."Domain" enable row level security;
-- Prisma's bookkeeping table lives here when DIRECT_URL has ?schema=shopinbos.
do $$
begin
  if to_regclass('shopinbos._prisma_migrations') is not null then
    alter table shopinbos."_prisma_migrations" enable row level security;
    revoke all on table shopinbos."_prisma_migrations" from authenticated;
  end if;
end
$$;

create policy user_self_read on shopinbos."User"
  for select to authenticated using (id = shopinbos.current_user_id());

create policy org_member_read on shopinbos."Organization"
  for select to authenticated using (id in (select shopinbos.my_org_ids()) and "deletedAt" is null);

create policy membership_org_read on shopinbos."Membership"
  for select to authenticated using ("orgId" in (select shopinbos.my_org_ids()) and "deletedAt" is null);

create policy device_self_read on shopinbos."Device"
  for select to authenticated using ("userId" = shopinbos.current_user_id());

-- KycCheck and AuditLog: no client policies (server only). RLS on + no policy = no rows.

create policy store_member_read on shopinbos."Store"
  for select to authenticated using (id in (select shopinbos.my_store_ids()));

create policy brandkit_member_read on shopinbos."BrandKit"
  for select to authenticated using ("storeId" in (select shopinbos.my_store_ids()));

create policy asset_member_read on shopinbos."Asset"
  for select to authenticated using ("storeId" in (select shopinbos.my_store_ids()) and "deletedAt" is null);

create policy domain_member_read on shopinbos."Domain"
  for select to authenticated using ("storeId" in (select shopinbos.my_store_ids()) and "deletedAt" is null);
