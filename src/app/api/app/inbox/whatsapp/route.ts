import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { connectWhatsAppEmbedded } from "@/lib/inbox/connect";
import { sendWhatsAppTest, testWhatsAppConnection, whatsappHealth } from "@/lib/inbox/whatsapp-bot.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Peggy on WhatsApp: health for the setup page, finishing Embedded Signup, "Test connection" and a test message
// to the seller's own number. Peggy's WhatsApp settings themselves save with the chatbot (/api/app/inbox/automation).

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await whatsappHealth(store.id));
});

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("embedded_signup"), code: z.string().trim().min(10).max(2000), phoneNumberId: z.string().trim().max(30), wabaId: z.string().trim().max(30) }).strict(),
  z.object({ action: z.literal("test_connection") }).strict(),
  z.object({ action: z.literal("send_test"), to: z.string().trim().min(6).max(30) }).strict(),
]);

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
  const body = parsed.data;

  if (body.action === "embedded_signup") {
    const { action: _action, ...rest } = body;
    const result = await connectWhatsAppEmbedded(store, rest);
    if (!result.ok) return apiError("CONNECT_FAILED", result.error, 422);
    return ok({ view: result.view, health: await whatsappHealth(store.id) });
  }

  if (body.action === "test_connection") {
    const result = await testWhatsAppConnection(store.id);
    if (!result.ok) return apiError("NOT_CONNECTED", result.error, 422);
    return ok({ checks: result.checks, health: await whatsappHealth(store.id) });
  }

  const automation = await loadAutomation(store.id);
  const result = await sendWhatsAppTest(store, body.to, automation.chatbot.name);
  if (!result.ok) return apiError("SEND_FAILED", result.error, 422);
  return ok({ sent: true });
});
