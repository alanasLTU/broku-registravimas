import { requireUser } from "@/lib/auth";
import { isRecordArchived } from "@/lib/constants";
import { mapRecord, type RecordRow } from "@/lib/map-record";

export type RegisterPayload = Awaited<ReturnType<typeof loadRegisterPayload>>;

export async function loadRegisterPayload() {
  const { supabase, profile } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: projectRows, error: projectError }, { data: recordRows, error: recordError }] = await Promise.all([
    supabase.from("projects").select("*").eq("archived", false).order("updated_at", { ascending: false }),
    supabase.from("records").select("*").order("created_at", { ascending: false }),
  ]);
  if (projectError) throw projectError;
  if (recordError) throw recordError;

  const recordIds = (recordRows ?? []).map((row) => row.id);
  const [{ data: itemRows }, { data: mediaRows }, { data: invites }] = await Promise.all([
    recordIds.length
      ? supabase.from("record_items").select("*").in("record_id", recordIds).order("sort_order")
      : Promise.resolve({ data: [] }),
    recordIds.length
      ? supabase.from("record_media").select("*").in("record_id", recordIds).order("sort_order")
      : Promise.resolve({ data: [] }),
    profile.role === "staff"
      ? supabase.from("project_invites").select("id, project_id, email, token, accepted_at, created_at").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const records: Awaited<ReturnType<typeof mapRecord>>[] = [];
  for (const row of (recordRows ?? []) as RecordRow[]) {
    records.push(
      await mapRecord(
        supabase,
        row,
        (itemRows ?? []).filter((item) => item.record_id === row.id),
        (mediaRows ?? []).filter((item) => item.record_id === row.id),
      ),
    );
  }

  return {
    user: {
      displayName: profile.displayName,
      email: profile.email,
      role: profile.role as "staff" | "client",
    },
    projects: (projectRows ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      address: project.address,
      clientsSeeStaffRecords: project.clients_see_staff_records,
      open: records.filter((item) => item.projectId === project.id && !isRecordArchived(item)).length,
      overdue: records.filter((item) => item.projectId === project.id && !isRecordArchived(item) && item.due !== "Nenustatyta" && item.due < today).length,
    })),
    defects: records,
    invites: invites ?? [],
  };
}
