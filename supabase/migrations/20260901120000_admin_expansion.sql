-- Admin expansion: roles, contacts, record fields, new statuses, RLS updates.

-- Profiles: extended roles + permissions
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists permissions jsonb not null default '{}'::jsonb;

update public.profiles set role = 'staff' where role = 'staff';
update public.profiles set role = 'client' where role = 'client';

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff', 'contractor', 'client'));

update public.profiles
set role = 'admin', is_super_admin = true, display_name = coalesce(nullif(display_name, ''), 'Argintas')
where lower(email) = 'argintas@digroup.lt';

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- Contacts catalog
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_name_idx on public.contacts (lower(name));

create table if not exists public.project_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  role text not null check (role in (
    'site_contact', 'project_manager', 'works_manager', 'coordinator', 'manufacturer', 'installer'
  )),
  category text not null default '',
  work_scope text not null default '',
  notify_email boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, contact_id, role)
);

create index if not exists project_contacts_project_idx on public.project_contacts (project_id);

-- Record extensions
alter table public.records
  add column if not exists executor text not null default '',
  add column if not exists supervisor_id uuid references public.profiles (id),
  add column if not exists parent_record_id uuid references public.records (id) on delete set null,
  add column if not exists visible_to_client boolean not null default false,
  add column if not exists notify_responsible boolean not null default false;

create index if not exists records_parent_idx on public.records (parent_record_id) where parent_record_id is not null;
create index if not exists records_visible_client_idx on public.records (project_id, visible_to_client) where visible_to_client;

-- Status migration
update public.records set status = 'Užregistruota' where status in ('Naujas', 'naujas');
update public.records set status = 'Perduota sprendimui' where status in ('Planuojamas', 'Perduota');
update public.records set status = 'Vykdoma' where status in ('Vykdoma', 'Laukia patikros');
update public.records set status = 'Sutvarkyta', archived = true, archived_at = coalesce(archived_at, resolved_at, now())
  where status in ('Baigtas', 'Uždaryta');

-- RLS: contacts
alter table public.contacts enable row level security;
alter table public.project_contacts enable row level security;

create policy contacts_select on public.contacts
  for select to authenticated using (private.is_staff());
create policy contacts_insert on public.contacts
  for insert to authenticated with check (private.is_staff());
create policy contacts_update on public.contacts
  for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy project_contacts_select on public.project_contacts
  for select to authenticated using (private.is_project_member(project_id));
create policy project_contacts_write on public.project_contacts
  for all to authenticated using (private.is_staff()) with check (private.is_staff());

-- Updated records select for client visibility
drop policy if exists records_select on public.records;
create policy records_select on public.records
  for select to authenticated using (
    private.is_project_member(project_id)
    and (
      private.is_staff()
      or origin = 'client'
      or visible_to_client = true
      or exists (
        select 1 from public.projects p
        where p.id = records.project_id and p.clients_see_staff_records
      )
      or (
        exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'contractor')
        and (
          created_by = auth.uid()
          or executor = (select display_name from public.profiles where id = auth.uid())
          or executor = (select email from public.profiles where id = auth.uid())
        )
      )
    )
  );

-- Profiles: admin can manage others
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or private.is_admin())
  with check (id = auth.uid() or private.is_admin());

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (private.is_admin() or id = auth.uid());
