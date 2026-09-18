-- Optional phone on profiles (safe to run multiple times).
alter table public.profiles
  add column if not exists phone text;
