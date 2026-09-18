import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/constants";
import { mapPlan, type PlanRow } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const payload = await request.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof payload.title === "string" && payload.title.trim()) {
      updates.title = payload.title.trim().slice(0, 120);
    }
    const { data, error } = await supabase.from("project_plans").update(updates).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Planas nerastas." }, { status: 404 });
    return Response.json({ plan: mapPlan(data as PlanRow) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const { data: row, error: loadError } = await supabase
      .from("project_plans")
      .select("object_key, thumb_object_key")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) return Response.json({ error: "Planas nerastas." }, { status: 404 });
    const keys = [row.object_key, row.thumb_object_key].filter(Boolean) as string[];
    if (keys.length) await supabase.storage.from(MEDIA_BUCKET).remove(keys);
    const { error } = await supabase.from("project_plans").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
