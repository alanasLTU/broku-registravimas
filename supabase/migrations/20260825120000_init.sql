-- Brokų registras — pradinis Postgres + RLS + Storage.
-- Paleisti naujame Supabase projekte: SQL Editor → New query → Run,
-- arba: supabase db query / migracija.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'client' check (role in ('staff', 'client')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  status text not null default 'Vykdomas',
  archived boolean not null default false,
  clients_see_staff_records boolean not null default false,
  odoo_project_id text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_role text not null default 'client' check (member_role in ('staff', 'client')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  token text not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index project_invites_open_email
  on public.project_invites (project_id, lower(email))
  where accepted_at is null;

create table public.records (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  project_id uuid not null references public.projects (id) on delete cascade,
  record_type text not null default 'Brokas',
  title text not null,
  room text not null,
  zone text not null,
  description text not null default '',
  origin text not null default 'staff' check (origin in ('staff', 'client')),
  priority text not null default 'Vidutinis',
  status text not null default 'Naujas',
  responsible text not null default 'Neaišku',
  assignee text not null default '',
  due_date date,
  requested_by text not null default '',
  price_cents integer,
  notes text not null default '',
  required_work text not null default '',
  resolution text not null default '',
  include_in_report boolean not null default true,
  odoo_id text,
  created_by uuid references public.profiles (id),
  created_by_email text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  version integer not null default 1
);

create index records_project_idx on public.records (project_id, created_at desc);
create index records_status_idx on public.records (status);

create table public.record_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  issue text not null,
  required_work text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index record_items_record_idx on public.record_items (record_id, sort_order);

create table public.record_media (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  object_key text not null,
  file_name text not null default '',
  mime_type text not null default 'image/jpeg',
  media_kind text not null default 'photo' check (media_kind in ('photo', 'video')),
  file_size integer not null default 0,
  caption text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index record_media_record_idx on public.record_media (record_id, sort_order);

create table public.record_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  type text not null,
  message text not null,
  actor_email text not null default '',
  actor_name text not null default '',
  created_at timestamptz not null default now()
);

create index record_events_record_idx on public.record_events (record_id, created_at desc);

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'staff'
  );
$$;

create or replace function private.is_project_member(project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_staff()
    or exists (
      select 1 from public.project_members
      where project_id = project and user_id = auth.uid()
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role text := 'client';
begin
  if not exists (select 1 from public.profiles where role = 'staff') then
    next_role := 'staff';
  end if;
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    next_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.accept_project_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.project_invites%rowtype;
  user_email text;
begin
  if auth.uid() is null then
    raise exception 'Prisijunkite';
  end if;
  select email into user_email from public.profiles where id = auth.uid();
  select * into invite
  from public.project_invites
  where token = invite_token and accepted_at is null;
  if not found then
    raise exception 'Kvietimas negalioja';
  end if;
  if lower(invite.email) <> lower(user_email) then
    raise exception 'Šis kvietimas skirtas kitam el. paštui';
  end if;
  insert into public.project_members (project_id, user_id, member_role)
  values (invite.project_id, auth.uid(), 'client')
  on conflict (project_id, user_id) do nothing;
  update public.project_invites
    set accepted_at = now()
    where id = invite.id;
  return invite.project_id;
end;
$$;

create or replace function public.next_record_code(prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  largest integer := 0;
begin
  select coalesce(max((regexp_match(code, '^' || prefix || '-([0-9]+)$'))[1]::int), 0)
    into largest
    from public.records
    where code ~ ('^' || prefix || '-[0-9]+$');
  return prefix || '-' || lpad((largest + 1)::text, 3, '0');
end;
$$;

revoke all on function private.is_staff() from public;
revoke all on function private.is_project_member(uuid) from public;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_project_member(uuid) to authenticated;
grant usage on schema private to authenticated;

revoke all on function public.accept_project_invite(text) from public;
grant execute on function public.accept_project_invite(text) to authenticated;
revoke all on function public.next_record_code(text) from public;
grant execute on function public.next_record_code(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.records enable row level security;
alter table public.record_items enable row level security;
alter table public.record_media enable row level security;
alter table public.record_events enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or private.is_staff());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy projects_select on public.projects
  for select to authenticated using (private.is_project_member(id));
create policy projects_insert on public.projects
  for insert to authenticated with check (private.is_staff());
create policy projects_update on public.projects
  for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy members_select on public.project_members
  for select to authenticated using (private.is_project_member(project_id));
create policy members_write on public.project_members
  for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy invites_select on public.project_invites
  for select to authenticated using (private.is_staff() or lower(email) = lower((select email from public.profiles where id = auth.uid())));
create policy invites_staff_write on public.project_invites
  for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy records_select on public.records
  for select to authenticated using (
    private.is_project_member(project_id)
    and (
      private.is_staff()
      or origin = 'client'
      or exists (
        select 1 from public.projects p
        where p.id = records.project_id and p.clients_see_staff_records
      )
    )
  );
create policy records_insert on public.records
  for insert to authenticated with check (private.is_project_member(project_id));
create policy records_update on public.records
  for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));

create policy items_select on public.record_items
  for select to authenticated using (
    exists (select 1 from public.records r where r.id = record_id)
  );
create policy items_write on public.record_items
  for all to authenticated using (
    exists (select 1 from public.records r where r.id = record_id)
  ) with check (
    exists (select 1 from public.records r where r.id = record_id)
  );

create policy media_select on public.record_media
  for select to authenticated using (
    exists (select 1 from public.records r where r.id = record_id)
  );
create policy media_write on public.record_media
  for all to authenticated using (
    exists (select 1 from public.records r where r.id = record_id)
  ) with check (
    exists (select 1 from public.records r where r.id = record_id)
  );

create policy events_select on public.record_events
  for select to authenticated using (
    exists (select 1 from public.records r where r.id = record_id)
  );
create policy events_insert on public.record_events
  for insert to authenticated with check (
    exists (select 1 from public.records r where r.id = record_id)
  );

insert into storage.buckets (id, name, public)
values ('record-media', 'record-media', false)
on conflict (id) do nothing;

create policy storage_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'record-media'
    and private.is_project_member(((storage.foldername(name))[1])::uuid)
  );

create policy storage_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'record-media'
    and private.is_project_member(((storage.foldername(name))[1])::uuid)
  );

create policy storage_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'record-media'
    and private.is_project_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'record-media'
    and private.is_project_member(((storage.foldername(name))[1])::uuid)
  );

create policy storage_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'record-media'
    and private.is_staff()
  );

insert into public.projects (name, address)
select 'BURGA', 'Kauno LEZ'
where not exists (select 1 from public.projects where name = 'BURGA');
