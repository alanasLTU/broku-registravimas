import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { ACTIVE_PROJECT_STATUS, COMPLETED_PROJECT_STATUS, isProjectCompleted, normalizeProjectStatus, projectStatuses } from "@/lib/constants";

export const dynamic = "force-dynamic";

function mapProject(project: {
  id: string;
  name: string;
  address: string;
  status?: string | null;
  archived?: boolean;
  clients_see_staff_records?: boolean;
}, extras?: { open?: number; overdue?: number }) {
  const status = normalizeProjectStatus(project.status);
  return {
    id: project.id,
    name: project.name,
    address: project.address,
    status,
    archived: Boolean(project.archived) || isProjectCompleted({ status, archived: project.archived }),
    clientsSeeStaffRecords: project.clients_see_staff_records,
    open: extras?.open ?? 0,
    overdue: extras?.overdue ?? 0,
  };
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const payload = await request.json() as { name?: string; address?: string };
    const name = payload.name?.trim() ?? "";
    if (!name) return Response.json({ error: "Objekto pavadinimas yra privalomas." }, { status: 400 });
    const { data: project, error } = await supabase.from("projects").insert({
      name,
      address: payload.address?.trim() ?? "",
      status: ACTIVE_PROJECT_STATUS,
      archived: false,
      created_by: profile.id,
    }).select("*").single();
    if (error) throw error;
    await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: profile.id,
      member_role: "staff",
    });
    return Response.json({ project: mapProject(project) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const payload = await request.json() as { id?: string; name?: string; address?: string; status?: string; clientsSeeStaffRecords?: boolean };
    if (!payload.id) return Response.json({ error: "Nenurodytas projektas." }, { status: 400 });
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof payload.name === "string") {
      const name = payload.name.trim();
      if (!name) return Response.json({ error: "Objekto pavadinimas yra privalomas." }, { status: 400 });
      updates.name = name.slice(0, 200);
    }
    if (typeof payload.address === "string") updates.address = payload.address.trim().slice(0, 300);
    if (typeof payload.clientsSeeStaffRecords === "boolean") updates.clients_see_staff_records = payload.clientsSeeStaffRecords;
    if (typeof payload.status === "string" && (projectStatuses as readonly string[]).includes(payload.status)) {
      const status = normalizeProjectStatus(payload.status);
      updates.status = status;
      updates.archived = status === COMPLETED_PROJECT_STATUS;
    }
    const { data: project, error } = await supabase.from("projects").update(updates).eq("id", payload.id).select("*").single();
    if (error) throw error;
    return Response.json({ project: mapProject(project) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "delete_records");
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "Nenurodytas projektas." }, { status: 400 });
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
