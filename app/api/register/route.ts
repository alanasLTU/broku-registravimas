import { apiError } from "@/lib/auth";
import { loadRegisterPayload } from "@/lib/register-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await loadRegisterPayload());
  } catch (error) {
    return apiError(error);
  }
}
