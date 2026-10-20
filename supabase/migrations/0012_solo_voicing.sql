-- A soloist with the words over a TTBB backing group (arrange.js VOICINGS.solo_ttbb).
alter table public.arrangement_job drop constraint arrangement_job_voicing_check;
alter table public.arrangement_job add constraint arrangement_job_voicing_check check (voicing in ('solo_ttbb', 'ttbb', 'satb', 'tb'));
