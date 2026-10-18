-- Friend handles (change: user-homepage).
--
-- Every user gets a display name plus a 4-digit tag, shown as name#tag
-- (pan#2041), so two people may share a name and still be told apart. The
-- tag is picked at random; changing your name keeps your tag unless someone
-- already has that name with that tag, in which case you get a new one.
--
-- Each user also gets an invite code for "add me" links (0009).
--
-- Privacy: profiles stay owner-only through RLS. Other users can only find
-- someone by their exact name#tag (find_user_by_handle), which returns the
-- name, tag and avatar and nothing else, so nobody can browse the user list.

-- ── columns ───────────────────────────────────────────────────────────────
alter table public.profiles
  add column tag text,
  add column avatar_url text,
  add column invite_code text;

-- Names: 2–20 letters, numbers, spaces, _ . or -, no spaces at either end.
-- NOT VALID: rows written before this migration aren't rechecked.
alter table public.profiles
  add constraint profiles_display_name_format check (
    display_name is null
    or (display_name ~ '^[A-Za-z0-9 _.-]{2,20}$' and display_name = btrim(display_name))
  ) not valid;

alter table public.profiles
  add constraint profiles_tag_format check (tag ~ '^[0-9]{4}$');

-- ── helpers ───────────────────────────────────────────────────────────────
-- A random 4-digit tag nobody else uses with this name (any tag if no name).
create function public.random_free_tag(for_name text)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  candidate text;
begin
  for attempt in 1..50 loop
    candidate := lpad((floor(random() * 9999) + 1)::int::text, 4, '0');
    if for_name is null or not exists (
      select 1 from public.profiles p
      where lower(p.display_name) = lower(for_name) and p.tag = candidate
    ) then
      return candidate;
    end if;
  end loop;
  raise exception 'That name is too popular, try another' using errcode = '23505';
end;
$$;
revoke execute on function public.random_free_tag(text) from public, anon, authenticated;

-- A starting name from the sign-in provider (Google's first name, say),
-- cleaned up to fit the name rules, or null if nothing usable.
create function public.name_from_metadata(meta jsonb)
returns text
language sql immutable
as $$
  select case
    when length(cleaned) between 2 and 20 then cleaned
    else null
  end
  from (
    select left(
      regexp_replace(
        split_part(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), ' ', 1),
        '[^A-Za-z0-9_.-]', '', 'g'
      ),
      20
    ) as cleaned
  ) s;
$$;
revoke execute on function public.name_from_metadata(jsonb) from public, anon, authenticated;

create function public.new_invite_code()
returns text
language sql volatile
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
$$;
revoke execute on function public.new_invite_code() from public, anon, authenticated;

-- ── backfill existing users ───────────────────────────────────────────────
update public.profiles p
set display_name = coalesce(p.display_name, public.name_from_metadata(u.raw_user_meta_data)),
    avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data ->> 'avatar_url')
from auth.users u
where u.id = p.id;

-- One row at a time, so each tag is checked against the ones already given.
do $$
declare
  r record;
begin
  for r in select id, display_name from public.profiles where tag is null loop
    update public.profiles
    set tag = public.random_free_tag(r.display_name),
        invite_code = coalesce(invite_code, public.new_invite_code())
    where id = r.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column tag set not null,
  alter column invite_code set not null;

create unique index profiles_handle_idx on public.profiles (lower(display_name), tag)
  where display_name is not null;
create unique index profiles_invite_code_idx on public.profiles (invite_code);

-- ── new users ─────────────────────────────────────────────────────────────
-- Same trigger as 0001, now also filling in name, tag, avatar and invite code.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  starting_name text := public.name_from_metadata(new.raw_user_meta_data);
begin
  insert into public.profiles (id, display_name, tag, avatar_url, invite_code)
  values (
    new.id,
    starting_name,
    public.random_free_tag(starting_name),
    new.raw_user_meta_data ->> 'avatar_url',
    public.new_invite_code()
  );
  return new;
end;
$$;

-- ── changing your own profile ─────────────────────────────────────────────
-- Name changes go through set_display_name so the tag stays unique; nothing
-- else on a profile is editable from the app.
revoke update on public.profiles from anon, authenticated;

create function public.set_display_name(new_name text)
returns table (display_name text, tag text)
language plpgsql volatile security definer set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(new_name, ''));
  my_tag text;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if clean !~ '^[A-Za-z0-9 _.-]{2,20}$' then
    raise exception 'Names are 2 to 20 letters, numbers, spaces, _ . or -' using errcode = '22023';
  end if;

  select p.tag into my_tag from public.profiles p where p.id = me;
  if exists (
    select 1 from public.profiles p
    where p.id <> me and lower(p.display_name) = lower(clean) and p.tag = my_tag
  ) then
    my_tag := public.random_free_tag(clean);
  end if;

  update public.profiles p set display_name = clean, tag = my_tag where p.id = me;
  return query select p.display_name, p.tag from public.profiles p where p.id = me;
end;
$$;
revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

-- A new invite code; links with the old one stop working.
create function public.reset_invite_code()
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  code text := public.new_invite_code();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.profiles p set invite_code = code where p.id = me;
  return code;
end;
$$;
revoke execute on function public.reset_invite_code() from public, anon;
grant execute on function public.reset_invite_code() to authenticated;

-- ── finding someone ───────────────────────────────────────────────────────
-- Exact name#tag only (name is case-insensitive). Returns at most one person.
create function public.find_user_by_handle(handle text)
returns table (id uuid, display_name text, tag text, avatar_url text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.display_name, p.tag, p.avatar_url
  from public.profiles p
  where p.display_name is not null
    and lower(p.display_name) = lower(btrim(split_part(handle, '#', 1)))
    and p.tag = btrim(split_part(handle, '#', 2))
  limit 1;
$$;
revoke execute on function public.find_user_by_handle(text) from public, anon;
grant execute on function public.find_user_by_handle(text) to authenticated;