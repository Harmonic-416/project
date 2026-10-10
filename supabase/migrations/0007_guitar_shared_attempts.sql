-- Shared attempts from the Guitar tab (Trouble spots on a guitar song).
-- A guitar attempt has no pitch trace to redraw: what it shares is the
-- verdict on every note of the practised track ('hit' | 'close' | 'miss' |
-- 'skipped', or null where the run didn't reach), indexed like the Guitar
-- tab's song timeline. Like a sung attempt it never stores the song: a
-- catalog song by id, anything else by its file's SHA-256.

alter table public.shared_attempt
  add column instrument text not null default 'voice' check (instrument in ('voice', 'guitar')),
  add column verdicts jsonb check (
    verdicts is null or (jsonb_typeof(verdicts) = 'array' and jsonb_array_length(verdicts) <= 30000)
  );

-- Guitar songs also come as Guitar Pro and alphaTex files.
alter table public.shared_attempt drop constraint shared_attempt_song_format_check;
alter table public.shared_attempt
  add constraint shared_attempt_song_format_check
  check (song_format in ('midi', 'musicxml', 'mxl', 'guitar-pro', 'alphatex'));
