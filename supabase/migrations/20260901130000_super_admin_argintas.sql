-- Jei jau paleista ankstesnė migracija su alanas@ — perkeliame super admin į argintas@

update public.profiles
set role = 'staff', is_super_admin = false
where lower(email) = 'alanas@digroup.lt' and is_super_admin = true;

update public.profiles
set role = 'admin', is_super_admin = true, display_name = coalesce(nullif(display_name, ''), 'Argintas')
where lower(email) = 'argintas@digroup.lt';
