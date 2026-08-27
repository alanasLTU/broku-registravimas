-- Projekto būsena (Vykdomas / Baigtas) ir staff teisė ištrinti objektą.

update public.projects
set status = case when archived then 'Baigtas' else coalesce(nullif(status, ''), 'Vykdomas') end
where status is null or status not in ('Vykdomas', 'Baigtas');

update public.projects
set archived = true
where status = 'Baigtas' and archived = false;

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check check (status in ('Vykdomas', 'Baigtas'));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated using (private.is_staff());
