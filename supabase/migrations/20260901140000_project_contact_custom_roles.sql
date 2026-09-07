-- Leisti bet kokią kontakto rolę (ne tik fiksuotą sąrašą)
alter table public.project_contacts drop constraint if exists project_contacts_role_check;
