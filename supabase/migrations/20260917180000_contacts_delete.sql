-- Allow staff to delete unused contacts (API enforces orphan-only deletes).
create policy contacts_delete on public.contacts
  for delete to authenticated using (private.is_staff());
