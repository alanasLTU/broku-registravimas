import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRecordAssignedEmail, sendEmail } from "@/lib/email-templates";
import type { RecordRow } from "@/lib/map-record";

export async function maybeNotifyResponsible(supabase: SupabaseClient, record: RecordRow) {
  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", record.project_id)
    .maybeSingle();

  const { data: contacts } = await supabase
    .from("project_contacts")
    .select("notify_email, contacts(name, email)")
    .eq("project_id", record.project_id)
    .eq("notify_email", true);

  const recipients = (contacts ?? [])
    .map((row) => {
      const contact = row.contacts as { name?: string; email?: string } | null;
      return contact?.email?.trim() ?? "";
    })
    .filter(Boolean);

  if (!recipients.length) return { sent: false, reason: "no_recipients" as const };

  const template = buildRecordAssignedEmail({
    projectName: project?.name ?? "Objektas",
    code: record.code,
    recordType: record.record_type,
    title: record.title,
    room: record.room,
    zone: record.zone,
    responsible: record.responsible,
    status: record.status,
    description: record.description,
  });

  return sendEmail({ to: recipients, ...template });
}

export async function sendUserInviteEmail(input: {
  email: string;
  displayName: string;
  password: string;
  roleLabel: string;
}) {
  const { buildUserInviteEmail } = await import("@/lib/email-templates");
  const template = buildUserInviteEmail(input);
  return sendEmail({ to: [input.email], ...template });
}
