import { apiError, requireUser } from "@/lib/auth";
import { clientRecordTypes, COMPLETED_STATUS, normalizeStatus, priorities, recordTypes, responsibilities, statuses } from "@/lib/constants";
import { mapRecord, type RecordRow } from "@/lib/map-record";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, profile } = await requireUser();
    const payload = await request.json() as Record<string, unknown>;

    const { data: before, error: beforeError } = await supabase.from("records").select("*").eq("id", id).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return Response.json({ error: "Įrašas nerastas." }, { status: 404 });

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: (before.version as number) + 1,
    };
    const itemsProvided = Array.isArray(payload.items);
    const itemPayload = itemsProvided
      ? payload.items.slice(0, 20).map((value) => {
        const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          id: typeof item.id === "string" && !item.id.startsWith("legacy-") ? item.id : crypto.randomUUID(),
          issue: typeof item.issue === "string" ? item.issue.trim().slice(0, 2000) : "",
          requiredWork: typeof item.requiredWork === "string" ? item.requiredWork.trim().slice(0, 2000) : "",
        };
      }).filter((item) => item.issue)
      : null;
    if (itemsProvided) {
      updates.description = itemPayload?.map((item) => item.issue).join("\n") ?? "";
      updates.required_work = itemPayload?.map((item) => item.requiredWork).filter(Boolean).join("\n") ?? "";
    }
    if (typeof payload.recordType === "string" && recordTypes.includes(payload.recordType as typeof recordTypes[number])) {
      if (profile.role === "client" && !clientRecordTypes.includes(payload.recordType as typeof clientRecordTypes[number])) {
        return Response.json({ error: "Klientai negali kurti užduočių." }, { status: 403 });
      }
      updates.record_type = payload.recordType;
    }
    if (typeof payload.title === "string" && payload.title.trim()) updates.title = payload.title.trim().slice(0, 300);
    if (typeof payload.room === "string") updates.room = payload.room.trim().slice(0, 120);
    if (typeof payload.zone === "string") updates.zone = payload.zone.trim().slice(0, 120);
    if (typeof payload.priority === "string" && priorities.includes(payload.priority as typeof priorities[number])) updates.priority = payload.priority;
    if (typeof payload.responsible === "string") {
      const party = payload.responsible.trim();
      if (responsibilities.includes(party as typeof responsibilities[number])) updates.responsible = party;
    }
    if (typeof payload.assignee === "string") updates.assignee = payload.assignee.trim().slice(0, 120);
    if (typeof payload.due === "string") updates.due_date = payload.due && payload.due !== "Nenustatyta" ? payload.due : null;
    if (typeof payload.archived === "boolean") {
      updates.archived = payload.archived;
      updates.archived_at = payload.archived ? new Date().toISOString() : null;
      if (payload.archived) {
        updates.status = COMPLETED_STATUS;
        updates.resolved_at = new Date().toISOString();
      }
    }
    if (typeof payload.status === "string") {
      const nextStatus = normalizeStatus(payload.status);
      if (statuses.includes(nextStatus)) {
        updates.status = nextStatus;
        const completed = nextStatus === COMPLETED_STATUS;
        if (completed) updates.resolved_at = new Date().toISOString();
        if (completed && typeof payload.archived !== "boolean") {
          updates.archived = true;
          updates.archived_at = new Date().toISOString();
        }
      }
    }
    if (typeof payload.resolution === "string") updates.resolution = payload.resolution.trim().slice(0, 4000);
    if (typeof payload.requestedBy === "string") updates.requested_by = payload.requestedBy.trim().slice(0, 200);
    if (typeof payload.notes === "string") updates.notes = payload.notes.trim().slice(0, 4000);
    if (typeof payload.price === "string" || typeof payload.price === "number") {
      const value = Number(String(payload.price).trim().replace(",", "."));
      updates.price_cents = String(payload.price).trim() && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
    }
    if (typeof payload.selected === "boolean") updates.include_in_report = payload.selected;

    const { data: after, error } = await supabase.from("records").update(updates).eq("id", id).select("*").single();
    if (error) throw error;

    if (itemsProvided) {
      await supabase.from("record_items").delete().eq("record_id", id);
      if (itemPayload?.length) {
        await supabase.from("record_items").insert(itemPayload.map((item, index) => ({
          id: item.id,
          record_id: id,
          issue: item.issue,
          required_work: item.requiredWork,
          sort_order: index,
        })));
      }
    }

    const changes: string[] = [];
    if (updates.status && updates.status !== before.status) changes.push(`Būsena pakeista į „${updates.status}“`);
    if (updates.archived === true && !before.archived) changes.push("Įrašas archyvuotas");
    if (updates.archived === false && before.archived) changes.push("Įrašas grąžintas į sąrašą");
    if (updates.responsible && updates.responsible !== before.responsible) changes.push(`Atsakomybė priskirta: ${updates.responsible}`);
    if (!changes.length) changes.push("Įrašas atnaujintas");
    try {
      await supabase.from("record_events").insert({
        record_id: id,
        type: "updated",
        message: changes.join(" · "),
        actor_email: profile.email,
        actor_name: profile.displayName,
      });
    } catch (eventError) {
      console.error("record_events insert failed:", eventError);
    }

    const [{ data: items }, { data: media }] = await Promise.all([
      supabase.from("record_items").select("*").eq("record_id", id).order("sort_order"),
      supabase.from("record_media").select("*").eq("record_id", id).order("sort_order"),
    ]);
    return Response.json({ defect: await mapRecord(supabase, after as RecordRow, items ?? [], media ?? []) });
  } catch (error) {
    return apiError(error);
  }
}
