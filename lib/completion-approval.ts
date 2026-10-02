import type { AppProfile } from "@/lib/auth";
import { isInternalRole } from "@/lib/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

const LEGACY_APPROVER_ROLES = ["project_manager", "coordinator", "works_manager"] as const;

function missingPolicyColumns(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("approves_completion")
    && (message.includes("does not exist") || message.includes("column"));
}

export function canApproveCompletionClient(
  profile: { id?: string; role: string; isSuperAdmin?: boolean },
  contacts: Array<{ profileId?: string | null; approvesCompletion?: boolean; role?: string }>,
): boolean {
  if (isInternalRole(profile.role, profile.isSuperAdmin)) return true;
  if (!profile.id) return false;
  return contacts.some((item) => item.profileId === profile.id && item.approvesCompletion);
}

export async function canApproveCompletion(
  supabase: SupabaseClient,
  profile: AppProfile,
  projectId: string,
): Promise<boolean> {
  if (isInternalRole(profile.role, profile.isSuperAdmin)) return true;

  const withPolicy = await supabase
    .from("project_contacts")
    .select("profile_id, approves_completion, role")
    .eq("project_id", projectId)
    .eq("profile_id", profile.id)
    .eq("approves_completion", true);

  if (!withPolicy.error) return Boolean(withPolicy.data?.length);

  if (!missingPolicyColumns(withPolicy.error)) throw withPolicy.error;

  const legacy = await supabase
    .from("project_contacts")
    .select("profile_id")
    .eq("project_id", projectId)
    .in("role", [...LEGACY_APPROVER_ROLES])
    .eq("profile_id", profile.id);

  if (legacy.error) throw legacy.error;
  return Boolean(legacy.data?.length);
}

export async function recordHasRepairPhoto(supabase: SupabaseClient, recordId: string) {
  const { count, error } = await supabase
    .from("record_media")
    .select("id", { count: "exact", head: true })
    .eq("record_id", recordId)
    .eq("media_kind", "photo")
    .ilike("caption", "%po remonto%");

  if (error) throw error;
  return (count ?? 0) > 0;
}

export function hasCompletionEvidence(completionComment: string, hasRepairPhoto: boolean) {
  return Boolean(completionComment.trim()) || hasRepairPhoto;
}

export async function listCompletionApprovers(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Array<{ name: string; email: string }>> {
  const withPolicy = await supabase
    .from("project_contacts")
    .select("approves_completion, contacts(name, email), profiles(display_name, email)")
    .eq("project_id", projectId)
    .eq("approves_completion", true);

  if (!withPolicy.error) {
    return (withPolicy.data ?? []).map((row) => {
      const linked = row.profiles as { display_name?: string; email?: string } | null;
      const contact = row.contacts as { name?: string; email?: string } | null;
      return {
        name: linked?.display_name?.trim() || contact?.name?.trim() || "Kontaktas",
        email: linked?.email?.trim() || contact?.email?.trim() || "",
      };
    }).filter((item) => item.email);
  }

  if (!missingPolicyColumns(withPolicy.error)) throw withPolicy.error;

  const legacy = await supabase
    .from("project_contacts")
    .select("role, contacts(name, email), profiles(display_name, email)")
    .eq("project_id", projectId)
    .in("role", [...LEGACY_APPROVER_ROLES]);

  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []).map((row) => {
    const linked = row.profiles as { display_name?: string; email?: string } | null;
    const contact = row.contacts as { name?: string; email?: string } | null;
    return {
      name: linked?.display_name?.trim() || contact?.name?.trim() || "Kontaktas",
      email: linked?.email?.trim() || contact?.email?.trim() || "",
    };
  }).filter((item) => item.email);
}
