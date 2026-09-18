-- Vienkartinio kvietimo peržiūra (be prisijungimo) + projekto kontaktų politikos.

create or replace function public.peek_project_invite(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.project_invites%rowtype;
  project_name text;
begin
  select pi.*
  into invite
  from public.project_invites pi
  where pi.token = invite_token;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select p.name
  into project_name
  from public.projects p
  where p.id = invite.project_id;

  if invite.accepted_at is not null then
    return jsonb_build_object(
      'status', 'used',
      'email', invite.email,
      'projectName', project_name
    );
  end if;

  return jsonb_build_object(
    'status', 'open',
    'email', invite.email,
    'projectName', project_name
  );
end;
$$;

revoke all on function public.peek_project_invite(text) from public;
grant execute on function public.peek_project_invite(text) to anon, authenticated;

alter table public.project_contacts
  add column if not exists approves_completion boolean not null default false;

update public.project_contacts
set approves_completion = true
where role in ('project_manager', 'coordinator', 'works_manager');
