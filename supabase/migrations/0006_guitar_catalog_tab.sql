-- The guitar catalog's Ode to Joy pointed at the Vocal tab's file, which has
-- no strings or frets, so the Guitar tab could only show it as notation.
-- It now has its own copy with string/fret on every note (open position),
-- written by tests/fixtures/guitar/generate.mjs. The Vocal tab's row
-- (...0011) keeps seed/ode-to-joy.musicxml.
--
-- Upload supabase/seed/notation/ode-to-joy-guitar.musicxml to the notation
-- bucket at seed/ode-to-joy-guitar.musicxml (README: seed notation upload);
-- until then the catalog lists the song as "notation missing".

update public.song
set notation_path = 'seed/ode-to-joy-guitar.musicxml'
where id = '00000000-0000-4000-8000-000000000001';
