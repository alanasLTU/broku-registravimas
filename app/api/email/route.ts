import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { maybeNotifyResponsible } from "@/lib/email";
import type { RecordRow } from "@/lib/map-record";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const configured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
    return Response.json({ configured });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "edit_records");
    const payload = await request.json() as { recordId?: string };
    const recordId = payload.recordId?.trim() ?? "";
    if (!recordId) return Response.json({ error: "Nenurodytas įrašas." }, { status: 400 });
    const { data: record } = await supabase.from("records").select("*").eq("id", recordId).maybeSingle();
    if (!record) return Response.json({ error: "Įrašas nerastas." }, { status: 404 });
    const result = await maybeNotifyResponsible(supabase, record as RecordRow);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
