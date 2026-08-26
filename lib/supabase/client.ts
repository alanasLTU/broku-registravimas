import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Trūksta NEXT_PUBLIC_SUPABASE_URL arba NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient(url, key);
}
