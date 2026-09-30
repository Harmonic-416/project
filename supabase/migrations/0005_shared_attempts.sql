-- Shared attempts: a sung attempt (pitch trace, score, optional recording)
-- that its owner sends to someone else as a link. The song itself is never
-- stored (copyright): either it is a catalog song (song_id), or the viewer
-- opens their own copy of the file, matched by its SHA-256 (song_fingerprint).
--
-- Access: creating and opening a share both need a signed-in user. Rows are
-- owner-only through RLS, so nobody can list other people's shares; a viewer
-- reads exactly one row by its unguessable id through get_shared_attempt().

create table public.shared_attempt (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sharer_name text,
  song_id uuid references public.song (id) on delete cascade,
  song_title text not null,
  song_format text check (song_format in ('midi', 'musicxml', 'mxl')),
  song_fingerprint text check (song_fingerprint ~ '^[0-9a-f]{64}$'),
  part_id text,
  part_name text,
  with_others boolean not null default false,
  -- [[seconds, midi], ...] on the score's playback clock
  samples jsonb not null check (jsonb_typeof(samples) = 'array' and jsonb_array_length(samples) <= 30000),
  accuracy numeric not null check (accuracy >= 0 and accuracy <= 100),
  recording_path text,
  created_at timestamptz not null default now(),
  constraint shared_attempt_song check (song_id is not null or song_fingerprint is not null)
);
alter table public.shared_attempt enable row level security;

create policy "shared_attempt_own" on public.shared_attempt
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One share by id, for any signed-in user who has the link.
create function public.get_shared_attempt(attempt_id uuid)
returns setof public.shared_attempt
language sql stable security definer set search_path = public
as $$
  select * from public.shared_attempt where id = attempt_id;
$$;
revoke execute on function public.get_shared_attempt(uuid) from public, anon;
grant execute on function public.get_shared_attempt(uuid) to authenticated;

-- Recordings stay owner-only, except the one attached to a share, which any
-- signed-in user may read (the path contains a random id, like the link).
create function public.is_shared_recording(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.shared_attempt where recording_path = path);
$$;
revoke execute on function public.is_shared_recording(text) from public, anon;
grant execute on function public.is_shared_recording(text) to authenticated;

create policy "recordings_shared_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and public.is_shared_recording(name));
