import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { lookupInviteToken } from "@/lib/invites";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return Response.json({ status: "invalid" as const }, { status: 400 });
  }

  try {
    const admin = createAdminSupabase();
    if (admin) {
      const lookup = await lookupInviteToken(admin, token);
      return Response.json(lookup);
    }

    const supabase = await createServerSupabase();
    const lookup = await lookupInviteToken(supabase, token);
    return Response.json(lookup);
  } catch (error) {
    return Response.json({
      status: "invalid" as const,
      error: error instanceof Error ? error.message : "Nepavyko patikrinti kvietimo",
    }, { status: 500 });
  }
}
