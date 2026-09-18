import type { RecordTypeName } from "@/lib/constants";

export type ProjectPlan = {
  id: string;
  projectId: string;
  title: string;
  objectKey: string;
  thumbObjectKey: string | null;
  width: number;
  height: number;
  sortOrder: number;
  fileUrl: string;
  thumbUrl: string | null;
  createdAt: string;
};

export type PlanRow = {
  id: string;
  project_id: string;
  title: string;
  object_key: string;
  thumb_object_key: string | null;
  width: number;
  height: number;
  sort_order: number;
  created_at: string;
};

export const PLAN_PIN_COLORS: Record<RecordTypeName, string> = {
  Brokas: "#e65c4f",
  Apimtis: "#2f7f63",
  "Papildoma apimtis": "#c9862a",
  Užduotis: "#3d6ea8",
};

export function planFileUrl(planId: string, thumb = false) {
  return thumb ? `/api/plans/${planId}/file?thumb=1` : `/api/plans/${planId}/file`;
}

export function mapPlan(row: PlanRow): ProjectPlan {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    objectKey: row.object_key,
    thumbObjectKey: row.thumb_object_key,
    width: row.width,
    height: row.height,
    sortOrder: row.sort_order,
    fileUrl: planFileUrl(row.id),
    thumbUrl: row.thumb_object_key ? planFileUrl(row.id, true) : null,
    createdAt: row.created_at,
  };
}

export function planObjectKey(projectId: string, planId: string) {
  return `${projectId}/plans/${planId}.jpg`;
}

export function planThumbObjectKey(projectId: string, planId: string) {
  return `${projectId}/plans/${planId}-thumb.jpg`;
}

export function clampPlanCoord(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.995, Math.max(0.005, value));
}
