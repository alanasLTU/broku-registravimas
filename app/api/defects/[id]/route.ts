import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { canApproveCompletion, recordHasRepairPhoto } from "@/lib/completion-approval";
import {
  COMPLETED_STATUS,
  isClientRecordType,
  isRecordType,
  MEDIA_BUCKET,
  normalizeStatus,
  PENDING_APPROVAL_STATUS,
  priorities,
  responsibilities,
  statuses,
} from "@/lib/constants";
import { asUuid } from "@/lib/ids";
import { fetchRecordBundle } from "@/lib/map-record";

export const dynamic = "force-dynamic";

function clearCompletionRequest(updates: Record<string, unknown>) {
  updates.completion_requested_by = null;
  updates.completion_requested_at = null;
  updates.completion_requested_name = null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "edit_records");
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
      ? (payload.items as unknown[]).slice(0, 20).map((value) => {
        const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          id: typeof item.id === "string" ? asUuid(item.id) : crypto.randomUUID(),
          issue: typeof item.issue === "string" ? item.issue.trim().slice(0, 2000) : "",
          requiredWork: typeof item.requiredWork === "string" ? item.requiredWork.trim().slice(0, 2000) : "",
        };
      }).filter((item) => item.issue)
      : null;
    if (itemsProvided) {
      updates.description = itemPayload?.map((item) => item.issue).join("\n") ?? "";
      updates.required_work = itemPayload?.map((item) => item.requiredWork).filter(Boolean).join("\n") ?? "";
    }
    if (typeof payload.recordType === "string" && isRecordType(payload.recordType)) {
      if (profile.role === "client" && !isClientRecordType(payload.recordType)) {
        return Response.json({ error: "Klientai negali kurti užduočių." }, { status: 403 });
      }
      updates.record_type = payload.recordType;
    }
    if (typeof payload.projectId === "string" && payload.projectId.trim()) {
      updates.project_id = payload.projectId.trim();
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
    if (typeof payload.executor === "string") updates.executor = payload.executor.trim().slice(0, 120);
    if (typeof payload.supervisorId === "string") {
      updates.supervisor_id = payload.supervisorId.trim() ? asUuid(payload.supervisorId) : null;
    }
    if (typeof payload.supervisorName === "string") {
      updates.supervisor_name = payload.supervisorName.trim().slice(0, 120);
      updates.supervisor_id = null;
    }
    if (typeof payload.due === "string") updates.due_date = payload.due && payload.due !== "Nenustatyta" ? payload.due : null;
    if (typeof payload.archived === "boolean") {
      updates.archived = payload.archived;
      updates.archived_at = payload.archived ? new Date().toISOString() : null;
    }

    if (payload.requestCompletion === true) {
      if (before.archived) {
        return Response.json({ error: "Archyvuoto įrašo užbaigti negalima." }, { status: 400 });
      }
      if (normalizeStatus(before.status) === PENDING_APPROVAL_STATUS) {
        return Response.json({ error: "Užbaigimas jau laukia patvirtinimo." }, { status: 400 });
      }
      if (normalizeStatus(before.status) === COMPLETED_STATUS) {
        return Response.json({ error: "Įrašas jau pažymėtas kaip sutvarkytas." }, { status: 400 });
      }
      const hasPhoto = await recordHasRepairPhoto(supabase, id);
      if (!hasPhoto) {
        return Response.json({ error: "Prieš siunčiant patvirtinimui pridėkite po remonto nuotrauką." }, { status: 400 });
      }
      updates.status = PENDING_APPROVAL_STATUS;
      updates.completion_requested_by = profile.id;
      updates.completion_requested_at = new Date().toISOString();
      updates.completion_requested_name = profile.displayName;
      updates.completion_approved_by = null;
      updates.completion_approved_at = null;
      updates.completion_approved_name = null;
    } else if (payload.approveCompletion === true) {
      if (normalizeStatus(before.status) !== PENDING_APPROVAL_STATUS) {
        return Response.json({ error: "Šis įrašas nelaukia patvirtinimo." }, { status: 400 });
      }
      const allowed = await canApproveCompletion(supabase, profile, String(before.project_id));
      if (!allowed) {
        return Response.json({ error: "Neturite teisės patvirtinti užbaigimo šiame projekte." }, { status: 403 });
      }
      const now = new Date().toISOString();
      updates.status = COMPLETED_STATUS;
      updates.archived = true;
      updates.archived_at = now;
      updates.resolved_at = now;
      updates.completion_approved_by = profile.id;
      updates.completion_approved_at = now;
      updates.completion_approved_name = profile.displayName;
    } else if (payload.rejectCompletion === true) {
      if (normalizeStatus(before.status) !== PENDING_APPROVAL_STATUS) {
        return Response.json({ error: "Šis įrašas nelaukia patvirtinimo." }, { status: 400 });
      }
      const allowed = await canApproveCompletion(supabase, profile, String(before.project_id));
      if (!allowed) {
        return Response.json({ error: "Neturite teisės atmesti užbaigimo šiame projekte." }, { status: 403 });
      }
      updates.status = "Vykdoma";
      clearCompletionRequest(updates);
      updates.completion_approved_by = null;
      updates.completion_approved_at = null;
      updates.completion_approved_name = null;
    } else if (typeof payload.status === "string") {
      const nextStatus = normalizeStatus(payload.status);
      if (statuses.includes(nextStatus)) {
        if (nextStatus === PENDING_APPROVAL_STATUS) {
          return Response.json({ error: "Naudokite „Baigti“ su nuotrauka, kad siųstumėte patvirtinimui." }, { status: 400 });
        }
        updates.status = nextStatus;
        const completed = nextStatus === COMPLETED_STATUS;
        if (completed) updates.resolved_at = new Date().toISOString();
        if (normalizeStatus(before.status) === PENDING_APPROVAL_STATUS) {
          clearCompletionRequest(updates);
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
    if (typeof payload.visibleToClient === "boolean") updates.visible_to_client = payload.visibleToClient;
    if (typeof payload.notifyResponsible === "boolean") updates.notify_responsible = payload.notifyResponsible;
    if (payload.planId === null) {
      updates.plan_id = null;
      updates.plan_x = null;
      updates.plan_y = null;
    } else if (typeof payload.planId === "string" && payload.planId.trim()) {
      updates.plan_id = payload.planId.trim();
      const x = Number(payload.planX);
      const y = Number(payload.planY);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        updates.plan_x = Math.min(0.995, Math.max(0.005, x));
        updates.plan_y = Math.min(0.995, Math.max(0.005, y));
      }
    }

    const { error } = await supabase.from("records").update(updates).eq("id", id).select("*").single();
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
    if (payload.requestCompletion === true) {
      changes.push(`Užbaigimą prašė ${profile.displayName} · laukia PV patvirtinimo`);
    } else if (payload.approveCompletion === true) {
      changes.push(`Užbaigimą patvirtino ${profile.displayName} · archyvuota`);
    } else if (payload.rejectCompletion === true) {
      changes.push(`Užbaigimą atmetė ${profile.displayName} · grąžinta į vykdymą`);
    } else {
      if (updates.status && updates.status !== before.status) changes.push(`Būsena pakeista į „${updates.status}“`);
      if (updates.archived === true && !before.archived) changes.push("Įrašas archyvuotas");
      if (updates.archived === false && before.archived) changes.push("Įrašas grąžintas į sąrašą");
      if (updates.responsible && updates.responsible !== before.responsible) changes.push(`Atsakomybė: ${updates.responsible}`);
      if (!changes.length) changes.push("Įrašas atnaujintas");
    }
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

    const defect = await fetchRecordBundle(supabase, id);
    return Response.json({ defect });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, admin, profile } = await requireUser();

    const { data: record } = await supabase.from("records").select("id, project_id, parent_record_id").eq("id", id).maybeSingle();
    if (!record) return Response.json({ error: "Įrašas nerastas." }, { status: 404 });

    if (record.parent_record_id) {
      requirePermission(profile, "edit_records");
    } else {
      requirePermission(profile, "delete_records");
    }

    const db = admin ?? supabase;

    const { data: media } = await db.from("record_media").select("object_key, thumb_object_key").eq("record_id", id);
    const keys = (media ?? []).flatMap((row) => [row.object_key, row.thumb_object_key].filter(Boolean)) as string[];
    if (keys.length) {
      await db.storage.from(MEDIA_BUCKET).remove(keys);
    }

    const { data: deleted, error } = await db.from("records").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!deleted?.length) {
      return Response.json({ error: "Nepavyko ištrinti įrašo iš duomenų bazės." }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
