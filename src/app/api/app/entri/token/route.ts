import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { entriToken } from "@/lib/entri/server";

export const dynamic = "force-dynamic";

// GET → { data: { applicationId, token } }: opens Entri's "Connect your domain" window (src/components/domains/
// EntriConnect.tsx). The secret stays on the server; the token lasts an hour.
export const GET = withSeller(async () => {
  const minted = await entriToken();
  if (!minted) return apiError("NOT_CONFIGURED", "Connecting a domain isn't switched on yet", 404);
  return ok(minted);
});
