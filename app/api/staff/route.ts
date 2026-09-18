import { apiError, requireUser } from "@/lib/auth";
import { isInternalRole } from "@/lib/permissions";
import { selectStaffProfiles } from "@/lib/profile-query";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, profile } = await requireUser();
    if (!isInternalRole(profile.role, profile.isSuperAdmin)) return Response.json({ users: [] });
    const { data, error } = await selectStaffProfiles(supabase);
    if (error) throw error;
    return Response.json({ users: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}
