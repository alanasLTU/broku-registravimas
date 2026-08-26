import { apiError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    if (profile.role !== "staff") return Response.json({ error: "Kviesti klientus gali tik Distyle komanda." }, { status: 403 });
    const payload = await request.json() as { projectId?: string; email?: string };
    const projectId = payload.projectId?.trim() ?? "";
    const email = payload.email?.trim().toLowerCase() ?? "";
    if (!projectId || !email.includes("@")) return Response.json({ error: "Nurodykite projektą ir kliento el. paštą." }, { status: 400 });

    const token = crypto.randomUUID();
    const { data: invite, error } = await supabase.from("project_invites").insert({
      project_id: projectId,
      email,
      token,
      created_by: profile.id,
    }).select("*").single();
    if (error) throw error;

    const origin = process.env.NEXT_PUBLIC_APP_URL || "";
    const link = `${origin || ""}/login?invite=${invite.token}`;
    return Response.json({ invite: { ...invite, link } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
