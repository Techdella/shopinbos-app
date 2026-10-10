-- Storage buckets (SPEC 6.12). Only runs where Supabase Storage exists.
-- Object paths start with the store id: {storeId}/...
--   public-store  product media, logos — public read
--   private       KYC docs, proofs, label PDFs — signed URLs only (server)
--   ai-generated  drafts before acceptance — members of the store
--   imports       CSV uploads — members of the store
-- Uploads go through the server (signed upload URLs), so there are no client insert policies.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not found; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values
    ('public-store', 'public-store', true),
    ('private', 'private', false),
    ('ai-generated', 'ai-generated', false),
    ('imports', 'imports', false)
  on conflict (id) do nothing;

  execute $p$
    create policy "public-store read" on storage.objects
      for select to anon, authenticated using (bucket_id = 'public-store')
  $p$;

  execute $p$
    create policy "member read ai-generated and imports" on storage.objects
      for select to authenticated using (
        bucket_id in ('ai-generated', 'imports')
        and (storage.foldername(name))[1] in (select app.my_store_ids())
      )
  $p$;
end
$$;
