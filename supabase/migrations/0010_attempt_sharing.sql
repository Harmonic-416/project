-- Saved attempts, sending them to friends, and comments (change: user-homepage).
--
-- 1. shared_attempt now also holds attempts that were never shared: when a
--    signed-in user finishes an attempt the app saves it privately, so the
--    homepage can show the songs they're working on and their latest result.
--    link_shared says whether the attempt may be opened by anyone with its
--    link (the 0005 behaviour). Rows from before this migration were all
--    link shares, so it defaults to true; the app saves new attempts with
--    false and flips it when the player presses "Copy link".
--
-- 2. attempt_recipient: which friends an attempt was sent to. A recipient
--    can open the attempt (and its recording) without the link. Unfriending
--    later doesn't take back attempts already sent.
--
-- 3. attempt_comment: comments on an attempt by its owner and the friends it
--    was sent to.

-- ── saved attempts ────────────────────────────────────────────────────────
alter table public.shared_attempt
  add column link_shared boolean not null default true;

create index shared_attempt_owner_recent_idx on public.shared_attempt (user_id, created_at desc);

-- ── recipients ────────────────────────────────────────────────────────────
create table public.attempt_recipient (
  attempt_id uuid not null references public.shared_attempt (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  -- The attempt's owner, kept here so the policies below needn't read
  -- shared_attempt (whose own policy reads this table).
  sender_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (attempt_id, recipient_id)
);
create index attempt_recipient_inbox_idx on public.attempt_recipient (recipient_id, sent_at desc);

alter table public.attempt_recipient enable row level security;

create policy "attempt_recipient_select_own" on public.attempt_recipient
  for select to authenticated using (auth.uid() in (recipient_id, sender_id));

revoke insert, update, delete on public.attempt_recipient from anon, authenticated;

-- Recipients can read the attempt itself.
create policy "shared_attempt_recipient_select" on public.shared_attempt
  for select to authenticated
  using (
    exists (
      select 1 from public.attempt_recipient r
      where r.attempt_id = shared_attempt.id and r.recipient_id = auth.uid()
    )
  );

-- Owner or a recipient: the people who may see and comment on an attempt.
create function public.can_view_attempt(attempt uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.shared_attempt a where a.id = attempt and a.user_id = auth.uid())
      or exists (select 1 from public.attempt_recipient r where r.attempt_id = attempt and r.recipient_id = auth.uid());
$$;
revoke execute on function public.can_view_attempt(uuid) from public, anon;
grant execute on function public.can_view_attempt(uuid) to authenticated;

-- ── opening an attempt ────────────────────────────────────────────────────
-- Same as 0005, but a private attempt opens only for its owner and the
-- friends it was sent to.
create or replace function public.get_shared_attempt(attempt_id uuid)
returns setof public.shared_attempt
language sql stable security definer set search_path = public
as $$
  select a.* from public.shared_attempt a
  where a.id = attempt_id
    and (a.link_shared or public.can_view_attempt(a.id));
$$;

create or replace function public.is_shared_recording(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.shared_attempt a
    where a.recording_path = path
      and (a.link_shared or public.can_view_attempt(a.id))
  );
$$;

-- ── sending to friends ────────────────────────────────────────────────────
-- Send one of your attempts to some of your friends. Sending to someone who
-- already has it is fine. Returns how many friends it went to.
create function public.send_attempt_to_friends(attempt uuid, friend_ids uuid[])
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  friend uuid;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shared_attempt a where a.id = attempt and a.user_id = me) then
    raise exception 'That attempt isn''t yours' using errcode = '42501';
  end if;
  if coalesce(cardinality(friend_ids), 0) = 0 then
    return 0;
  end if;

  foreach friend in array friend_ids loop
    if not public.are_friends(me, friend) then
      raise exception 'You can only send attempts to friends' using errcode = '42501';
    end if;
  end loop;

  insert into public.attempt_recipient (attempt_id, recipient_id, sender_id)
  select attempt, f, me from unnest(friend_ids) as f
  on conflict (attempt_id, recipient_id) do nothing;

  return (select count(distinct f) from unnest(friend_ids) as f)::integer;
