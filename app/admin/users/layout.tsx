import { redirect } from "next/navigation";
import { profileCan, requireUser } from "@/lib/auth";

export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  try {
    const { profile } = await requireUser();
    if (!profileCan(profile, "manage_users")) {
      redirect("/?error=admin");
    }
  } catch {
    redirect("/login");
  }
  return children;
}
