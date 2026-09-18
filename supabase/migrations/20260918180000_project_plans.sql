-- Project floor plans + record pin coordinates (0–1 relative to compressed image).

create table if not exists public.project_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null default 'Planas',
  object_key text not null default '',
  thumb_object_key text,
  width integer not null default 0,
  height integer not null default 0,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_plans_project_idx
  on public.project_plans (project_id, sort_order, created_at);

alter table public.records
  add column if not exists plan_id uuid references public.project_plans (id) on delete set null;

alter table public.records
  add column if not exists plan_x numeric;

alter table public.records
  add column if not exists plan_y numeric;

create index if not exists records_plan_idx on public.records (plan_id)
  where plan_id is not null;

alter table public.project_plans enable row level security;

drop policy if exists project_plans_select on public.project_plans;
create policy project_plans_select on public.project_plans
  for select to authenticated using (private.is_project_member(project_id));

drop policy if exists project_plans_insert on public.project_plans;
create policy project_plans_insert on public.project_plans
  for insert to authenticated with check (
    private.is_project_member(project_id)
    and private.is_staff()
  );

drop policy if exists project_plans_update on public.project_plans;
create policy project_plans_update on public.project_plans
  for update to authenticated
  using (private.is_project_member(project_id) and private.is_staff())
  with check (private.is_project_member(project_id) and private.is_staff());

drop policy if exists project_plans_delete on public.project_plans;
create policy project_plans_delete on public.project_plans
  for delete to authenticated
  using (private.is_project_member(project_id) and private.is_staff());
