import { apiError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser();
    const payload = await request.json() as { token?: string };
    const token = payload.token?.trim() ?? "";
    if (!token) return Response.json({ error: "Nėra projekto nuorodos." }, { status: 400 });

    const { data: projectId, error } = await supabase.rpc("accept_project_share", { p_token: token });
    if (error) throw error;
    return Response.json({ projectId });
  } catch (error) {
    return apiError(error);
  }
}
