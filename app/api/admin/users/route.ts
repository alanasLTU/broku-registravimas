import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { sendUserInviteEmail } from "@/lib/email";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isSuperAdminEmail } from "@/lib/constants";
import { PERMISSION_KEYS, resolvePermissions, type UserRole } from "@/lib/permissions";
import { generateTempPassword } from "@/lib/temp-password";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administratorius",
  staff: "Distyle komanda",
  contractor: "Tiekėjas / montuotojas",
  client: "Klientas",
};

async function saveLoginPassword(admin: SupabaseClient, userId: string, password: string) {
  const { error } = await admin.from("profile_login_secrets").upsert({
    user_id: userId,
    password,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function loadLoginPasswords(admin: SupabaseClient) {
  const map = new Map<string, string>();
  const { data, error } = await admin.from("profile_login_secrets").select("user_id, password");
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.user_id && row.password) map.set(row.user_id as string, row.password as string);
  }
  return map;
}

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string) {
  const { data: profileRow } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  return profileRow?.id as string | undefined;
}

async function detachProfileReferences(admin: SupabaseClient, userId: string) {
  await admin.from("records").update({ supervisor_id: null }).eq("supervisor_id", userId);
  await admin.from("records").update({ created_by: null }).eq("created_by", userId);
  await admin.from("projects").update({ created_by: null }).eq("created_by", userId);
  await admin.from("project_invites").update({ created_by: null }).eq("created_by", userId);
  await admin.from("contacts").update({ created_by: null }).eq("created_by", userId);
}

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

    const secrets = profile.isSuperAdmin ? await loadLoginPasswords(admin) : new Map<string, string>();

    return Response.json({
      viewer: { id: profile.id, isSuperAdmin: profile.isSuperAdmin },
      users: (data ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        isSuperAdmin: row.is_super_admin,
        permissions: resolvePermissions(row.role as UserRole, (row.permissions as Record<string, boolean>) ?? {}),
        loginPassword: profile.isSuperAdmin ? (secrets.get(row.id) ?? "") : "",
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

    let userId = created.data.user?.id ?? "";
    if (created.error || !userId) {
      const message = (created.error?.message ?? "").toLocaleLowerCase();
      if (!message.includes("already") && !message.includes("registered") && !message.includes("exists")) {
        throw created.error || new Error("Nepavyko sukurti vartotojo");
      }
      const existingId = await findAuthUserIdByEmail(admin, email);
      if (!existingId) throw created.error || new Error("Vartotojas jau egzistuoja, bet nerastas.");
      await admin.auth.admin.updateUserById(existingId, { password, email_confirm: true });
      userId = existingId;
    }

    const permissions = PERMISSION_KEYS.reduce<Record<string, boolean>>((acc, key) => {
      if (typeof payload.permissions?.[key] === "boolean") acc[key] = payload.permissions[key]!;
      return acc;
    }, {});

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle();

    await admin.from("profiles").upsert({
      id: userId,
      email,
      display_name: displayName,
      role,
      permissions,
      is_super_admin: Boolean(existingProfile?.is_super_admin) || isSuperAdminEmail(email),
    });

    await saveLoginPassword(admin, userId, password);

    const projectIds = (payload.projectIds ?? []).filter(Boolean);
    if (projectIds.length) {
      await admin.from("project_members").upsert(
        projectIds.map((projectId) => ({
          project_id: projectId,
          user_id: userId,
          member_role: role === "client" ? "client" : "staff",
        })),
        { onConflict: "project_id,user_id" },
      );
    }

    const emailResult = await sendUserInviteEmail({
      email,
      displayName,
      password,
      roleLabel: ROLE_LABELS[role] ?? role,
    });

    return Response.json({
      user: {
        id: userId,
        email,
        displayName,
        role,
        permissions: resolvePermissions(role, permissions),
        loginPassword: profile.isSuperAdmin ? password : "",
      },
      email: emailResult,
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
      generatePassword?: boolean;
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

    let nextPassword = payload.password?.trim() ?? "";
    if (payload.generatePassword) nextPassword = generateTempPassword();
    if (nextPassword) {
      if (nextPassword.length < 6) {
        return Response.json({ error: "Slaptažodis turi būti bent 6 simboliai." }, { status: 400 });
      }
      await admin.auth.admin.updateUserById(id, { password: nextPassword });
      await saveLoginPassword(admin, id, nextPassword);
      return Response.json({
        ok: true,
        password: profile.isSuperAdmin ? nextPassword : undefined,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, profile } = await requireUser();
    requirePermission(profile, "manage_users");
    if (!admin) return Response.json({ error: "Trūksta SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

    const payload = await request.json() as { id?: string };
    const id = payload.id?.trim() ?? "";
    if (!id) return Response.json({ error: "Nenurodytas vartotojas." }, { status: 400 });
    if (id === profile.id) {
      return Response.json({ error: "Savęs ištrinti negalima." }, { status: 400 });
    }

    const { data: target, error } = await admin
      .from("profiles")
      .select("id, is_super_admin")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!target) return Response.json({ error: "Vartotojas nerastas." }, { status: 404 });
    if (target.is_super_admin) {
      return Response.json({ error: "Super admino ištrinti negalima." }, { status: 400 });
    }

    await detachProfileReferences(admin, id);
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) throw removed.error;

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
