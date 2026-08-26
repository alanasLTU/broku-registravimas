-- Nauji workflow statusai: Naujas → Planuojamas → Vykdoma → Baigtas

update public.records set status = 'Baigtas', archived = true, archived_at = coalesce(archived_at, resolved_at, now())
where status = 'Uždaryta';

update public.records set status = 'Planuojamas' where status = 'Perduota';
update public.records set status = 'Vykdoma' where status = 'Laukia patikros';
