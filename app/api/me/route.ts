import { apiError, requireUser } from "@/lib/auth";
import { sanitizeLtPhoneInput } from "@/lib/phone";
import { updateOwnProfile } from "@/lib/profile-query";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile } = await requireUser();
    return Response.json({
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        isSuperAdmin: profile.isSuperAdmin,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    const payload = await request.json() as { phone?: string; displayName?: string };
    const updates: Record<string, string> = {};
    if (typeof payload.phone === "string") updates.phone = sanitizeLtPhoneInput(payload.phone).slice(0, 80);    if (typeof payload.displayName === "string") updates.display_name = payload.displayName.trim().slice(0, 120);
    if (!Object.keys(updates).length) {
      return Response.json({ error: "Nėra ką atnaujinti." }, { status: 400 });
    }
    const { data, error } = await updateOwnProfile(supabase, profile.id, updates);
    if (error) throw error;
    if (!data) return Response.json({ error: "Profilis nerastas." }, { status: 404 });
    return Response.json({
      profile: {
        id: data.id,
        displayName: data.display_name,
        email: data.email,
        phone: data.phone ?? "",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
