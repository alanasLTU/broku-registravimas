import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";

export { errorMessage };

export class AppAccessError extends Error {
  constructor(message: string, public status: 401 | 403) {
    super(message);
  }
}

export function apiError(error: unknown) {
  const message = errorMessage(error);
  const status = error instanceof AppAccessError ? error.status : 500;
  if (status >= 500) console.error(error);
  return Response.json({ error: message }, { status });
}

export async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new AppAccessError("Prisijunkite, kad galėtumėte naudotis registru.", 401);

  const admin = createAdminSupabase();
  const client = admin ?? supabase;

  let { data: profile, error } = await client
    .from("profiles")
    .select("id, email, display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;

  if (!profile) {
    const displayName = user.user_metadata?.full_name || user.email.split("@")[0];
    const { count } = await client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "staff");
    const role = count ? "client" : "staff";
    const inserted = await client
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        display_name: displayName,
        role,
      })
      .select("id, email, display_name, role")
      .single();
    if (inserted.error) throw inserted.error;
    profile = inserted.data;
  } else if (profile.role !== "staff") {
    const { count } = await client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "staff");
    if (!count) {
      const updated = await client
        .from("profiles")
        .update({ role: "staff" })
        .eq("id", user.id)
        .select("id, email, display_name, role")
        .single();
      if (!updated.error && updated.data) profile = updated.data;
    }
  }

  if (!profile) throw new AppAccessError("Nepavyko sukurti profilio. Patikrinkite SUPABASE_SERVICE_ROLE_KEY.", 401);

  return {
    supabase,
    user,
    profile: {
      id: profile.id as string,
      email: profile.email as string,
      displayName: (profile.display_name as string) || user.email,
      role: profile.role as "staff" | "client",
    },
  };
}

export function locationLabel(room?: string | null, zone?: string | null) {
  return [room, zone].map((value) => value?.trim()).filter(Boolean).join(" · ");
}
