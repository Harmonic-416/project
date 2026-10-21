-- Arrangements from a YouTube link. The Vocal tab's arranger normally runs
-- on the device from an audio file the user has. For a link, a signed-in
-- user queues a job here and the arranger worker (worker/arranger/, on a
-- server of our own) fetches the audio, arranges it, and leaves only the
-- result: the MusicXML in the private `arrangements` bucket, under the
-- user's folder. The audio is deleted as soon as it has been heard and is
-- never stored or served.
--
-- Access: only users on the arranger_access list may queue jobs (a short
-- list, kept by hand with the service role), each at most
-- arranger_daily_limit() a day and two at a time. A user sees only their
-- own jobs and results. Everything else about a job (its status, progress
-- and result) is written by the worker, with the service role.

create table public.arranger_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.arranger_access enable row level security;

create policy "arranger_access_own" on public.arranger_access
  for select to authenticated using (auth.uid() = user_id);

create table public.arrangement_job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  voicing text not null default 'ttbb' check (voicing in ('ttbb', 'satb', 'tb')),
  melody_part smallint not null default 0 check (melody_part between 0 and 3),
  keep_key boolean not null default false,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  stage text,
  progress real not null default 0 check (progress between 0 and 1),
  title text,
  -- What the arranger did: { key, shift, melodyPartName, bpm, measures }.
  summary jsonb,
  result_path text,
  error text,
  worker text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index arrangement_job_queue on public.arrangement_job (created_at) where status = 'queued';
create index arrangement_job_user on public.arrangement_job (user_id, created_at desc);
alter table public.arrangement_job enable row level security;

create policy "arrangement_job_select_own" on public.arrangement_job
  for select to authenticated using (auth.uid() = user_id);

create policy "arrangement_job_insert_allowed" on public.arrangement_job
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.arranger_access a where a.user_id = auth.uid())
  );

create policy "arrangement_job_delete_own" on public.arrangement_job
  for delete to authenticated using (auth.uid() = user_id and status in ('done', 'failed'));

-- A user picks only what to arrange; the worker writes the rest.
revoke insert, update on public.arrangement_job from anon, authenticated;
grant insert (youtube_id, voicing, melody_part, keep_key) on public.arrangement_job to authenticated;

create function public.arranger_daily_limit()
returns integer
language sql immutable
as $$ select 10 $$;

-- The limits, checked as a job is queued.
create function public.arrangement_job_limits()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.arrangement_job
      where user_id = new.user_id and created_at > now() - interval '1 day') >= public.arranger_daily_limit() then
    raise exception 'arranger_daily_limit: at most % arrangements a day', public.arranger_daily_limit()
      using errcode = 'P0001';
  end if;
  if (select count(*) from public.arrangement_job
      where user_id = new.user_id and status in ('queued', 'running')) >= 2 then
    raise exception 'arranger_busy: two arrangements are already on their way' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger arrangement_job_limits before insert on public.arrangement_job
  for each row execute function public.arrangement_job_limits();

-- The worker's next job: the oldest queued one, marked running, or nothing.
-- SKIP LOCKED lets several workers share the queue.
create function public.claim_arrangement_job(worker_name text)
returns setof public.arrangement_job
language sql security definer set search_path = public
as $$
  update public.arrangement_job
  set status = 'running', worker = worker_name, started_at = now(), stage = 'Getting ready', progress = 0
  where id = (
    select id from public.arrangement_job
    where status = 'queued'
    order by created_at
    limit 1
    for update skip locked
  )
  returning *;
$$;
revoke execute on function public.claim_arrangement_job(text) from public, anon, authenticated;
grant execute on function public.claim_arrangement_job(text) to service_role;

-- Results: written by the worker, readable by their owner.
insert into storage.buckets (id, name, public)
values ('arrangements', 'arrangements', false)
on conflict (id) do nothing;

create policy "arrangements_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'arrangements' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "arrangements_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'arrangements' and (storage.foldername(name))[1] = auth.uid()::text);
