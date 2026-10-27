import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { recordAgeConfirmed } from "@/lib/auth/age.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/age { confirm: true }: "I'm 18 or older", from the one-time check shown to an account that never
// confirmed it (Google or Apple from a login page, or an account made before sign-up asked). src/lib/auth/age.ts
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== true) return apiError("BAD_REQUEST", "Confirm you're 18 or older to carry on.", 400);
  // A staff member acts in the owner's store; the confirmation is their own.
  await recordAgeConfirmed(user.staff?.userId ?? user.id);
  return ok({ ageConfirmed: true });
});
