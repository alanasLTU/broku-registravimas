import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { cleanupOrphanContacts } from "@/lib/contacts";
import { asUuid } from "@/lib/ids";
import { sanitizeLtPhoneInput } from "@/lib/phone";
import { selectLinkedProfile, selectProjectContacts } from "@/lib/profile-query";

export const dynamic = "force-dynamic";

type ContactPayload = {
  id?: string;
  profileId?: string;
  role: string;
  name: string;
  phone?: string;
  email?: string;
  category?: string;
  workScope?: string;
  notifyEmail?: boolean;
};

const ROLE_KEYS = new Set(["site_contact", "project_manager", "works_manager", "coordinator", "manufacturer", "installer"]);

async function upsertContact(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  profile: Awaited<ReturnType<typeof requireUser>>["profile"],
  item: ContactPayload,
) {
  let name = item.name.trim();
  let phone = item.phone ? sanitizeLtPhoneInput(item.phone).slice(0, 80) : "";
  let email = item.email?.trim().slice(0, 200) ?? "";
  const profileId = item.profileId?.trim() ? asUuid(item.profileId) : null;

  if (profileId) {
    const { data: linkedProfile } = await selectLinkedProfile(supabase, profileId);
    if (linkedProfile) {
      name = linkedProfile.display_name?.trim() || name;
      phone = linkedProfile.phone?.trim() || phone;
      email = linkedProfile.email?.trim() || email;
    }
  }

  if (!name) return { contactId: null, profileId };

  let contactId = item.id?.trim() ? asUuid(item.id) : null;
  if (!contactId) {
    const created = await supabase
      .from("contacts")
      .insert({
        id: crypto.randomUUID(),
        name,
        phone,
        email,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    contactId = created.data.id;
  } else {
    await supabase.from("contacts").update({
      name,
      phone,
      email,
      updated_at: new Date().toISOString(),
    }).eq("id", contactId);
  }
  return { contactId, profileId };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await selectProjectContacts(supabase, projectId);
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
    const incoming = (payload.contacts ?? []).filter((item) => item.name?.trim() || item.profileId?.trim());

    const { data: previousLinks } = await supabase
      .from("project_contacts")
      .select("contact_id")
      .eq("project_id", projectId);
    const previousContactIds = [...new Set((previousLinks ?? []).map((row) => row.contact_id).filter(Boolean))];

    await supabase.from("project_contacts").delete().eq("project_id", projectId);

    const keptContactIds: string[] = [];
    for (const item of incoming) {
      const role = item.role?.trim().slice(0, 120) ?? "";
      if (!role) continue;
      const { contactId, profileId } = await upsertContact(supabase, profile, item);
      if (!contactId) continue;
      keptContactIds.push(contactId);
      const notifyDefault = ROLE_KEYS.has(role) && (role === "project_manager" || role === "coordinator");
      await supabase.from("project_contacts").insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        contact_id: contactId,
        profile_id: profileId,
        role,
        category: item.category?.trim().slice(0, 120) ?? "",
        work_scope: item.workScope?.trim().slice(0, 500) ?? "",
        notify_email: item.notifyEmail ?? notifyDefault,
      });
      if (profileId) {
        await supabase.from("project_members").upsert({
          project_id: projectId,
          user_id: profileId,
          member_role: "staff",
        }, { onConflict: "project_id,user_id" });
      }
    }

    const removedContactIds = previousContactIds.filter((id) => !keptContactIds.includes(id));
    await cleanupOrphanContacts(supabase, removedContactIds);

    const { data } = await selectProjectContacts(supabase, projectId);
    return Response.json({ contacts: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}
