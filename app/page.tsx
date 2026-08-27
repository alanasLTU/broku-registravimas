import Home from "./home";
import { loadRegisterPayload } from "@/lib/register-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    const initialData = await loadRegisterPayload();
    return <Home initialData={initialData} />;
    } catch {
    return <Home initialData={null} />;
  }
}
