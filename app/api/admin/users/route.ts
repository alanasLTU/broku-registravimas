import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isSuperAdminEmail } from "@/lib/constants";
import { PERMISSION_KEYS, resolvePermissions, type UserRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin, profile } = await requireUser();
    requirePermission(profile, "manage_users");
    if (!admin) return Response.json({ error: "Trūksta SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

    const { data, error } = await admin
      .from("profiles")
      .select("id, email, display_name, role, is_super_admin, permissions, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return Response.json({
      users: (data ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        isSuperAdmin: row.is_super_admin,
        permissions: resolvePermissions(row.role as UserRole, (row.permissions as Record<string, boolean>) ?? {}),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, profile } = await requireUser();
    requirePermission(profile, "manage_users");
    if (!admin) return Response.json({ error: "Trūksta SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

    const payload = await request.json() as {
      email?: string;
      password?: string;
      displayName?: string;
      role?: UserRole;
      permissions?: Record<string, boolean>;
      projectIds?: string[];
    };

    const email = payload.email?.trim().toLocaleLowerCase() ?? "";
    const password = payload.password ?? "";
    const displayName = payload.displayName?.trim() || email.split("@")[0];
    const role = payload.role ?? "staff";
    if (!email.includes("@") || password.length < 6) {
      return Response.json({ error: "Įveskite el. paštą ir slaptažodį (bent 6 simboliai)." }, { status: 400 });
    }

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });

    let user = created.data.user;
    if (created.error || !user) {
      const message = (created.error?.message ?? "").toLocaleLowerCase();
      if (!message.includes("already") && !message.includes("registered") && !message.includes("exists")) {
        throw created.error || new Error("Nepavyko sukurti vartotojo");
      }
      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = listed?.users.find((row) => row.email?.toLocaleLowerCase() === email);
      if (!existing) throw created.error || new Error("Vartotojas jau egzistuoja, bet nerastas.");
      await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      user = existing;
    }

    const permissions = PERMISSION_KEYS.reduce<Record<string, boolean>>((acc, key) => {
      if (typeof payload.permissions?.[key] === "boolean") acc[key] = payload.permissions[key]!;
      return acc;
    }, {});

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    await admin.from("profiles").upsert({
      id: user.id,
      email,
      display_name: displayName,
      role,
      permissions,
      is_super_admin: Boolean(existingProfile?.is_super_admin) || isSuperAdminEmail(email),
    });

    const projectIds = (payload.projectIds ?? []).filter(Boolean);
    if (projectIds.length) {
      await admin.from("project_members").upsert(
        projectIds.map((projectId) => ({
          project_id: projectId,
          user_id: user!.id,
          member_role: role === "client" ? "client" : "staff",
        })),
        { onConflict: "project_id,user_id" },
      );
    }

    return Response.json({
      user: {
        id: user.id,
        email,
        displayName,
        role,
        permissions: resolvePermissions(role, permissions),
      },
      email: { sent: false, skipped: true },
      credentials: { email, password },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, profile } = await requireUser();
    requirePermission(profile, "manage_users");
    if (!admin) return Response.json({ error: "Trūksta SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

    const payload = await request.json() as {
      id?: string;
      displayName?: string;
      role?: UserRole;
      permissions?: Record<string, boolean>;
      password?: string;
    };
    const id = payload.id?.trim() ?? "";
    if (!id) return Response.json({ error: "Nenurodytas vartotojas." }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (payload.displayName?.trim()) updates.display_name = payload.displayName.trim();
    if (payload.role) updates.role = payload.role;
    if (payload.permissions) updates.permissions = payload.permissions;
    if (Object.keys(updates).length) {
      const { error } = await admin.from("profiles").update(updates).eq("id", id);
      if (error) throw error;
    }
    if (payload.password && payload.password.length >= 6) {
      await admin.auth.admin.updateUserById(id, { password: payload.password });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
