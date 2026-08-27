import { apiError, requireUser } from "@/lib/auth";
import { isClientRecordType, isRecordType, recordPrefixes, responsibilities, priorities } from "@/lib/constants";
import { mapRecord } from "@/lib/map-record";

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
    const payload = await request.json() as Record<string, unknown>;
    const projectId = String(payload.projectId ?? "").trim();
    const title = String(payload.title ?? "").trim();
    const room = String(payload.room ?? "").trim();
    const zone = String(payload.zone ?? "").trim();
    const requestedType = String(payload.recordType ?? "Brokas");
    if (profile.role === "client" && requestedType === "Užduotis") {
      return Response.json({ error: "Klientai negali kurti užduočių." }, { status: 403 });
    }
    const recordType = profile.role === "client"
      ? (isClientRecordType(requestedType) ? requestedType : "Brokas")
      : (isRecordType(requestedType) ? requestedType : "Brokas");
    const issues = (Array.isArray(payload.issues) ? payload.issues as IssuePayload[] : [])
      .map((item) => ({
        id: item.id?.trim() && !item.id.startsWith("legacy-") ? item.id : crypto.randomUUID(),
        issue: item.issue?.trim().slice(0, 2000) || "",
        requiredWork: item.requiredWork?.trim().slice(0, 2000) || "",
      }))
      .filter((item) => item.issue)
      .slice(0, 20);

    if (!projectId || !title || !room || !zone) {
      return Response.json({ error: "Projektas, pavadinimas, patalpa ir zona yra privalomi." }, { status: 400 });
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
      record_type: recordType,
      title,
      room,
      zone,
      description,
      origin: profile.role,
      priority: priorities.includes(String(payload.priority) as typeof priorities[number]) ? String(payload.priority) : "Vidutinis",
      status: "Naujas",
      responsible: responsibilities.includes(requestedResponsible as typeof responsibilities[number]) ? requestedResponsible : "Montuotojai",
      assignee: String(payload.assignee ?? "").trim().slice(0, 120),
      due_date: (() => {
        const value = String(payload.due ?? "").trim();
        return !value || value === "Nenustatyta" ? null : value;
      })(),
      requested_by: String(payload.requestedBy ?? "").trim().slice(0, 200),
      price_cents: parsePrice(payload.price),
      notes: String(payload.notes ?? "").trim().slice(0, 4000),
      required_work: requiredWork,
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

    const mapped = await mapRecord(supabase, record, issues.map((item) => ({
      id: item.id,
      record_id: id,
      issue: item.issue,
      required_work: item.requiredWork,
    })), []);

    return Response.json({ defect: mapped }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
