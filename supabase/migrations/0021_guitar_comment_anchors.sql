alter table public.attempt_comment add column anchor_index integer;

create function public.validate_attempt_comment_anchor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.anchor_index is not null and (
    not public.can_view_attempt(new.attempt_id)
    or not exists (
      select 1 from public.shared_attempt a
      where a.id = new.attempt_id and a.instrument = 'guitar'
        and new.anchor_index >= 0
        and a.verdicts ->> new.anchor_index in ('hit', 'close', 'miss')
    )
  ) then
    raise exception 'The comment must point to a scored note in this run.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_attempt_comment_anchor() from public;
create trigger attempt_comment_validate_anchor
before insert or update of anchor_index, attempt_id on public.attempt_comment
for each row execute function public.validate_attempt_comment_anchor();

drop function public.list_attempt_comments(uuid);
create function public.list_attempt_comments(attempt uuid)
returns table (
  id uuid, author_id uuid, display_name text, tag text, avatar_url text,
  body text, created_at timestamptz, anchor_index integer
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.author_id, p.display_name, p.tag, p.avatar_url, c.body, c.created_at, c.anchor_index
  from public.attempt_comment c
  join public.profiles p on p.id = c.author_id
  where c.attempt_id = attempt and public.can_view_attempt(attempt)
  order by c.created_at, c.id;
$$;
revoke execute on function public.list_attempt_comments(uuid) from public, anon;
grant execute on function public.list_attempt_comments(uuid) to authenticated;
