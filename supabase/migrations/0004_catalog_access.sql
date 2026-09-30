-- Catalog access for everyone, song files for their owner only.
--
-- 1. Reads of the notation bucket were open to every signed-in user, so
--    anyone who learned a path could fetch another user's import. Limit them
--    to the catalog (seed/) and the caller's own folder.
-- 2. The app no longer uploads songs (copyright), and signing in is only
--    needed to share: the catalog rows and their seed/ files become readable
--    without an account. Everything per-user stays owner-only.

drop policy if exists "notation_read_authenticated" on storage.objects;

create policy "notation_read_seed_or_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notation'
    and ((storage.foldername(name))[1] = 'seed' or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy "notation_read_seed_anon" on storage.objects
  for select to anon
  using (bucket_id = 'notation' and (storage.foldername(name))[1] = 'seed');

create policy "song_select_catalog_anon" on public.song
  for select to anon using (user_id is null);
