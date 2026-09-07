-- Super admin visada turi staff/admin RLS teises, net jei role laukas senas
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role in ('admin', 'staff') or is_super_admin = true)
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
    where id = auth.uid()
      and (role = 'admin' or is_super_admin = true)
  );
$$;

-- Sutvarkyti esamus super admin profilius
update public.profiles
set role = 'admin'
where is_super_admin = true and role not in ('admin', 'staff');
