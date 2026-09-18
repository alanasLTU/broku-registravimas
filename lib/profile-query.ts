import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_COLUMNS_BASE = "id, email, display_name, role, is_super_admin, permissions";
export const PROFILE_COLUMNS_WITH_PHONE = `${PROFILE_COLUMNS_BASE}, phone`;

export type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_super_admin: boolean;
  permissions: Record<string, unknown> | null;
  phone?: string | null;
};

function missingPhoneColumn(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("phone") && (message.includes("does not exist") || message.includes("column"));
}

export function withPhoneFallback<T extends ProfileRow | null>(row: T): T {
  if (!row || "phone" in row) return row;
  return { ...row, phone: "" } as T;
}

export async function selectProfileByUserId(client: SupabaseClient, userId: string) {
  const withPhone = await client
    .from("profiles")
    .select(PROFILE_COLUMNS_WITH_PHONE)
    .eq("id", userId)
    .maybeSingle();
  if (!withPhone.error) return withPhone;
  if (!missingPhoneColumn(withPhone.error)) return withPhone;

  const fallback = await client
    .from("profiles")
    .select(PROFILE_COLUMNS_BASE)
    .eq("id", userId)
    .maybeSingle();
  if (fallback.error) return fallback;
  return { data: withPhoneFallback(fallback.data), error: null };
}

export async function insertProfileReturning(
  client: SupabaseClient,
  values: Record<string, unknown>,
) {
  const withPhone = await client
    .from("profiles")
    .upsert(values)
    .select(PROFILE_COLUMNS_WITH_PHONE)
    .single();
  if (!withPhone.error) return withPhone;
  if (!missingPhoneColumn(withPhone.error)) return withPhone;

  const fallback = await client
    .from("profiles")
    .upsert(values)
    .select(PROFILE_COLUMNS_BASE)
    .single();
  if (fallback.error) return fallback;
  return { data: withPhoneFallback(fallback.data), error: null };
}

export async function updateProfileReturning(
  client: SupabaseClient,
  userId: string,
  values: Record<string, unknown>,
) {
  const withPhone = await client
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select(PROFILE_COLUMNS_WITH_PHONE)
    .single();
  if (!withPhone.error) return withPhone;
  if (!missingPhoneColumn(withPhone.error)) return withPhone;

  const { phone: _phone, ...rest } = values;
  const fallback = await client
    .from("profiles")
    .update(rest)
    .eq("id", userId)
    .select(PROFILE_COLUMNS_BASE)
    .single();
  if (fallback.error) return fallback;
  return { data: withPhoneFallback({ ...fallback.data, phone: String(values.phone ?? "") }), error: null };
}

export async function selectStaffProfiles(client: SupabaseClient) {
  const withPhone = await client
    .from("profiles")
    .select("id, display_name, email, phone, role")
    .in("role", ["admin", "staff"])
    .order("display_name");
  if (!withPhone.error) return withPhone;
  if (!missingPhoneColumn(withPhone.error)) return withPhone;

  const fallback = await client
    .from("profiles")
    .select("id, display_name, email, role")
    .in("role", ["admin", "staff"])
    .order("display_name");
  if (fallback.error) return fallback;
  return {
    data: (fallback.data ?? []).map((row) => ({ ...row, phone: "" })),
    error: null,
  };
}

export async function selectLinkedProfile(client: SupabaseClient, profileId: string) {
  const withPhone = await client
    .from("profiles")
    .select("display_name, email, phone")
    .eq("id", profileId)
    .maybeSingle();
  if (!withPhone.error) return withPhone;
  if (!missingPhoneColumn(withPhone.error)) return withPhone;

  const fallback = await client
    .from("profiles")
    .select("display_name, email")
    .eq("id", profileId)
    .maybeSingle();
  if (fallback.error) return fallback;
  return { data: fallback.data ? { ...fallback.data, phone: "" } : null, error: null };
}

const PROJECT_CONTACTS_WITH_PHONE =
  "id, role, category, work_scope, notify_email, profile_id, contacts(id, name, phone, email), profiles(id, display_name, email, phone)";
const PROJECT_CONTACTS_BASE =
  "id, role, category, work_scope, notify_email, profile_id, contacts(id, name, phone, email), profiles(id, display_name, email)";

export async function selectProjectContacts(client: SupabaseClient, projectId: string) {
  const withPhone = await client
    .from("project_contacts")
    .select(PROJECT_CONTACTS_WITH_PHONE)
    .eq("project_id", projectId)
    .order("role");
  if (!withPhone.error) return withPhone;
  if (!missingPhoneColumn(withPhone.error)) return withPhone;

  const fallback = await client
    .from("project_contacts")
    .select(PROJECT_CONTACTS_BASE)
    .eq("project_id", projectId)
    .order("role");
  if (fallback.error) return fallback;
  return {
    data: (fallback.data ?? []).map((row) => ({
      ...row,
      profiles: row.profiles ? { ...row.profiles, phone: "" } : row.profiles,
    })),
    error: null,
  };
}

export async function updateOwnProfile(
  client: SupabaseClient,
  userId: string,
  updates: Record<string, string>,
) {
  const withPhone = await client
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("id, display_name, email, phone")
    .single();
  if (!withPhone.error) return withPhone;
  if (!missingPhoneColumn(withPhone.error) || !("phone" in updates)) return withPhone;

  const { phone, ...rest } = updates;
  if (!Object.keys(rest).length) {
    const current = await selectProfileByUserId(client, userId);
    if (current.error || !current.data) return { data: null, error: current.error ?? { message: "Profilis nerastas." } };
    return {
      data: {
        id: current.data.id,
        display_name: current.data.display_name,
        email: current.data.email,
        phone,
      },
      error: null,
    };
  }

  const fallback = await client
    .from("profiles")
    .update(rest)
    .eq("id", userId)
    .select("id, display_name, email")
    .single();
  if (fallback.error) return fallback;
  return {
    data: { ...fallback.data, phone },
    error: null,
  };
}
