-- Allow staff to hard-delete records in projects they belong to.
-- App layer still checks delete_records / edit_records (child tasks) permissions.

drop policy if exists records_delete on public.records;
create policy records_delete on public.records
  for delete to authenticated using (
    private.is_staff()
    and private.is_project_member(project_id)
  );
