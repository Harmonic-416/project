-- Keep the file a song was imported from (e.g. the original .mid) next to
-- its canonical MusicXML, so it can be downloaded or re-converted later
-- with a better converter. Nullable: seed songs and older imports have none.

alter table public.song
  add column source_path text,   -- Storage path in `notation`, under <user_id>/
  add column source_format text check (source_format in ('midi', 'musicxml', 'mxl'));

alter table public.song
  add constraint song_source_pair check ((source_path is null) = (source_format is null));

-- Reads were open to every signed-in user for the whole bucket, so anyone
-- who learned a path could fetch another user's import. Limit them to the
-- seed songs and the caller's own folder.
drop policy if exists "notation_read_authenticated" on storage.objects;
create policy "notation_read_seed_or_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notation'
    and ((storage.foldername(name))[1] = 'seed' or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Owners may delete their own files: an import that fails halfway removes
-- what it already uploaded instead of leaving orphans.
create policy "notation_owner_folder_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'notation' and (storage.foldername(name))[1] = auth.uid()::text);
