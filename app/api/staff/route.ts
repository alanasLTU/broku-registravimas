import { apiError, requireUser } from "@/lib/auth";
import { isInternalRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, profile } = await requireUser();
    if (!isInternalRole(profile.role, profile.isSuperAdmin)) return Response.json({ users: [] });
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, email, role")
      .in("role", ["admin", "staff"])
      .order("display_name");
    if (error) throw error;
    return Response.json({ users: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}
