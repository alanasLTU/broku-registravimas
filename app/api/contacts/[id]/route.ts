import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { deleteContactIfOrphan } from "@/lib/contacts";
import { isUuid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    if (!isUuid(rawId)) {
      return Response.json({ error: "Neteisingas kontakto ID." }, { status: 400 });
    }
    const contactId = rawId;
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "manage_projects");

    const { data: contact, error: loadError } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!contact) return Response.json({ error: "Kontaktas nerastas." }, { status: 404 });

    const result = await deleteContactIfOrphan(supabase, contactId);
    if (!result.deleted) {
      return Response.json({ error: "Kontaktas vis dar naudojamas projekte." }, { status: 409 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
