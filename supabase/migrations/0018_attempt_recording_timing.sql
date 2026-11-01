-- Shared guitar runs follow their recording (change: guitar-shared-playback).
--
-- Someone opening a shared guitar run hears the player's recording, not the
-- song's MIDI, and the tab's cursor moves along with it: at the speed and
-- tempo it was played for Trouble spots, note by note as each was played for
-- Wait for me. This column says where in the song the recording is:
--
--   timing: [[seconds into the recording, song seconds], ...], read piecewise
--           linearly (app/src/tabs/guitar/song/follow/recordingTiming.js).
--           Null on Vocal attempts, on guitar runs without a recording and on
--           runs saved before this migration (their cursor stays put).
--
-- get_shared_attempt (0014) returns the whole row, so it carries this too.

alter table public.shared_attempt
  add column timing jsonb;
