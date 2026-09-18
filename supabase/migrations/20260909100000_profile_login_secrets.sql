-- Admin-created login passwords (plaintext) so super admin can resend credentials.
-- No SELECT policies: only service_role (API) can read this table.

create table if not exists public.profile_login_secrets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  password text not null,
  updated_at timestamptz not null default now()
);

alter table public.profile_login_secrets enable row level security;

revoke all on public.profile_login_secrets from anon, authenticated;
grant all on public.profile_login_secrets to service_role;
