import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { isClientRecordType, isRecordType, recordPrefixes, responsibilities, priorities } from "@/lib/constants";
import { asUuid } from "@/lib/ids";
import { fetchRecordBundle } from "@/lib/map-record";

export const dynamic = "force-dynamic";

type IssuePayload = { id?: string; issue?: string; requiredWork?: string };

function parsePrice(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "create_records");
    const payload = await request.json() as Record<string, unknown>;
    const projectId = String(payload.projectId ?? "").trim();
    const title = String(payload.title ?? "").trim();
    const room = String(payload.room ?? "").trim();
    const zone = String(payload.zone ?? "").trim();
    const parentRecordId = typeof payload.parentRecordId === "string" ? asUuid(payload.parentRecordId) : null;
    const requestedType = String(payload.recordType ?? "Brokas");
    if (profile.role === "client" && requestedType === "Užduotis") {
      return Response.json({ error: "Klientai negali kurti užduočių." }, { status: 403 });
    }
    const recordType = profile.role === "client"
      ? (isClientRecordType(requestedType) ? requestedType : "Brokas")
      : (isRecordType(requestedType) ? requestedType : "Brokas");
    const issues = (Array.isArray(payload.issues) ? payload.issues as IssuePayload[] : [])
      .map((item) => ({
        id: asUuid(item.id),
        issue: item.issue?.trim().slice(0, 2000) || "",
        requiredWork: item.requiredWork?.trim().slice(0, 2000) || "",
      }))
      .filter((item) => item.issue)
      .slice(0, 20);

    if (!projectId || !title) {
      return Response.json({ error: "Projektas ir pavadinimas yra privalomi." }, { status: 400 });
    }

    let resolvedRoom = room;
    if (parentRecordId) {
      const { data: parent } = await supabase.from("records").select("id, project_id, room, zone").eq("id", parentRecordId).maybeSingle();
      if (!parent) return Response.json({ error: "Susijęs įrašas nerastas." }, { status: 404 });
      if (parent.project_id !== projectId) {
        return Response.json({ error: "Užduotis turi būti tame pačiame projekte." }, { status: 400 });
      }
      if (!resolvedRoom) resolvedRoom = parent.room || parent.zone || "—";
    }
    if (!resolvedRoom) {
      return Response.json({ error: "Patalpa yra privaloma." }, { status: 400 });
    }

    const { data: code, error: codeError } = await supabase.rpc("next_record_code", {
      prefix: recordPrefixes[recordType as keyof typeof recordPrefixes],
    });
    if (codeError || !code) throw codeError ?? new Error("Nepavyko suteikti kodo");

    const description = issues.map((item) => item.issue).join("\n");
    const requiredWork = issues.map((item) => item.requiredWork).filter(Boolean).join("\n");
    const requestedResponsible = String(payload.responsible ?? "Montuotojai");
    const id = crypto.randomUUID();

    const insert = {
      id,
      code,
      project_id: projectId,
      parent_record_id: parentRecordId,
      record_type: recordType,
      title,
      room: resolvedRoom,
      zone,
      description,
      origin: profile.role === "client" ? "client" : "staff",
      priority: priorities.includes(String(payload.priority) as typeof priorities[number]) ? String(payload.priority) : "Vidutinis",
      status: "Užregistruota",
      responsible: responsibilities.includes(requestedResponsible as typeof responsibilities[number]) ? requestedResponsible : "Montuotojai",
      assignee: String(payload.assignee ?? "").trim().slice(0, 120),
      executor: String(payload.executor ?? "").trim().slice(0, 120),
      supervisor_id: typeof payload.supervisorId === "string" && payload.supervisorId ? asUuid(payload.supervisorId) : null,
      due_date: (() => {
        const value = String(payload.due ?? "").trim();
        return !value || value === "Nenustatyta" ? null : value;
      })(),
      requested_by: String(payload.requestedBy ?? "").trim().slice(0, 200),
      price_cents: parsePrice(payload.price),
      notes: String(payload.notes ?? "").trim().slice(0, 4000),
      required_work: requiredWork,
      visible_to_client: Boolean(payload.visibleToClient),
      notify_responsible: Boolean(payload.notifyResponsible),
      created_by: profile.id,
      created_by_email: profile.email,
      created_by_name: profile.displayName,
    };

    const { data: record, error } = await supabase.from("records").insert(insert).select("*").single();
    if (error) throw error;

    if (issues.length) {
      const { error: itemsError } = await supabase.from("record_items").insert(
        issues.map((item, index) => ({
          id: item.id,
          record_id: id,
          issue: item.issue,
          required_work: item.requiredWork,
          sort_order: index,
        })),
      );
      if (itemsError) throw itemsError;
    }

    await supabase.from("record_events").insert({
      record_id: id,
      type: "created",
      message: `${recordType} sukurtas`,
      actor_email: profile.email,
      actor_name: profile.displayName,
    }).then(({ error: eventError }) => {
      if (eventError) console.error("record_events insert:", eventError);
    });

    const mapped = await fetchRecordBundle(supabase, id);
    return Response.json({ defect: mapped }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
