-- Row Level Security for schema v0 (SPEC 6.13).
-- Prisma (server) connects as the table owner / postgres and bypasses RLS.
-- Supabase clients (Realtime, Storage, mobile direct reads) use the `authenticated` role and must pass these policies.
-- All writes from clients go through API routes, so client roles get SELECT policies only.
-- Requires Supabase's auth.uid() and the anon/authenticated roles (stubbed in the RLS test).

create schema if not exists app;

create or replace function app.current_user_id() returns text
language sql stable security definer set search_path = public as $$
  select u.id from "User" u where u."supabaseId" = auth.uid() and u."deletedAt" is null
$$;

create or replace function app.my_org_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select m."orgId"
  from "Membership" m
  join "User" u on u.id = m."userId"
  where u."supabaseId" = auth.uid() and u."deletedAt" is null and m."deletedAt" is null
$$;

create or replace function app.my_store_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select s.id from "Store" s where s."orgId" in (select app.my_org_ids()) and s."deletedAt" is null
$$;

revoke all on function app.current_user_id() from public;
revoke all on function app.my_org_ids() from public;
revoke all on function app.my_store_ids() from public;
grant usage on schema app to authenticated;
grant execute on function app.current_user_id() to authenticated;
grant execute on function app.my_org_ids() to authenticated;
grant execute on function app.my_store_ids() to authenticated;

alter table "User" enable row level security;
alter table "Organization" enable row level security;
alter table "Membership" enable row level security;
alter table "Device" enable row level security;
alter table "KycCheck" enable row level security;
alter table "AuditLog" enable row level security;
alter table "Store" enable row level security;
alter table "BrandKit" enable row level security;
alter table "Asset" enable row level security;
alter table "Domain" enable row level security;
alter table if exists "_prisma_migrations" enable row level security;

-- Shoppers and anonymous visitors never read these tables directly.
revoke all on all tables in schema public from anon;

create policy user_self_read on "User"
  for select to authenticated using (id = app.current_user_id());

create policy org_member_read on "Organization"
  for select to authenticated using (id in (select app.my_org_ids()) and "deletedAt" is null);

create policy membership_org_read on "Membership"
  for select to authenticated using ("orgId" in (select app.my_org_ids()) and "deletedAt" is null);

create policy device_self_read on "Device"
  for select to authenticated using ("userId" = app.current_user_id());

-- KycCheck and AuditLog: no client policies (server only). RLS on + no policy = no rows.

create policy store_member_read on "Store"
  for select to authenticated using (id in (select app.my_store_ids()));

create policy brandkit_member_read on "BrandKit"
  for select to authenticated using ("storeId" in (select app.my_store_ids()));

create policy asset_member_read on "Asset"
  for select to authenticated using ("storeId" in (select app.my_store_ids()) and "deletedAt" is null);

create policy domain_member_read on "Domain"
  for select to authenticated using ("storeId" in (select app.my_store_ids()) and "deletedAt" is null);
