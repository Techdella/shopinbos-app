import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { AutomationNotReady, loadAutomation, saveAutomation } from "@/lib/inbox/automation.server";

export const dynamic = "force-dynamic";

// Auto-reply rules and the storefront chatbot settings (InboxAutomation). Shapes are normalised on save.

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await loadAutomation(store.id));
});

const BodySchema = z.object({ autoReply: z.record(z.string(), z.unknown()).optional(), chatbot: z.record(z.string(), z.unknown()).optional() }).strict();

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const raw = await req.json().catch(() => null);
  if (raw && JSON.stringify(raw).length > 60_000) return apiError("BAD_REQUEST", "That's too much text. Shorten some replies or FAQs.");
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid settings");
  try {
    return ok(await saveAutomation(store.id, parsed.data));
  } catch (error) {
    if (error instanceof AutomationNotReady) return apiError("SERVICE_UNAVAILABLE", error.message, 503);
    throw error;
  }
});
