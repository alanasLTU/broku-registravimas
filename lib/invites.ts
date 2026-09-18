import type { SupabaseClient } from "@supabase/supabase-js";

export type InviteLookup = {
  status: "open" | "used" | "invalid";
  email?: string;
  projectName?: string;
};

function mapInviteRow(row: {
  email?: string | null;
  accepted_at?: string | null;
  projects?: { name?: string | null } | { name?: string | null }[] | null;
} | null): InviteLookup {
  if (!row?.email) return { status: "invalid" };
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
  const projectName = project?.name?.trim() || undefined;
  if (row.accepted_at) {
    return { status: "used", email: row.email.trim().toLowerCase(), projectName };
  }
  return { status: "open", email: row.email.trim().toLowerCase(), projectName };
}

export async function lookupInviteToken(client: SupabaseClient, token: string): Promise<InviteLookup> {
  const trimmed = token.trim();
  if (!trimmed) return { status: "invalid" };

  const rpc = await client.rpc("peek_project_invite", { invite_token: trimmed });
  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    const payload = rpc.data as { status?: string; email?: string; projectName?: string };
    if (payload.status === "open" || payload.status === "used" || payload.status === "invalid") {
      return {
        status: payload.status,
        email: payload.email?.trim().toLowerCase(),
        projectName: payload.projectName?.trim() || undefined,
      };
    }
  }

  const { data, error } = await client
    .from("project_invites")
    .select("email, accepted_at, projects(name)")
    .eq("token", trimmed)
    .maybeSingle();
  if (error) throw error;
  return mapInviteRow(data);
}
