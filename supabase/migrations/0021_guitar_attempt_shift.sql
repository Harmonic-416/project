alter table public.shared_attempt
  add column guitar_shift smallint not null default 0
  check (guitar_shift between -12 and 12 and (instrument = 'guitar' or guitar_shift = 0));
