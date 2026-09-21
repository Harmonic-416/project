-- Harmonic backend schema (change: add-backend-services)
-- Tables per openspec/changes/add-backend-services/design.md.
-- Posture: RLS default-deny on every per-user table; auth.uid() = user_id.

-- ── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_own_select" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_own_update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── song ──────────────────────────────────────────────────────────────────
-- Seed/public songs have user_id NULL: readable by all authenticated users,
-- writable by nobody through the client (F4). Imported songs carry the owner.
create table public.song (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  artist text,
  instrument text not null check (instrument in ('guitar', 'voice')),
  notation_path text not null, -- Storage path to canonical MusicXML
  created_at timestamptz not null default now()
);
alter table public.song enable row level security;

create policy "song_select_public_or_own" on public.song
  for select to authenticated using (user_id is null or auth.uid() = user_id);
create policy "song_insert_own" on public.song
  for insert to authenticated with check (auth.uid() = user_id);
create policy "song_update_own" on public.song
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "song_delete_own" on public.song
  for delete to authenticated using (auth.uid() = user_id);

-- ── lesson_progress (F2) ──────────────────────────────────────────────────
create table public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  node_id text not null,
  state text not null default 'completed' check (state in ('completed')),
  updated_at timestamptz not null default now(),
  primary key (user_id, node_id)
);
alter table public.lesson_progress enable row level security;

create policy "lesson_progress_own" on public.lesson_progress
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── run_through (F22) ─────────────────────────────────────────────────────
create table public.run_through (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  song_id uuid not null references public.song (id) on delete cascade,
  score numeric not null check (score >= 0 and score <= 100),
  created_at timestamptz not null default now()
);
alter table public.run_through enable row level security;

create policy "run_through_own" on public.run_through
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index run_through_last_score_idx
  on public.run_through (user_id, song_id, created_at desc);

-- ── song_pref (F37: tempo 50–100%) ────────────────────────────────────────
create table public.song_pref (
  user_id uuid not null references auth.users (id) on delete cascade,
  song_id uuid not null references public.song (id) on delete cascade,
  tempo_pct integer not null check (tempo_pct between 50 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
alter table public.song_pref enable row level security;

create policy "song_pref_own" on public.song_pref
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── recording (F23, N3, N5) ───────────────────────────────────────────────
create table public.recording (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_through_id uuid not null references public.run_through (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'audio/webm;codecs=opus',
  bytes integer,
  created_at timestamptz not null default now()
);
alter table public.recording enable row level security;

create policy "recording_own" on public.recording
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Storage buckets ───────────────────────────────────────────────────────
-- recordings: private; objects live under <user_id>/<recording_id>.<ext>
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- notation: private bucket; seed files under seed/, user imports under <user_id>/
insert into storage.buckets (id, name, public)
values ('notation', 'notation', false)
on conflict (id) do nothing;

create policy "recordings_owner_folder_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "notation_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'notation');

create policy "notation_owner_folder_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notation' and (storage.foldername(name))[1] = auth.uid()::text);
