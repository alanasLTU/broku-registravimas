-- Užbaigimo patvirtinimas: darbuotojas siunčia su foto, PV/koordinatorius patvirtina ir archyvuoja.

alter table public.records
  add column if not exists completion_requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists completion_requested_at timestamptz,
  add column if not exists completion_requested_name text,
  add column if not exists completion_approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists completion_approved_at timestamptz,
  add column if not exists completion_approved_name text;

create index if not exists records_completion_pending_idx
  on public.records (project_id, status)
  where status = 'Laukia patvirtinimo' and archived = false;
