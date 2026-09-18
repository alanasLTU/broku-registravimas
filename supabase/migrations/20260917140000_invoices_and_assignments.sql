-- Invoices, profile phone, project membership visibility, RLS.

alter table public.profiles
  add column if not exists phone text;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  supplier_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  amount_cents_ex_vat int not null check (amount_cents_ex_vat >= 0),
  vat_cents int not null check (vat_cents >= 0),
  amount_cents_inc_vat int not null check (amount_cents_inc_vat >= 0),
  category text not null check (category in (
    'brokas', 'papildomos_islaidos', 'montavimas', 'transportas', 'siuksles', 'uznesimas'
  )),
  charged_to text not null check (charged_to in (
    'distyle', 'uzsakovas', 'gamintojas', 'montuotojas', 'kita'
  )),
  charged_to_other text not null default '',
  object_key text not null default '',
  thumb_object_key text,
  ocr_status text not null default 'skipped' check (ocr_status in ('ok', 'partial', 'failed', 'skipped')),
  created_by uuid references public.profiles (id),
  created_by_email text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_project_idx on public.invoices (project_id);
create index if not exists invoices_date_idx on public.invoices (invoice_date desc);
create index if not exists invoices_created_idx on public.invoices (created_at desc);
create index if not exists invoices_supplier_idx on public.invoices (lower(supplier_name));
create index if not exists invoices_number_idx on public.invoices (invoice_number);

alter table public.project_contacts
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create or replace function private.is_project_member(project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project and pm.user_id = auth.uid()
    );
$$;

insert into public.project_members (project_id, user_id, member_role)
select p.id, pr.id, 'staff'
from public.projects p
cross join public.profiles pr
where pr.role in ('admin', 'staff')
on conflict (project_id, user_id) do nothing;

alter table public.invoices enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (private.is_project_member(project_id));

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert to authenticated with check (
    private.is_project_member(project_id)
    and private.is_staff()
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update to authenticated using (
    private.is_project_member(project_id) and private.is_staff()
  ) with check (
    private.is_project_member(project_id) and private.is_staff()
  );

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete to authenticated using (
    private.is_project_member(project_id) and private.is_staff()
  );
