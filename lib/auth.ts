import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { isSuperAdminEmail } from "@/lib/constants";
import { hasPermission, type PermissionKey, type UserPermissions, type UserRole } from "@/lib/permissions";
import {
  insertProfileReturning,
  selectProfileByUserId,
  updateProfileReturning,
  type ProfileRow,
} from "@/lib/profile-query";

export { errorMessage };

export class AppAccessError extends Error {
  constructor(message: string, public status: 401 | 403) {
    super(message);
  }
}

export function apiError(error: unknown) {
  const message = errorMessage(error);
  const status = error instanceof AppAccessError ? error.status : 500;
  if (status >= 500) console.error(error);
  return Response.json({ error: message }, { status });
}

export type AppProfile = {
  id: string;
  email: string;
  displayName: string;
  phone: string;
  role: UserRole;
  isSuperAdmin: boolean;
  permissions: UserPermissions;
};

export function profileCan(profile: AppProfile, key: PermissionKey) {
  return hasPermission(profile.role, profile.permissions, key, profile.isSuperAdmin);
}

export function requirePermission(profile: AppProfile, key: PermissionKey) {
  if (!profileCan(profile, key)) {
    throw new AppAccessError("Neturite teisės atlikti šį veiksmą.", 403);
  }
}

function toAppProfile(profile: ProfileRow, fallbackEmail: string): AppProfile {
  return {
    id: profile.id,
    email: profile.email || fallbackEmail,
    displayName: profile.display_name || fallbackEmail,
    phone: String(profile.phone ?? ""),
    role: (profile.role as UserRole) || "client",
    isSuperAdmin: Boolean(profile.is_super_admin),
    permissions: (profile.permissions as UserPermissions) ?? {},
  };
}

export async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new AppAccessError("Prisijunkite, kad galėtumėte naudotis registru.", 401);

  const admin = createAdminSupabase();
  const client = admin ?? supabase;

  let { data: profile, error } = await selectProfileByUserId(client, user.id);
  if (error) throw error;

  if (!profile) {
    const displayName = user.user_metadata?.full_name || user.email.split("@")[0];
    const { count } = await client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    const isSeedAdmin = isSuperAdminEmail(user.email);
    const role: UserRole = isSeedAdmin || !count ? "admin" : "client";
    const inserted = await insertProfileReturning(client, {
      id: user.id,
      email: user.email,
      display_name: displayName,
      role,
      is_super_admin: isSeedAdmin,
    });
    if (inserted.error) throw inserted.error;
    profile = inserted.data;
  } else if (isSuperAdminEmail(user.email) && profile.role !== "admin") {
    const updated = await updateProfileReturning(client, user.id, { role: "admin", is_super_admin: true });
    if (!updated.error && updated.data) profile = updated.data;
  } else if (profile.is_super_admin && profile.role !== "admin" && profile.role !== "staff") {
    const updated = await updateProfileReturning(client, user.id, { role: "admin" });
    if (!updated.error && updated.data) profile = updated.data;
  }

  if (!profile) throw new AppAccessError("Nepavyko sukurti profilio. Patikrinkite SUPABASE_SERVICE_ROLE_KEY.", 401);

  return {
    supabase,
    admin,
    user,
    profile: toAppProfile(profile, user.email),
  };
}

export function locationLabel(room?: string | null, zone?: string | null) {
  return [room, zone].map((value) => value?.trim()).filter(Boolean).join(" · ");
}
