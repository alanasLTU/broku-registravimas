import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { SEED_STAFF_EMAIL, SEED_STAFF_PASSWORD } from "@/lib/seed-login";

export const dynamic = "force-dynamic";

function directLoginAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DIRECT_LOGIN === "true";
}

async function findUserByEmail(admin: NonNullable<ReturnType<typeof createAdminSupabase>>, email: string) {
  const normalized = email.toLocaleLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLocaleLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>,
  email: string,
  password: string,
) {
  const existing = await findUserByEmail(admin, email);
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: email.split("@")[0] },
    });
    if (error) throw error;
    return data.user;
  }
  return existing;
}

async function promoteStaff(admin: NonNullable<ReturnType<typeof createAdminSupabase>>, userId: string, email: string) {
  await admin.from("profiles").upsert({
    id: userId,
    email,
    display_name: email === SEED_STAFF_EMAIL ? "Alanas" : email.split("@")[0],
    role: "staff",
  });
}

async function ensureClientProfile(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>,
  userId: string,
  email: string,
) {
  const { data: existing } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (existing?.role === "staff") return;
  await admin.from("profiles").upsert({
    id: userId,
    email,
    display_name: email.split("@")[0],
    role: "client",
  });
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
    if (email === SEED_STAFF_EMAIL) {
      if (password.toLocaleLowerCase() !== SEED_STAFF_PASSWORD.toLocaleLowerCase()) {
        return NextResponse.json({ error: "Neteisingas slaptažodis." }, { status: 400 });
      }
      const user = await ensureUser(admin, SEED_STAFF_EMAIL, SEED_STAFF_PASSWORD);
      if (user) await promoteStaff(admin, user.id, SEED_STAFF_EMAIL);

      const supabase = await createServerSupabase();
      let auth = await supabase.auth.signInWithPassword({ email: SEED_STAFF_EMAIL, password: SEED_STAFF_PASSWORD });
      if (auth.error && user) {
        await admin.auth.admin.updateUserById(user.id, { password: SEED_STAFF_PASSWORD, email_confirm: true });
        auth = await supabase.auth.signInWithPassword({ email: SEED_STAFF_EMAIL, password: SEED_STAFF_PASSWORD });
      }
      if (auth.error || !auth.data.session) {
        return NextResponse.json({ error: auth.error?.message || "Sesijos sukurti nepavyko" }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        access_token: auth.data.session.access_token,
        refresh_token: auth.data.session.refresh_token,
      });
    }

    const user = await ensureUser(admin, email, password);
    if (user) await ensureClientProfile(admin, user.id, email);

    const supabase = await createServerSupabase();
    let auth = await supabase.auth.signInWithPassword({ email, password });
    if (auth.error && user) {
      await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
      auth = await supabase.auth.signInWithPassword({ email, password });
    }
    if (auth.error || !auth.data.session) {
      return NextResponse.json({ error: auth.error?.message || "Sesijos sukurti nepavyko" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      access_token: auth.data.session.access_token,
      refresh_token: auth.data.session.refresh_token,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nepavyko prisijungti" }, { status: 500 });
  }
}
