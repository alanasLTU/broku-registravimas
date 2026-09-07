export const VIEW_PERMISSION_KEYS = ["see_internal", "generate_reports"] as const;
export const EDIT_PERMISSION_KEYS = [
  "create_records",
  "edit_records",
  "delete_records",
  "delete_media",
  "manage_projects",
  "invite_clients",
  "manage_users",
] as const;

export const PERMISSION_KEYS = [
  "create_records",
  "edit_records",
  "delete_records",
  "delete_media",
  "manage_projects",
  "invite_clients",
  "generate_reports",
  "see_internal",
  "manage_users",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type UserRole = "admin" | "staff" | "contractor" | "client";

export type UserPermissions = Partial<Record<PermissionKey, boolean>>;

const ROLE_DEFAULTS: Record<UserRole, Record<PermissionKey, boolean>> = {
  admin: {
    create_records: true,
    edit_records: true,
    delete_records: true,
    delete_media: true,
    manage_projects: true,
    invite_clients: true,
    generate_reports: true,
    see_internal: true,
    manage_users: true,
  },
  staff: {
    create_records: true,
    edit_records: true,
    delete_records: false,
    delete_media: true,
    manage_projects: true,
    invite_clients: true,
    generate_reports: true,
    see_internal: true,
    manage_users: false,
  },
  contractor: {
    create_records: false,
    edit_records: true,
    delete_records: false,
    delete_media: false,
    manage_projects: false,
    invite_clients: false,
    generate_reports: false,
    see_internal: false,
    manage_users: false,
  },
  client: {
    create_records: true,
    edit_records: false,
    delete_records: false,
    delete_media: false,
    manage_projects: false,
    invite_clients: false,
    generate_reports: false,
    see_internal: false,
    manage_users: false,
  },
};

export function isInternalRole(role: string, isSuperAdmin = false): role is "admin" | "staff" {
  return isSuperAdmin || role === "admin" || role === "staff";
}

export function resolvePermissions(role: UserRole, overrides: UserPermissions = {}): Record<PermissionKey, boolean> {
  const base = { ...ROLE_DEFAULTS[role] };
  for (const key of PERMISSION_KEYS) {
    if (typeof overrides[key] === "boolean") base[key] = overrides[key]!;
  }
  if (role === "admin") {
    for (const key of PERMISSION_KEYS) base[key] = true;
  }
  return base;
}

export function hasPermission(
  role: UserRole,
  overrides: UserPermissions,
  key: PermissionKey,
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin || role === "admin") return true;
  return resolvePermissions(role, overrides)[key];
}
