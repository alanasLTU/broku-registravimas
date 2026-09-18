import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { mapPlan, planObjectKey, planThumbObjectKey, type PlanRow } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
    if (!projectId) return Response.json({ error: "Projektas yra privalomas." }, { status: 400 });
    const { data, error } = await supabase
      .from("project_plans")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return Response.json({ plans: (data ?? []).map((row) => mapPlan(row as PlanRow)) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const payload = await request.json() as Record<string, unknown>;
    const projectId = String(payload.projectId ?? "").trim();
    const title = String(payload.title ?? "Planas").trim().slice(0, 120) || "Planas";
    const width = Math.max(0, Math.round(Number(payload.width) || 0));
    const height = Math.max(0, Math.round(Number(payload.height) || 0));
    if (!projectId) return Response.json({ error: "Projektas yra privalomas." }, { status: 400 });

    const { count } = await supabase
      .from("project_plans")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    const id = crypto.randomUUID();
    const objectKey = planObjectKey(projectId, id);
    const thumbObjectKey = planThumbObjectKey(projectId, id);
    const { data, error } = await supabase.from("project_plans").insert({
      id,
      project_id: projectId,
      title,
      object_key: objectKey,
      thumb_object_key: thumbObjectKey,
      width,
      height,
      sort_order: count ?? 0,
      created_by: profile.id,
    }).select("*").single();
    if (error) throw error;
    return Response.json({
      plan: mapPlan(data as PlanRow),
      upload: { objectKey, thumbObjectKey },
    });
  } catch (error) {
    return apiError(error);
  }
}
