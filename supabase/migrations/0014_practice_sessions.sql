-- Practice sessions, owner feedback and the recording budget
-- (change: practice-sessions; design in openspec/changes/practice-sessions).
--
-- 1. practice_session: one sitting at a song. The app starts it when a
--    signed-in user opens a song to practise and ends it when they leave,
--    or after 30 minutes without an attempt (then at the last attempt).
--    Attempts finished in between carry its id (shared_attempt.session_id).
--
-- 2. Owner feedback on an attempt: self_note and rating (1..5) on
--    shared_attempt. Private to the owner: get_shared_attempt blanks them
--    for a friend or a link.
--
-- 3. Recording budget: the live project is on Supabase's Free plan (1 GB of
--    file storage in all), so audio is opt-in per attempt and capped per
--    user. recording_bytes is tracked on the attempt; a trigger refuses a
--    recording that would take its owner past recording_budget_bytes().
--    Rows without audio always go through: scores, traces and feedback
--    are never budgeted.
--
-- Numbered 0014 because 0013 is the guitar Learn progress.

-- ── practice_session ──────────────────────────────────────────────────────
create table public.practice_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid references public.song (id) on delete cascade,
  song_fingerprint text check (song_fingerprint ~ '^[0-9a-f]{64}$'),
  song_title text not null,
  instrument text not null default 'voice' check (instrument in ('voice', 'guitar')),
  started_at timestamptz not null default now(),
  ended_at timestamptz check (ended_at is null or ended_at >= started_at),
  title text check (title is null or length(title) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  constraint practice_session_song check (song_id is not null or song_fingerprint is not null)
);
alter table public.practice_session enable row level security;

create policy "practice_session_own" on public.practice_session
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A user's sessions, most recent first.
create index practice_session_owner_recent_idx on public.practice_session (user_id, started_at desc);

-- ── attempts: session, feedback, recording size ───────────────────────────
alter table public.shared_attempt
  add column session_id uuid references public.practice_session (id) on delete set null,
  add column self_note text check (self_note is null or length(self_note) <= 2000),
  add column rating smallint check (rating is null or rating between 1 and 5),
  add column recording_bytes integer check (recording_bytes is null or recording_bytes >= 0);

-- A session's attempts, in order.
create index shared_attempt_session_idx on public.shared_attempt (session_id, created_at)
  where session_id is not null;

-- ── idle sessions ─────────────────────────────────────────────────────────
-- End the caller's open sessions whose last activity (the later of the start
-- and the last attempt) is older than `idle`, at that activity. The app calls
-- it before starting a session, so a tab closed mid-practice never leaves a
-- session open for days. Returns how many it closed.
create function public.close_idle_practice_sessions(idle interval default interval '30 minutes')
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  closed integer;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- (A subquery rather than a CTE: the Supabase CLI's migration splitter
  -- rejects "with ... update" inside a plpgsql body.)
  update public.practice_session s
  set ended_at = x.last_active
  from (
    select s2.id, greatest(s2.started_at, coalesce(max(a.created_at), s2.started_at)) as last_active
    from public.practice_session s2
    left join public.shared_attempt a on a.session_id = s2.id
    where s2.user_id = me and s2.ended_at is null
    group by s2.id, s2.started_at
  ) x
  where s.id = x.id and x.last_active < now() - idle;
  get diagnostics closed = row_count;
  return closed;
end;
$$;
revoke execute on function public.close_idle_practice_sessions(interval) from public, anon;
grant execute on function public.close_idle_practice_sessions(interval) to authenticated;

-- ── recording budget ──────────────────────────────────────────────────────
-- The cap per user. One place to change (e.g. on the Pro plan).
create function public.recording_budget_bytes()
returns bigint
language sql immutable
as $$
  select 100 * 1024 * 1024;
$$;
grant execute on function public.recording_budget_bytes() to authenticated;

-- Refuse a recording that would take its owner past the cap. Rows without a
-- recording never trip it. SQLSTATE P0001 with a message the app shows as is.
create function public.check_recording_budget()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  used bigint;
  cap bigint := public.recording_budget_bytes();
begin
  if new.recording_bytes is null or new.recording_bytes = 0 then
    return new;
  end if;
  select coalesce(sum(a.recording_bytes), 0) into used
  from public.shared_attempt a
  where a.user_id = new.user_id and a.id <> new.id;
  if used + new.recording_bytes > cap then
    raise exception 'Recording storage is full (% MB of % MB used). Delete some recordings to keep this one.',
      round(used / 1048576.0), round(cap / 1048576.0)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger shared_attempt_recording_budget
  before insert or update of recording_path, recording_bytes on public.shared_attempt
  for each row execute function public.check_recording_budget();

-- What the caller has used: { used_bytes, cap_bytes, recordings }.
create function public.recording_storage_used()
returns table (used_bytes bigint, cap_bytes bigint, recordings integer)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(sum(a.recording_bytes), 0)::bigint,
    public.recording_budget_bytes(),
    count(a.recording_path)::integer
  from public.shared_attempt a
  where a.user_id = auth.uid();
$$;
revoke execute on function public.recording_storage_used() from public, anon;
grant execute on function public.recording_storage_used() to authenticated;

-- One attempt is a few minutes of webm/opus (about 0.5–1 MB a minute); a
-- per-file limit well under the plan's 50 MB keeps a runaway recording from
-- eating a quarter of someone's budget in one go.
update storage.buckets set file_size_limit = 25 * 1024 * 1024 where id = 'recordings';

-- ── opening an attempt ────────────────────────────────────────────────────
-- Same as 0010, except that the owner's note and rating come back as null to
-- anyone but the owner (a friend it was sent to, or someone with the link).
create or replace function public.get_shared_attempt(attempt_id uuid)
returns setof public.shared_attempt
language sql stable security definer set search_path = public
as $$
  select (jsonb_populate_record(
    null::public.shared_attempt,
    to_jsonb(a) || case
      when a.user_id = auth.uid() then '{}'::jsonb
      else '{"self_note": null, "rating": null}'::jsonb
    end
  )).*
  from public.shared_attempt a
  where a.id = attempt_id
    and (a.link_shared or public.can_view_attempt(a.id));
$$;
