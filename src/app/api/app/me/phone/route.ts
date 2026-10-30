import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { DetailsError, confirmPhoneCode, sendPhoneCode } from "@/lib/my-details.server";
import { PhoneChangeSchema } from "@/lib/my-details-rules";

export const dynamic = "force-dynamic";

// Change the sign-in phone (My details): a 6-digit code goes to the new number (WhatsApp first when set up, else
// SMS), and the number changes once the code is typed in. A number another account uses is refused (409 PHONE_TAKEN).
//   POST { action: "send", phone, via? }                 → { data: { phone, challenge, channel } }
//   POST { action: "verify", phone, challenge, code }    → { data: { phone } }

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = PhoneChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Enter your new phone number.");
  try {
    const body = parsed.data;
    return ok(body.action === "send" ? await sendPhoneCode(user, body) : await confirmPhoneCode(user, body));
  } catch (error) {
    if (error instanceof DetailsError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});
