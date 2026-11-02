-- Feedback about the site (change: site-feedback).
--
-- The "Feedback" button in the tab bar (app/src/feedback/) sends a message
-- about any part of Harmonic, signed in or not. The team reads the rows in
-- the Supabase dashboard, so nobody can read them back through the API:
-- there are insert policies only. Signed-out people may leave an email to
-- be answered on; signed-in people are known by their user id.
--
-- Numbered 0020: 0019 is taken by the my-files change.

create table public.site_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  area text not null default 'other' check (area in ('home', 'vocal', 'guitar', 'social', 'other')),
  rating smallint check (rating between 1 and 5),
  message text not null check (char_length(message) between 1 and 4000),
  contact text check (char_length(contact) <= 200),
  page text check (char_length(page) <= 200),
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
alter table public.site_feedback enable row level security;

create index site_feedback_user_created on public.site_feedback (user_id, created_at);

-- Anyone may send; no one may pretend to be someone else.
create policy "site_feedback_insert_anon" on public.site_feedback
  for insert to anon with check (user_id is null);

create policy "site_feedback_insert_own" on public.site_feedback
  for insert to authenticated with check (user_id is null or user_id = auth.uid());

grant insert on public.site_feedback to anon, authenticated;

-- A light brake on a stuck button or a script: at most 10 messages an hour
-- from one account. Signed-out messages aren't tied to anyone, so they rely
-- on the length limits above. SQLSTATE P0001 with a message the app shows as is.
create function public.site_feedback_rate()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.user_id is not null and (
    select count(*) from public.site_feedback
    where user_id = new.user_id and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'That’s a lot of feedback in one hour — thank you! Please try again a little later.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger site_feedback_rate before insert on public.site_feedback
  for each row execute function public.site_feedback_rate();
