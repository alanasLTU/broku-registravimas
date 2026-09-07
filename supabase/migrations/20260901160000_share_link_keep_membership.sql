-- Share link: neperrašyti esamos narystės (staff nelieka client)
create or replace function public.accept_project_share(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Prisijunkite';
  end if;

  select id into target_project_id
  from public.projects
  where share_token = p_token and archived = false;

  if target_project_id is null then
    raise exception 'Nuoroda negalioja';
  end if;

  insert into public.project_members (project_id, user_id, member_role)
  values (target_project_id, auth.uid(), 'client')
  on conflict (project_id, user_id) do nothing;

  return target_project_id;
end;
$$;
