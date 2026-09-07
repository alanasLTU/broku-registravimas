import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { asUuid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const q = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase() ?? "";
    let query = supabase.from("contacts").select("id, name, phone, email, notes").order("name").limit(30);
    if (q) query = query.ilike("name", `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ contacts: data ?? [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");
    const payload = await request.json() as { name?: string; phone?: string; email?: string; notes?: string };
    const name = payload.name?.trim() ?? "";
    if (!name) return Response.json({ error: "Vardas privalomas." }, { status: 400 });

    const { data: existing } = await supabase
      .from("contacts")
      .select("id, name, phone, email, notes")
      .ilike("name", name)
      .maybeSingle();

    if (existing) return Response.json({ contact: existing });

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        id: asUuid(crypto.randomUUID()),
        name,
        phone: payload.phone?.trim().slice(0, 80) ?? "",
        email: payload.email?.trim().slice(0, 200) ?? "",
        notes: payload.notes?.trim().slice(0, 2000) ?? "",
        created_by: profile.id,
      })
      .select("id, name, phone, email, notes")
      .single();
    if (error) throw error;
    return Response.json({ contact: data }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
