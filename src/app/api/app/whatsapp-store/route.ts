import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { AutomationNotReady, loadAutomation, saveAutomation } from "@/lib/inbox/automation.server";
import { whatsappStoreView } from "@/lib/whatsapp-store/server";

export const dynamic = "force-dynamic";

// The WhatsApp store (Inbox → WhatsApp store): its status, the link to share, and its two switches. It is Peggy on
// WhatsApp with the in-chat cart (chatbot.whatsapp.ordering = "cart"), so switching it on also switches Peggy on.

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await whatsappStoreView(store.id));
});

const BodySchema = z.object({ on: z.boolean().optional(), confirmations: z.boolean().optional() }).strict();

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid settings");
  const { chatbot } = await loadAutomation(store.id);
  const wa = { ...chatbot.whatsapp };
  if (parsed.data.on === true) {
    wa.ordering = "cart";
    wa.productList = true;
    // Test mode (only the seller's own number) stays as it is; off becomes live.
    if (wa.mode === "off") wa.mode = "live";
  } else if (parsed.data.on === false && wa.ordering === "cart") {
    // Peggy keeps answering; "Order on WhatsApp" goes back to a payment link per product.
    wa.ordering = "link";
  }
  if (parsed.data.confirmations !== undefined) wa.confirmations = parsed.data.confirmations;
  try {
    await saveAutomation(store.id, { chatbot: { ...chatbot, whatsapp: wa } });
  } catch (error) {
    if (error instanceof AutomationNotReady) return apiError("SERVICE_UNAVAILABLE", error.message, 503);
    throw error;
  }
  return ok(await whatsappStoreView(store.id));
});
