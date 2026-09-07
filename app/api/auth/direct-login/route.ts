import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/constants";
import { SEED_STAFF_EMAIL, SEED_STAFF_PASSWORD } from "@/lib/seed-login";

export const dynamic = "force-dynamic";

function directLoginAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DIRECT_LOGIN === "true";
}

function isInvalidCredentials(message: string) {
  const lower = message.toLocaleLowerCase();
  return lower.includes("invalid login") || lower.includes("invalid credentials") || lower.includes("email not confirmed");
}

async function ensureProfile(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>,
  userId: string,
  email: string,
) {
  const normalized = email.toLocaleLowerCase();
  const superAdmin = isSuperAdminEmail(normalized);
  const { data: existing } = await admin
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    const shouldBeAdmin = Boolean(existing.is_super_admin) || superAdmin;
    if (shouldBeAdmin && existing.role !== "admin") {
      await admin
        .from("profiles")
        .update({ role: "admin", is_super_admin: true })
        .eq("id", userId);
    }
    return;
  }

  await admin.from("profiles").insert({
    id: userId,
    email: normalized,
    display_name: superAdmin ? "Argintas" : email.split("@")[0],
    role: superAdmin ? "admin" : "client",
    is_super_admin: superAdmin,
  });
}

async function createConfirmedUser(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>,
  email: string,
  password: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  });
  if (error) {
    const message = error.message.toLocaleLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return null;
    }
    throw error;
  }
  return data.user;
}

export async function POST(request: Request) {
  if (!directLoginAllowed()) {
    return NextResponse.json({ error: "Tiesioginis prisijungimas produkcijoje išjungtas." }, { status: 403 });
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Trūksta SUPABASE_SERVICE_ROLE_KEY faile .env.local." }, { status: 500 });
  }

  const payload = await request.json() as { email?: string; password?: string };
  const email = payload.email?.trim().toLocaleLowerCase() ?? "";
  const password = payload.password ?? "";
  if (!email.includes("@") || password.length < 6) {
    return NextResponse.json({ error: "Įveskite el. paštą ir slaptažodį (bent 6 simboliai)." }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabase();
    const isSeed = email === SEED_STAFF_EMAIL;

    if (isSeed && password.toLocaleLowerCase() !== SEED_STAFF_PASSWORD.toLocaleLowerCase()) {
      return NextResponse.json({ error: "Neteisingas slaptažodis." }, { status: 400 });
    }

    // Fast path: existing users sign in immediately (no listUsers).
    let auth = await supabase.auth.signInWithPassword({
      email: isSeed ? SEED_STAFF_EMAIL : email,
      password: isSeed ? SEED_STAFF_PASSWORD : password,
    });

    // Seed bootstrap only: create or heal password if seed account is missing/out of sync.
    if (auth.error && isSeed) {
      const created = await createConfirmedUser(admin, SEED_STAFF_EMAIL, SEED_STAFF_PASSWORD);
      if (!created) {
        const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = listed?.users.find((user) => user.email?.toLocaleLowerCase() === SEED_STAFF_EMAIL);
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, {
            password: SEED_STAFF_PASSWORD,
            email_confirm: true,
          });
        }
      }
      auth = await supabase.auth.signInWithPassword({
        email: SEED_STAFF_EMAIL,
        password: SEED_STAFF_PASSWORD,
      });
    }

    // Guest register: create account only when credentials are invalid (user likely missing).
    if (auth.error && !isSeed && isInvalidCredentials(auth.error.message)) {
      const created = await createConfirmedUser(admin, email, password);
      if (created) {
        auth = await supabase.auth.signInWithPassword({ email, password });
      }
    }

    if (auth.error || !auth.data.session || !auth.data.user) {
      return NextResponse.json({
        error: auth.error?.message || "Neteisingas el. paštas arba slaptažodis.",
      }, { status: 400 });
    }

    await ensureProfile(admin, auth.data.user.id, email);

    return NextResponse.json({
      ok: true,
      access_token: auth.data.session.access_token,
      refresh_token: auth.data.session.refresh_token,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepavyko prisijungti" }, { status: 500 });
  }
}
