-- Guitar Learn progress, attached to the account (change: guitar learn tab).
--
-- One row per user with what the Learn tab's activities have recorded:
--   cleared       chord lessons cleared in Practice: { "<chord id>": "passed" | "skipped" }
--   changes_best  one-minute changes, best count per chord pair: { "C-Em": 23 }
--   strum_passed  strum-on-the-beat steps passed: { "<step id>": true }
-- The app also keeps a copy in the browser so the lessons work signed out,
-- and merges the two when someone signs in (src/lib/progress.ts
-- mergeGuitarProgress): a pass beats a skip, the higher best wins.
--
-- Numbered 0013 because feat/vocal-arranger uses 0011 and 0012.

create table public.guitar_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cleared jsonb not null default '{}'::jsonb,
  changes_best jsonb not null default '{}'::jsonb,
  strum_passed jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.guitar_progress enable row level security;

create policy "guitar_progress_own" on public.guitar_progress
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
