-- Storage buckets (SPEC 6.12). Only runs where Supabase Storage exists.
-- Object paths start with the store id: {storeId}/...
--   sb-public-store  product media, logos — public read
--   sb-private       KYC docs, proofs, label PDFs — signed URLs only (server)
--   sb-ai-generated  drafts before acceptance — members of the store
--   sb-imports       CSV uploads — members of the store
-- Bucket names carry an `sb-` prefix so they never collide with the legacy app's buckets (ADR 0006).
-- Uploads go through the server (signed upload URLs), so there are no client insert policies.
-- Idempotent and additive: never changes or drops existing buckets or policies.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not found; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values
    ('sb-public-store', 'sb-public-store', true),
    ('sb-private', 'sb-private', false),
    ('sb-ai-generated', 'sb-ai-generated', false),
    ('sb-imports', 'sb-imports', false)
  on conflict (id) do nothing;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'shopinbos public-store read') then
    execute $p$
      create policy "shopinbos public-store read" on storage.objects
        for select to anon, authenticated using (bucket_id = 'sb-public-store')
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'shopinbos member read drafts and imports') then
    execute $p$
      create policy "shopinbos member read drafts and imports" on storage.objects
        for select to authenticated using (
          bucket_id in ('sb-ai-generated', 'sb-imports')
          and (storage.foldername(name))[1] in (select shopinbos.my_store_ids())
        )
    $p$;
  end if;
end
$$;
