import { apiError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("record_events")
      .select("id, type, message, actor_email, actor_name, created_at")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return Response.json({ events: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}
