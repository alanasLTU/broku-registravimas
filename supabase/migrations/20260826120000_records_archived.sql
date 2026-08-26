-- Soft-archive completed or deleted records so they leave the active list.

alter table public.records
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists records_archived_idx
  on public.records (project_id, archived, created_at desc);
