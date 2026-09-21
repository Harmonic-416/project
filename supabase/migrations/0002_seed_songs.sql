-- Seed the 3 V1 songs (F4). user_id NULL = public/seed: readable by all
-- authenticated users, immutable through the client (see song RLS policies).
-- Notation files must be uploaded to the 'notation' bucket at these paths
-- (see README: seed notation upload).

insert into public.song (id, user_id, title, artist, instrument, notation_path) values
  ('00000000-0000-4000-8000-000000000001', null, 'Ode to Joy',         'Beethoven',  'guitar', 'seed/ode-to-joy.musicxml'),
  ('00000000-0000-4000-8000-000000000002', null, 'House of the Rising Sun', 'Traditional', 'guitar', 'seed/house-of-the-rising-sun.musicxml'),
  ('00000000-0000-4000-8000-000000000003', null, 'Amazing Grace',      'Traditional', 'voice',  'seed/amazing-grace.musicxml')
on conflict (id) do nothing;
