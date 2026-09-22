-- Song catalog (F4): public seed songs (user_id NULL) that every signed-in
-- user can open in the Vocal tab or copy into their own library. The files
-- live in the private `notation` bucket under seed/ — sources are kept in
-- supabase/seed/notation/ and uploaded with the CLI (see README).
insert into public.song (id, user_id, title, artist, instrument, notation_path) values
  ('00000000-0000-4000-8000-000000000011', null, 'Ode to Joy',                  'Beethoven',   'voice', 'seed/ode-to-joy.musicxml'),
  ('00000000-0000-4000-8000-000000000012', null, 'Twinkle Twinkle Little Star', 'Traditional', 'voice', 'seed/twinkle-twinkle.musicxml'),
  ('00000000-0000-4000-8000-000000000013', null, 'C Major Scale (warm-up)',     null,          'voice', 'seed/c-major-scale.musicxml')
on conflict (id) do nothing;
