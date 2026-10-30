-- Guitar run history (change: guitar-run-history, F22).
--
-- Every finished guitar run on a song — "Wait for me" or "Trouble spots" —
-- is saved privately as an attempt (shared_attempt, 0005/0007/0010) inside
-- the song's practice session (0014), like a recorded Vocal attempt. These
-- columns say what kind of run it was, so the song can show the last and
-- best score of comparable runs. Null on Vocal attempts and on guitar
-- attempts saved before this migration.
--
--   mode:     'wait' (Wait for me) or 'trouble' (Trouble spots)
--   easy:     played in the song's Easy version (F45), which scores fewer notes
--   full_run: the run went from the first scored note to the end; a looped
--             bar or a run stopped early is kept, but doesn't count toward
--             the song's last and best score
--
-- get_shared_attempt (0014) returns the whole row, so it carries these too.
-- The owner's "for all" policy (0005) already lets the app correct a saved
-- run after the note-by-note re-check.

alter table public.shared_attempt
  add column mode text check (mode in ('wait', 'trouble')),
  add column easy boolean,
  add column full_run boolean;

-- The last and best score at one song and mode, newest first.
create index shared_attempt_song_scores_idx
  on public.shared_attempt (user_id, song_fingerprint, instrument, mode, created_at desc)
  where full_run;
