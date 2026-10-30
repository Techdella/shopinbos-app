import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { DetailsError, requestEmailChange } from "@/lib/my-details.server";
import { EmailChangeSchema } from "@/lib/my-details-rules";

export const dynamic = "force-dynamic";

// Change the sign-in email (My details). Supabase sends a confirmation link to the new address, and to the current
// one too; the email changes once the links are opened. An email another account uses is refused (409 EMAIL_TAKEN).
//   POST { email } → { data: { pendingEmail, currentToo } }

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = EmailChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Enter a valid email address.");
  try {
    return ok(await requestEmailChange(user, req, parsed.data.email));
  } catch (error) {
    if (error instanceof DetailsError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});
