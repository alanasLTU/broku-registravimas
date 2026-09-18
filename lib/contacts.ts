import type { SupabaseClient } from "@supabase/supabase-js";

export async function deleteContactIfOrphan(supabase: SupabaseClient, contactId: string) {
  const { count, error: countError } = await supabase
    .from("project_contacts")
    .select("*", { count: "exact", head: true })
    .eq("contact_id", contactId);
  if (countError) throw countError;
  if (count && count > 0) return { deleted: false as const };

  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) throw error;
  return { deleted: true as const };
}

export async function cleanupOrphanContacts(supabase: SupabaseClient, contactIds: string[]) {
  const uniqueIds = [...new Set(contactIds.filter(Boolean))];
  for (const contactId of uniqueIds) {
    await deleteContactIfOrphan(supabase, contactId);
  }
}
