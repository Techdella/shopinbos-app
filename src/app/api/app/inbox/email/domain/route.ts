import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { emailSetupFailure, sellerEmailStore } from "@/lib/email-channel/http.server";
import { checkDomainEmail, emailSetupView, startDomainEmail } from "@/lib/email-channel/server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Email on the store's own domain (Resend).
//   POST  { prefix, fromName }  start: create the sending domain; on a domain bought through Shopinbos the DNS
//                               records are added on Vercel for the seller
//   PUT                         "Check again": ask Resend to check the records, switch over once they pass

const StartSchema = z
  .object({
    prefix: z.string().trim().toLowerCase().min(1, "Choose the part before the @").max(32),
    fromName: z.string().trim().min(1, "Write the name customers will see").max(60),
  })
  .strict();

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerEmailStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");
  const limit = await checkRateLimitShared(rateLimitKey("email-domain-start", store.id), { maxRequests: 5, windowMs: 60 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "You've tried this a few times. Wait a little and try again.", 429);
  try {
    await startDomainEmail(store, parsed.data);
  } catch (error) {
    return emailSetupFailure(error);
  }
  return ok(await emailSetupView(store));
});

export const PUT = withSeller(async (_req, { user }) => {
  const store = await sellerEmailStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const limit = await checkRateLimitShared(rateLimitKey("email-domain-check", store.id), { maxRequests: 40, windowMs: 10 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Give it a few minutes before checking again.", 429);
  try {
    await checkDomainEmail(store.id, store.name);
  } catch (error) {
    return emailSetupFailure(error);
  }
  return ok(await emailSetupView(store));
});
