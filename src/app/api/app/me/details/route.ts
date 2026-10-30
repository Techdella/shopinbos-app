import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { DetailsError, myDetails, saveMyDetails } from "@/lib/my-details.server";
import { DetailsPatchSchema } from "@/lib/my-details-rules";

export const dynamic = "force-dynamic";

// "My details" for every role (web /home/details, /supplier/details, /logistics/details; phone app/my-details.tsx).
//   GET   → { data: MyDetails }  (shared/my-details.ts)
//   PATCH { name?, business?: { name?, phone?, address?, city?, state? } } → { data: MyDetails }
// Email and phone are changed with a check: /api/app/me/email and /api/app/me/phone. Photo and logo: /api/app/me/images.

export const GET = withAuth(async (_req, { user }) => ok(await myDetails(user)));

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const parsed = DetailsPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your details.");
  try {
    await saveMyDetails(user, parsed.data);
  } catch (error) {
    if (error instanceof DetailsError) return apiError(error.code, error.message, error.status);
    throw error;
  }
  return ok(await myDetails(user));
});
