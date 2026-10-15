import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { disconnectEmail } from "@/lib/email-channel/gmail.server";
import { emailSetupFailure, sellerEmailStore } from "@/lib/email-channel/http.server";
import { emailSetupView, updateEmailIdentity } from "@/lib/email-channel/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The store's email connection (Inbox → Email): what's connected and the setup steps. Never returns tokens.
//   GET     the setup view
//   PATCH   { fromName?, prefix? } the name customers see and the part before the @
//   DELETE  disconnect (Gmail is revoked at Google, an own domain is removed from Resend)

export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerEmailStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await emailSetupView(store));
});

const PatchSchema = z
  .object({
    fromName: z.string().trim().min(1, "Write the name customers will see").max(60).optional(),
    prefix: z.string().trim().toLowerCase().min(1).max(32).optional(),
  })
  .strict();

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerEmailStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");
  try {
    await updateEmailIdentity(store.id, store.name, parsed.data);
  } catch (error) {
    return emailSetupFailure(error);
  }
  return ok(await emailSetupView(store));
});

export const DELETE = withSeller(async (_req, { user }) => {
  const store = await sellerEmailStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  await disconnectEmail(store.id);
  return ok(await emailSetupView(store));
});
