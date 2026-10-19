import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { requestAccountDeletion } from "@/lib/account-deletion.server";

const Body = z.object({ reason: z.string().max(1000).optional() }).nullable();

// POST /api/app/account/deletion: "Delete my account" in the phone app (any role). Closes the seller's shop and asks
// the support team to delete the account within 30 days (src/lib/account-deletion.server.ts).
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const result = await requestAccountDeletion(user, parsed.success ? parsed.data?.reason : undefined);
  return ok(result);
});
