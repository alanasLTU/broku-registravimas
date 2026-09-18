alter table public.records
  add column if not exists supervisor_name text;

update public.records r
set supervisor_name = p.display_name
from public.profiles p
where r.supervisor_id = p.id
  and coalesce(trim(r.supervisor_name), '') = '';
