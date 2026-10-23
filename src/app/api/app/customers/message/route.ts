import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { CustomerMessageError, messageCustomer } from "@/lib/customers/drawer.server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const key = z.string().trim().min(1).max(320);
const body = z.string().trim().min(1, "Write a message first").max(4000);

const BodySchema = z.discriminatedUnion("channel", [
  z.object({ key, channel: z.literal("email"), subject: z.string().trim().max(200).optional().nullable(), body }).strict(),
  z.object({ key, channel: z.literal("whatsapp"), body }).strict(),
  z.object({ key, channel: z.literal("sms"), body: z.string().trim().min(1, "Write a message first").max(918) }).strict(),
  z.object({ key, channel: z.literal("whatsapp_template"), templateId: z.string().trim().min(1).max(64), params: z.array(z.string().max(1000)).max(20).optional().nullable() }).strict(),
]);

// POST /api/app/customers/message — one message to one customer from the customer drawer, by email, WhatsApp
// (free text inside the 24-hour window, else an approved template) or SMS (up to 6 text parts, 918 characters). It is recorded in the customer's inbox
// conversation (created if there is none), so replies arrive in the same thread.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid message");

  const limit = await checkRateLimitShared(rateLimitKey("customer-message", store.id), { maxRequests: 30, windowMs: 10 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "You've sent a lot of messages in a short time. Wait a few minutes and try again.", 429);

  const input = parsed.data;
  try {
    const result = await messageCustomer(
      store.id,
      input.key,
      input.channel === "email"
        ? { channel: "email", subject: input.subject ?? null, body: input.body }
        : input.channel === "whatsapp"
          ? { channel: "whatsapp", body: input.body }
          : input.channel === "sms"
            ? { channel: "sms", body: input.body }
          : { channel: "whatsapp", templateId: input.templateId, params: input.params ?? null },
      user.name ?? "You",
    );
    if (!result.ok) {
      if (!result.message) return apiError("NOT_FOUND", result.error, 404);
      // A failed send is still saved in the inbox (marked failed) so the seller can see it there.
      return apiError("SEND_FAILED", result.error, 502);
    }
    return ok({ conversationId: result.conversationId, id: result.message.id, status: result.message.status });
  } catch (error) {
    if (error instanceof CustomerMessageError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});
