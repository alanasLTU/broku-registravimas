import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { asUuid } from "@/lib/ids";

export const dynamic = "force-dynamic";

type ContactPayload = {
  id?: string;
  role: string;
  name: string;
  phone?: string;
  email?: string;
  category?: string;
  workScope?: string;
  notifyEmail?: boolean;
};

async function upsertContact(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  profile: Awaited<ReturnType<typeof requireUser>>["profile"],
  item: ContactPayload,
) {
  const name = item.name.trim();
  if (!name) return null;
  let contactId = item.id?.trim() ? asUuid(item.id) : null;
  if (!contactId) {
    const created = await supabase
      .from("contacts")
      .insert({
        id: crypto.randomUUID(),
        name,
        phone: item.phone?.trim().slice(0, 80) ?? "",
        email: item.email?.trim().slice(0, 200) ?? "",
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    contactId = created.data.id;
  } else {
    await supabase.from("contacts").update({
      name,
      phone: item.phone?.trim().slice(0, 80) ?? "",
      email: item.email?.trim().slice(0, 200) ?? "",
      updated_at: new Date().toISOString(),
    }).eq("id", contactId);
  }
  return contactId;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("project_contacts")
      .select("id, role, category, work_scope, notify_email, contacts(id, name, phone, email)")
      .eq("project_id", projectId)
      .order("role");
    if (error) throw error;
    return Response.json({ contacts: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await context.params;
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const payload = await request.json() as { contacts?: ContactPayload[] };
    const incoming = (payload.contacts ?? []).filter((item) => item.name?.trim());

    await supabase.from("project_contacts").delete().eq("project_id", projectId);

    for (const item of incoming) {
      const role = item.role?.trim().slice(0, 120) ?? "";
      if (!role) continue;
      const contactId = await upsertContact(supabase, profile, item);
      if (!contactId) continue;
      await supabase.from("project_contacts").insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        contact_id: contactId,
        role,
        category: item.category?.trim().slice(0, 120) ?? "",
        work_scope: item.workScope?.trim().slice(0, 500) ?? "",
        notify_email: Boolean(item.notifyEmail),
      });
    }

    const { data } = await supabase
      .from("project_contacts")
      .select("id, role, category, work_scope, notify_email, contacts(id, name, phone, email)")
      .eq("project_id", projectId)
      .order("role");

    return Response.json({ contacts: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}
