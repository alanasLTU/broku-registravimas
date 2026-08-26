import { apiError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    if (profile.role !== "staff") return Response.json({ error: "Projektus gali kurti tik Distyle komanda." }, { status: 403 });
    const payload = await request.json() as { name?: string; address?: string };
    const name = payload.name?.trim() ?? "";
    if (!name) return Response.json({ error: "Objekto pavadinimas yra privalomas." }, { status: 400 });
    const { data: project, error } = await supabase.from("projects").insert({
      name,
      address: payload.address?.trim() ?? "",
      created_by: profile.id,
    }).select("*").single();
    if (error) throw error;
    await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: profile.id,
      member_role: "staff",
    });
    return Response.json({
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        clientsSeeStaffRecords: project.clients_see_staff_records,
        open: 0,
        overdue: 0,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    if (profile.role !== "staff") return Response.json({ error: "Nustatymus gali keisti tik Distyle komanda." }, { status: 403 });
    const payload = await request.json() as { id?: string; clientsSeeStaffRecords?: boolean; address?: string };
    if (!payload.id) return Response.json({ error: "Nenurodytas projektas." }, { status: 400 });
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof payload.clientsSeeStaffRecords === "boolean") updates.clients_see_staff_records = payload.clientsSeeStaffRecords;
    if (typeof payload.address === "string") updates.address = payload.address.trim();
    const { data: project, error } = await supabase.from("projects").update(updates).eq("id", payload.id).select("*").single();
    if (error) throw error;
    return Response.json({
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        clientsSeeStaffRecords: project.clients_see_staff_records,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
