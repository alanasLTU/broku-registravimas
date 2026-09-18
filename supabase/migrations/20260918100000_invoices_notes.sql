alter table public.invoices
  add column if not exists notes text not null default '';
