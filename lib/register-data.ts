import { requireUser } from "@/lib/auth";
import { isProjectCompleted, isRecordArchived, isRecordCompleted, normalizeProjectStatus } from "@/lib/constants";
import { mapInvoice, sumInvoiceTotals, type InvoiceRow } from "@/lib/invoices";
import { isInternalRole, resolvePermissions } from "@/lib/permissions";
import { mapRecord, type RecordRow } from "@/lib/map-record";

export type RegisterPayload = Awaited<ReturnType<typeof loadRegisterPayload>>;

export async function loadRegisterPayload() {
  const { supabase, profile } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const staff = isInternalRole(profile.role, profile.isSuperAdmin);

  const [{ data: projectRows, error: projectError }, { data: recordRows, error: recordError }, invoiceQuery] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, address, status, archived, clients_see_staff_records, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("records")
      .select(
        "id, code, project_id, record_type, title, room, zone, description, origin, priority, status, responsible, assignee, executor, supervisor_id, supervisor_name, parent_record_id, due_date, requested_by, price_cents, notes, required_work, resolution, include_in_report, visible_to_client, notify_responsible, created_by_email, created_by_name, created_at, archived, archived_at, version",
      )
      .order("created_at", { ascending: false }),
    staff
      ? supabase.from("invoices").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (projectError) throw projectError;
  if (recordError) throw recordError;
  if (invoiceQuery.error) {
    const message = invoiceQuery.error.message?.toLowerCase() ?? "";
    const missingInvoices = message.includes("invoices")
      && (message.includes("does not exist") || message.includes("could not find") || message.includes("schema cache"));
    if (!missingInvoices) {
      throw invoiceQuery.error;
    }
  }

  const topLevelRows = (recordRows ?? []).filter((row) => !row.parent_record_id);
  const recordIds = topLevelRows.map((row) => row.id);
  const supervisorIds = [...new Set(topLevelRows.map((row) => row.supervisor_id).filter(Boolean))] as string[];

  const [{ data: itemRows }, { data: mediaRows }, { data: supervisors }, { data: children }] = await Promise.all([
    recordIds.length
      ? supabase.from("record_items").select("id, record_id, issue, required_work, sort_order").in("record_id", recordIds).order("sort_order")
      : Promise.resolve({ data: [] }),
    recordIds.length
      ? supabase
          .from("record_media")
          .select("id, record_id, object_key, thumb_object_key, file_name, mime_type, media_kind, sort_order")
          .in("record_id", recordIds)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    supervisorIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", supervisorIds)
      : Promise.resolve({ data: [] }),
    recordIds.length
      ? supabase.from("records").select("id, code, title, status, parent_record_id").in("parent_record_id", recordIds)
      : Promise.resolve({ data: [] }),
  ]);

  const supervisorMap = new Map((supervisors ?? []).map((row) => [row.id, row.display_name]));
  const childrenByParent = new Map<string, Array<{ id: string; code: string; title: string; status: string }>>();
  for (const child of children ?? []) {
    if (!child.parent_record_id || isRecordCompleted(child)) continue;
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

  const records = (topLevelRows as RecordRow[]).map((row) =>
    mapRecord(row, itemsByRecord.get(row.id) ?? [], mediaByRecord.get(row.id) ?? [], {
      supervisorName: row.supervisor_name?.trim() || (row.supervisor_id ? supervisorMap.get(row.supervisor_id) ?? "" : ""),
      childTasks: childrenByParent.get(row.id) ?? [],
    }),
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

  const invoiceTotalsByProject = new Map<string, number>();
  const invoices = (invoiceQuery.data ?? []).map((row) => {
    const mapped = mapInvoice(row as InvoiceRow);
    invoiceTotalsByProject.set(
      mapped.projectId,
      (invoiceTotalsByProject.get(mapped.projectId) ?? 0) + mapped.amountCentsIncVat,
    );
    return mapped;
  });

  return {
    user: {
      id: profile.id,
      displayName: profile.displayName,
      email: profile.email,
      role: profile.role,
      isSuperAdmin: profile.isSuperAdmin,
      permissions: resolvePermissions(profile.role, profile.permissions),
      phone: profile.phone,
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
        invoiceTotalCents: invoiceTotalsByProject.get(project.id) ?? 0,
      })),
    defects: records,
    invoices: staff ? invoices : [],
    invites: [] as Array<{ id: string; project_id: string; email: string; token: string; accepted_at: string | null; created_at: string }>,
  };
}
