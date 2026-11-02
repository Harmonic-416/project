-- The song files someone has opened, kept on the account (change: my-files-account).
--
-- Until now an uploaded song never left the device (migration 0004:
-- copyright), so clearing the browser, or switching phones, lost it. Now
-- the file is also kept in a private bucket, `my-files`, readable by its
-- owner only: nobody else (friends included) can list or fetch it, and the
-- catalog is unchanged. A friend's shared attempt still finds its song on
-- the friend's own device, by SHA-256 (0005).
--
-- One row per user and file, named by its fingerprint; the file itself is
-- `my-files/<user id>/<fingerprint>`. The app writes both from the list it
-- keeps in the browser (app/src/tabs/home/myFiles.js) through
-- src/lib/myFiles.ts. `stored_at` says the file made it to the bucket (a
-- row without it is a file another device has but hasn't sent yet).
--
-- Numbered 0019: 0016 was never used and 0018 is the latest on main.

create table public.my_file (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(name) between 1 and 255),
  instrument text not null check (instrument in ('voice', 'guitar')),
  size integer not null check (size >= 0),
  added_at timestamptz not null default now(),
  opened_at timestamptz not null default now(),
  stored_at timestamptz,
  primary key (user_id, fingerprint)
);
alter table public.my_file enable row level security;

create policy "my_file_own" on public.my_file
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Two devices may report the same file: the first time it was added and the
-- latest time it was opened both win, whichever device reports last.
create function public.my_file_merge_times()
returns trigger
language plpgsql
as $$
begin
  new.added_at := least(old.added_at, new.added_at);
  new.opened_at := greatest(old.opened_at, new.opened_at);
  new.stored_at := coalesce(new.stored_at, old.stored_at);
  return new;
end;
$$;

create trigger my_file_merge_times before update on public.my_file
  for each row execute function public.my_file_merge_times();

-- What one account may keep: 100 files and 50 MB of them. Song files are
-- small (a MusicXML or Guitar Pro file is tens of KB, an MXL less), so that
-- is a long list; the cap is there because Supabase Free has 1 GB of file
-- storage for everyone, shared with recordings (0014). One place to change.
create function public.my_file_budget()
returns table (max_files integer, max_bytes bigint)
language sql immutable
as $$
  select 100, (50 * 1024 * 1024)::bigint;
$$;
grant execute on function public.my_file_budget() to authenticated;

-- Refuse a file that would take the account past either cap. Refreshing a
-- file already on the list is always allowed. SQLSTATE P0001 with a message
-- the app shows as is.
create function public.my_file_cap()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  files integer;
  used bigint;
  cap record;
begin
  if exists (select 1 from public.my_file where user_id = new.user_id and fingerprint = new.fingerprint) then
    return new;
  end if;
  select * into cap from public.my_file_budget();
  select count(*), coalesce(sum(size), 0) into files, used from public.my_file where user_id = new.user_id;
  if files >= cap.max_files then
    raise exception 'Your account already keeps % song files. Remove some in My Files to keep this one.', cap.max_files
      using errcode = 'P0001';
  end if;
  if used + new.size > cap.max_bytes then
    raise exception 'Your song files are full (% MB of % MB). Remove some in My Files to keep this one.',
      round(used / 1048576.0), round(cap.max_bytes / 1048576.0)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger my_file_cap before insert on public.my_file
  for each row execute function public.my_file_cap();

-- What the caller keeps: { files, used_bytes, max_files, max_bytes }.
create function public.my_file_storage_used()
returns table (files integer, used_bytes bigint, max_files integer, max_bytes bigint)
language sql stable security definer set search_path = public
as $$
  select count(f.fingerprint)::integer, coalesce(sum(f.size), 0)::bigint, b.max_files, b.max_bytes
  from public.my_file_budget() b
  left join public.my_file f on f.user_id = auth.uid()
  group by b.max_files, b.max_bytes;
$$;
revoke execute on function public.my_file_storage_used() from public, anon;
grant execute on function public.my_file_storage_used() to authenticated;

-- ── the files ─────────────────────────────────────────────────────────────
-- Private bucket, one folder per user. 5 MB a file is far above any song
-- file and keeps one upload from eating a tenth of the account's room.
insert into storage.buckets (id, name, public, file_size_limit)
values ('my-files', 'my-files', false, 5 * 1024 * 1024)
on conflict (id) do nothing;

create policy "my_files_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'my-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- A file goes in only under its owner's folder, named by a fingerprint that
-- is already on their list, so the caps above cover the bucket too.
create policy "my_files_insert_listed" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'my-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.my_file f
      -- objects.name: a bare `name` here would be my_file's own column.
      where f.user_id = auth.uid() and f.fingerprint = storage.filename(objects.name)
    )
  );

create policy "my_files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'my-files' and (storage.foldername(name))[1] = auth.uid()::text);