end;
$$;
revoke execute on function public.send_attempt_to_friends(uuid, uuid[]) from public, anon;
grant execute on function public.send_attempt_to_friends(uuid, uuid[]) to authenticated;

-- Take an attempt back from one friend.
create function public.unsend_attempt(attempt uuid, friend uuid)
returns void
language sql volatile security definer set search_path = public
as $$
  delete from public.attempt_recipient r
  where r.attempt_id = attempt and r.recipient_id = friend and r.sender_id = auth.uid();
$$;
revoke execute on function public.unsend_attempt(uuid, uuid) from public, anon;
grant execute on function public.unsend_attempt(uuid, uuid) to authenticated;

-- The recipient has opened it.
create function public.mark_attempt_seen(attempt uuid)
returns void
language sql volatile security definer set search_path = public
as $$
  update public.attempt_recipient r
  set seen_at = now()
  where r.attempt_id = attempt and r.recipient_id = auth.uid() and r.seen_at is null;
$$;
revoke execute on function public.mark_attempt_seen(uuid) from public, anon;
grant execute on function public.mark_attempt_seen(uuid) to authenticated;

-- ── comments ──────────────────────────────────────────────────────────────
create table public.attempt_comment (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.shared_attempt (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index attempt_comment_attempt_idx on public.attempt_comment (attempt_id, created_at);

alter table public.attempt_comment enable row level security;

create policy "attempt_comment_select" on public.attempt_comment
  for select to authenticated using (public.can_view_attempt(attempt_id));
create policy "attempt_comment_insert" on public.attempt_comment
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_attempt(attempt_id));
-- Authors can delete their comments; owners can delete any on their attempt.
create policy "attempt_comment_delete" on public.attempt_comment
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.shared_attempt a where a.id = attempt_id and a.user_id = auth.uid())
  );

revoke update on public.attempt_comment from anon, authenticated;

-- An attempt's comments, oldest first, with each author's name and tag.
create function public.list_attempt_comments(attempt uuid)
returns table (
  id uuid,
  author_id uuid,
  display_name text,
  tag text,
  avatar_url text,
  body text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.author_id, p.display_name, p.tag, p.avatar_url, c.body, c.created_at
  from public.attempt_comment c
  join public.profiles p on p.id = c.author_id
  where c.attempt_id = attempt and public.can_view_attempt(attempt)
  order by c.created_at;
$$;
revoke execute on function public.list_attempt_comments(uuid) from public, anon;
grant execute on function public.list_attempt_comments(uuid) to authenticated;

-- ── inbox ─────────────────────────────────────────────────────────────────
-- Attempts friends sent you, newest first, without the heavy pitch/verdict
-- data (open one with get_shared_attempt).
create function public.list_attempts_shared_with_me()
returns table (
  attempt_id uuid,
  sender_id uuid,
  sender_name text,
  sender_tag text,
  sender_avatar_url text,
  song_title text,
  part_name text,
  instrument text,
  accuracy numeric,
  has_recording boolean,
  sent_at timestamptz,
  seen_at timestamptz,
  comment_count integer
)
language sql stable security definer set search_path = public
as $$
  select
    a.id,
    r.sender_id,
    p.display_name,
    p.tag,
    p.avatar_url,
    a.song_title,
    a.part_name,
    a.instrument,
    a.accuracy,
    a.recording_path is not null,
    r.sent_at,
    r.seen_at,
    (select count(*) from public.attempt_comment c where c.attempt_id = a.id)::integer
  from public.attempt_recipient r
  join public.shared_attempt a on a.id = r.attempt_id
  join public.profiles p on p.id = r.sender_id
  where r.recipient_id = auth.uid()
  order by r.sent_at desc;
$$;
revoke execute on function public.list_attempts_shared_with_me() from public, anon;
grant execute on function public.list_attempts_shared_with_me() to authenticated;