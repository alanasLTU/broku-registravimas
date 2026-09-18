alter table public.record_media
  add column if not exists thumb_object_key text;
