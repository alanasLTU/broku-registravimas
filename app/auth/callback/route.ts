import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  }

  const invite = url.searchParams.get("invite");
  if (invite) {
    const { error } = await supabase.rpc("accept_project_invite", { invite_token: invite });
    if (error) {
      return NextResponse.redirect(new URL(`/?inviteError=${encodeURIComponent(error.message)}`, url.origin));
    }
  }

  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
}
