-- Scored practice runs (change: persistent-practice-runs).
--
-- "Wait for me" and "Trouble spots" score every run that starts from the
-- top of the song (app/src/tabs/vocal/practice/scoring.js) and chart the
-- tries per song, part, accompaniment and mode. Until now the tries lived
-- in the tab's sessionStorage and were gone when the tab closed; this table
-- keeps them on the account, so the chart shows every try on any device.
-- Signed-out runs stay in the browser's localStorage.
--
-- A run may belong to the practice session it was sung in (0014); deleting
-- the session keeps the run. The practice sessions view lists a session's
-- runs with their note counts. Owner-only, like the rest of practice history.

create table public.practice_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid references public.song (id) on delete cascade,
  song_fingerprint text not null check (song_fingerprint ~ '^[0-9a-f]{64}$'),
  song_title text not null default '' check (length(song_title) <= 300),
  part_id text check (length(part_id) <= 200),
  part_name text check (length(part_name) <= 200),
  accompaniment text not null check (accompaniment in ('solo', 'all')),
  mode text not null check (mode in ('wait', 'trouble')),
  score numeric not null check (score >= 0 and score <= 100),
  -- What the score was made of, note by note (null for runs saved before
  -- counts were kept). Wait for me: right = found within 3 s, half = slower.
  -- Trouble spots: right = on pitch, half = a half step off, missed = the rest.
  notes_total integer check (notes_total >= 0),
  notes_right integer check (notes_right >= 0),
  notes_half integer check (notes_half >= 0),
  notes_missed integer check (notes_missed >= 0),
  session_id uuid references public.practice_session (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One chart: a user's runs at one song, part, accompaniment and mode, newest first.
create index practice_run_chart_idx
  on public.practice_run (user_id, song_fingerprint, part_id, accompaniment, mode, created_at desc);
create index practice_run_session_idx on public.practice_run (session_id) where session_id is not null;

alter table public.practice_run enable row level security;

create policy "practice_run_select_own" on public.practice_run
  for select to authenticated using (auth.uid() = user_id);

-- A run can only be attached to one of your own sessions.
create policy "practice_run_insert_own" on public.practice_run
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      session_id is null
      or exists (select 1 from public.practice_session s where s.id = session_id and s.user_id = auth.uid())
    )
  );

create policy "practice_run_delete_own" on public.practice_run
  for delete to authenticated using (auth.uid() = user_id);
