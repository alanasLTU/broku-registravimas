import { requireUser } from "@/lib/auth";
import { isProjectCompleted, isRecordArchived, normalizeProjectStatus } from "@/lib/constants";
import { isInternalRole, resolvePermissions } from "@/lib/permissions";
import { mapRecord, type RecordRow } from "@/lib/map-record";

export type RegisterPayload = Awaited<ReturnType<typeof loadRegisterPayload>>;

export async function loadRegisterPayload() {
  const { supabase, profile } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const staff = isInternalRole(profile.role, profile.isSuperAdmin);

  const [{ data: projectRows, error: projectError }, { data: recordRows, error: recordError }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, address, status, archived, clients_see_staff_records, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("records")
      .select(
        "id, code, project_id, record_type, title, room, zone, description, origin, priority, status, responsible, assignee, executor, supervisor_id, parent_record_id, due_date, requested_by, price_cents, notes, required_work, resolution, include_in_report, visible_to_client, notify_responsible, created_by_email, created_by_name, created_at, archived, archived_at, version",
      )
      .order("created_at", { ascending: false }),
  ]);
  if (projectError) throw projectError;
  if (recordError) throw recordError;

  const topLevelRows = (recordRows ?? []).filter((row) => !row.parent_record_id);
  const recordIds = topLevelRows.map((row) => row.id);
  const allIdsForChildren = (recordRows ?? []).map((row) => row.id);
  const supervisorIds = [...new Set((recordRows ?? []).map((row) => row.supervisor_id).filter(Boolean))] as string[];

  const [{ data: itemRows }, { data: mediaRows }, { data: supervisors }, { data: children }] = await Promise.all([
    recordIds.length
      ? supabase.from("record_items").select("id, record_id, issue, required_work, sort_order").in("record_id", recordIds).order("sort_order")
      : Promise.resolve({ data: [] }),
    recordIds.length
      ? supabase
          .from("record_media")
          .select("id, record_id, object_key, file_name, mime_type, media_kind, caption, sort_order")
          .in("record_id", recordIds)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    supervisorIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", supervisorIds)
      : Promise.resolve({ data: [] }),
    allIdsForChildren.length
      ? supabase.from("records").select("id, code, title, status, parent_record_id").in("parent_record_id", allIdsForChildren)
      : Promise.resolve({ data: [] }),
  ]);

  const supervisorMap = new Map((supervisors ?? []).map((row) => [row.id, row.display_name]));
  const childrenByParent = new Map<string, Array<{ id: string; code: string; title: string; status: string }>>();
  for (const child of children ?? []) {
    if (!child.parent_record_id) continue;
    const list = childrenByParent.get(child.parent_record_id) ?? [];
    list.push({ id: child.id, code: child.code, title: child.title, status: child.status });
    childrenByParent.set(child.parent_record_id, list);
  }

  const itemsByRecord = new Map<string, typeof itemRows>();
  for (const item of itemRows ?? []) {
    const list = itemsByRecord.get(item.record_id) ?? [];
    list.push(item);
    itemsByRecord.set(item.record_id, list);
  }
  const mediaByRecord = new Map<string, typeof mediaRows>();
  for (const item of mediaRows ?? []) {
    const list = mediaByRecord.get(item.record_id) ?? [];
    list.push(item);
    mediaByRecord.set(item.record_id, list);
  }

  const records = await Promise.all(
    (topLevelRows as RecordRow[]).map((row) =>
      mapRecord(supabase, row, itemsByRecord.get(row.id) ?? [], mediaByRecord.get(row.id) ?? [], {
        supervisorName: row.supervisor_id ? supervisorMap.get(row.supervisor_id) ?? "" : "",
        childTasks: childrenByParent.get(row.id) ?? [],
        deferSignedUrls: true,
      }),
    ),
  );

  const openByProject = new Map<string, number>();
  const overdueByProject = new Map<string, number>();
  for (const item of records) {
    if (isRecordArchived(item)) continue;
    openByProject.set(item.projectId, (openByProject.get(item.projectId) ?? 0) + 1);
    if (item.due !== "Nenustatyta" && item.due < today) {
      overdueByProject.set(item.projectId, (overdueByProject.get(item.projectId) ?? 0) + 1);
    }
  }

  return {
    user: {
      displayName: profile.displayName,
      email: profile.email,
      role: profile.role,
      isSuperAdmin: profile.isSuperAdmin,
      permissions: resolvePermissions(profile.role, profile.permissions),
    },
    projects: (projectRows ?? [])
      .filter((project) => staff || !isProjectCompleted(project))
      .map((project) => ({
        id: project.id,
        name: project.name,
        address: project.address,
        status: normalizeProjectStatus(project.status),
        archived: isProjectCompleted(project),
        clientsSeeStaffRecords: project.clients_see_staff_records,
        open: openByProject.get(project.id) ?? 0,
        overdue: overdueByProject.get(project.id) ?? 0,
      })),
    defects: records,
    invites: [] as Array<{ id: string; project_id: string; email: string; token: string; accepted_at: string | null; created_at: string }>,
  };
}
