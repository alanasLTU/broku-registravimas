-- Supabase egress / storage valymas (paleisti SQL Editor).
-- 1) Rodyti Storage objektus be DB įrašo (šiukšlės)
select count(*) as orphan_storage_objects
from storage.objects o
where o.bucket_id = 'record-media'
  and not exists (
    select 1 from public.record_media m
    where m.object_key = o.name
  );

-- 2) Jei sąrašas mažas — peržiūrėkite prieš trinant:
-- select o.name, o.metadata->>'size' as bytes
-- from storage.objects o
-- where o.bucket_id = 'record-media'
--   and not exists (select 1 from public.record_media m where m.object_key = o.name)
-- order by (o.metadata->>'size')::bigint desc nulls last
-- limit 50;

-- 3) TRINTI tik patvirtinus, kad failai tikrai nereikalingi:
-- delete from storage.objects o
-- where o.bucket_id = 'record-media'
--   and not exists (
--     select 1 from public.record_media m where m.object_key = o.name
--   );
