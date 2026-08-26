import { apiError, requireUser } from "@/lib/auth";
import { resolvePublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    if (profile.role !== "staff") {
      return Response.json({ error: "Nuorodą gali kurti tik Distyle komanda." }, { status: 403 });
    }

    const payload = await request.json() as { projectId?: string; origin?: string };
    const projectId = payload.projectId?.trim() ?? "";
    if (!projectId) return Response.json({ error: "Nenurodytas projektas." }, { status: 400 });

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name, share_token")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return Response.json({ error: "Projektas nerastas." }, { status: 404 });

    let shareToken = project.share_token as string | null;
    if (!shareToken) {
      shareToken = crypto.randomUUID();
      const { error: updateError } = await supabase
        .from("projects")
        .update({ share_token: shareToken, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (updateError) throw updateError;
    }

    const origin = resolvePublicOrigin(request, payload.origin);
    const link = `${origin}/login?join=${shareToken}`;
    return Response.json({ link, token: shareToken, projectName: project.name });
  } catch (error) {
    return apiError(error);
  }
}
