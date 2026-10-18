-- Friends and friend requests (change: user-homepage).
--
-- One row per pair of users, whichever of them asked first. A request is
-- 'pending' until the other person accepts it ('accepted'); declining,
-- cancelling and unfriending all delete the row, so either can ask again.
--
-- Rows are readable only by the two people in them, and the app can't write
-- the table directly: every change goes through the functions below, which
-- check who is asking.

create table public.friendship (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint friendship_not_self check (requester_id <> addressee_id)
);

-- One row per pair, in either direction.
create unique index friendship_pair_idx on public.friendship (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index friendship_addressee_idx on public.friendship (addressee_id);

alter table public.friendship enable row level security;

create policy "friendship_select_own" on public.friendship
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));

revoke insert, update, delete on public.friendship from anon, authenticated;

-- ── helpers ───────────────────────────────────────────────────────────────
create function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendship f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;
revoke execute on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ── sending a request ─────────────────────────────────────────────────────
-- Returns what happened:
--   'requested'          a new request is waiting for them
--   'accepted'           they had already asked you, so you're now friends
--   'already_requested'  you had already asked them
--   'already_friends'
create function public.send_friend_request(target uuid)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing public.friendship;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if target is null or target = me then
    raise exception 'You can''t add yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target) then
    raise exception 'No such user' using errcode = 'P0002';
  end if;

  select * into existing from public.friendship f
  where least(f.requester_id, f.addressee_id) = least(me, target)
    and greatest(f.requester_id, f.addressee_id) = greatest(me, target)
  for update;

  if not found then
    insert into public.friendship (requester_id, addressee_id) values (me, target);
    return 'requested';
  elsif existing.status = 'accepted' then
    return 'already_friends';
  elsif existing.requester_id = me then
    return 'already_requested';
  else
    update public.friendship f set status = 'accepted', accepted_at = now() where f.id = existing.id;
    return 'accepted';
  end if;
end;
$$;
revoke execute on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- ── answering a request ───────────────────────────────────────────────────
-- Only the person the request was sent to can answer it.
create function public.respond_friend_request(request_id uuid, accept boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if accept then
    update public.friendship f
    set status = 'accepted', accepted_at = now()
    where f.id = request_id and f.addressee_id = me and f.status = 'pending';
  else
    delete from public.friendship f
    where f.id = request_id and f.addressee_id = me and f.status = 'pending';
  end if;
  if not found then
    raise exception 'That request is gone' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Unfriend, or cancel a request you sent (or decline one you got).
create function public.remove_friend(other uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  delete from public.friendship f
  where least(f.requester_id, f.addressee_id) = least(me, other)
    and greatest(f.requester_id, f.addressee_id) = greatest(me, other);
end;
$$;
revoke execute on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ── listing ───────────────────────────────────────────────────────────────
-- Your friends and requests, with the other person's name, tag and avatar.
-- kind: 'friend' | 'incoming' (they asked you) | 'outgoing' (you asked them)
create function public.list_friends()
returns table (
  friendship_id uuid,
  user_id uuid,
  display_name text,
  tag text,
  avatar_url text,
  kind text,
  since timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    f.id,
    p.id,
    p.display_name,
    p.tag,
    p.avatar_url,
    case
      when f.status = 'accepted' then 'friend'
      when f.addressee_id = auth.uid() then 'incoming'
      else 'outgoing'
    end,
    coalesce(f.accepted_at, f.created_at)
  from public.friendship f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
  order by lower(coalesce(p.display_name, '')), p.tag;
$$;
revoke execute on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated;

-- ── invite links ──────────────────────────────────────────────────────────
-- Opening someone's invite link makes you friends straight away: they chose
-- to hand out the link. If a link gets around, reset_invite_code() (0008)
-- turns it off.
--
-- result: 'friends' | 'already_friends' | 'self'
create function public.accept_invite(code text)
returns table (user_id uuid, display_name text, tag text, avatar_url text, result text)
language plpgsql volatile security definer set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  inviter public.profiles;
  existing public.friendship;
  outcome text;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select * into inviter from public.profiles p where p.invite_code = btrim(code);
  if not found then
    raise exception 'That invite link doesn''t work any more' using errcode = 'P0002';
  end if;

  if inviter.id = me then
    outcome := 'self';
  else
    select * into existing from public.friendship f
    where least(f.requester_id, f.addressee_id) = least(me, inviter.id)
      and greatest(f.requester_id, f.addressee_id) = greatest(me, inviter.id)
    for update;

    if not found then
      insert into public.friendship (requester_id, addressee_id, status, accepted_at)
      values (me, inviter.id, 'accepted', now());
      outcome := 'friends';
    elsif existing.status = 'accepted' then
      outcome := 'already_friends';
    else
      update public.friendship f set status = 'accepted', accepted_at = now() where f.id = existing.id;
      outcome := 'friends';
    end if;
  end if;

  return query select inviter.id, inviter.display_name, inviter.tag, inviter.avatar_url, outcome;
end;
$$;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;