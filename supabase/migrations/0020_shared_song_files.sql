-- A take sent to a friend brings its song along (change: shared-song-files).
--
-- Since 0019 a signed-in user's song files are kept on their account, in
-- the private bucket `my-files` at `<user id>/<fingerprint>`, owner-only.
-- A shared attempt of such a song names it by that same fingerprint (0005),
-- and until now the friend it was sent to had to find their own copy of the
-- file. Now the people an attempt was SENT to may read the sender's stored
-- file for that attempt's song, and nothing else:
--
--   who   the attempt's owner, or a friend it was sent to (attempt_recipient),
--         i.e. can_view_attempt (0010). Someone who only has the attempt's
--         public link does not qualify: a link can travel anywhere, and the
--         song is its owner's file, shared person to person.
--   what  exactly `my-files/<attempt owner's id>/<attempt's song_fingerprint>`.
--         The owner's other files, their list (my_file), and every write
--         stay owner-only as 0019 left them.
--   until the attempt is unsent (0010: unsend_attempt) or deleted, or the
--         owner removes the file from their account.
--
-- Safe to run twice (the policy is dropped first, the function replaced).

-- ── reading the file ──────────────────────────────────────────────────────
drop policy if exists "my_files_read_sent" on storage.objects;
create policy "my_files_read_sent" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'my-files'
    and exists (
      select 1 from public.shared_attempt a
      -- objects.name: a bare `name` in here would not be the object's.
      where a.user_id::text = (storage.foldername(objects.name))[1]
        and a.song_fingerprint = storage.filename(objects.name)
        and public.can_view_attempt(a.id)
    )
  );

-- ── finding it ────────────────────────────────────────────────────────────
-- Where the song of an attempt is kept, for someone it was sent to: one row
-- when the caller can view the attempt and its owner has that file on their
-- account (the file itself, not just its row), else none. my_file is
-- owner-only, so this is the one way a recipient learns the file's name.
create or replace function public.shared_attempt_song(attempt uuid)
returns table (
  owner_id uuid,
  path text,
  fingerprint text,
  name text,
  instrument text,
  size integer
)
language sql stable security definer set search_path = public
as $$
  select a.user_id, a.user_id::text || '/' || f.fingerprint, f.fingerprint, f.name, f.instrument, f.size
  from public.shared_attempt a
  join public.my_file f on f.user_id = a.user_id and f.fingerprint = a.song_fingerprint
  where a.id = attempt
    and f.stored_at is not null
    and public.can_view_attempt(a.id);
$$;
revoke execute on function public.shared_attempt_song(uuid) from public, anon;
grant execute on function public.shared_attempt_song(uuid) to authenticated;
