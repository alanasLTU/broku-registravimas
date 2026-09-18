import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });

  if (!url || !key) {
    if (!request.nextUrl.pathname.startsWith("/login")) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/login";
      return NextResponse.redirect(redirect);
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const publicPath =
    path.startsWith("/login") ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/cron/") ||
    path === "/setup";

  if (!user && !publicPath) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (user && path.startsWith("/login")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    const invite = request.nextUrl.searchParams.get("invite");
    const join = request.nextUrl.searchParams.get("join");
    redirect.search = "";
    if (join) redirect.searchParams.set("join", join);
    else if (invite) redirect.searchParams.set("invite", invite);
    return NextResponse.redirect(redirect);
  }

  return response;
}
