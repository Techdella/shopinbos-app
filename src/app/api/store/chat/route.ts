import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { LiveChatConfigCreateSchema, LiveChatConfigUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

const DEFAULT_CHAT_CONFIG = {
  mode: "contact_form",
  whatsappNumber: null,
  whatsappGreeting: "Hello! How can we help you today?",
  whatsappPosition: "right",
  whatsappColor: "#25D366",
  showOnMobile: true,
  showOnDesktop: true,
  businessHours: {},
  contactEmail: null,
  contactPhone: null,
  customLink: null,
  widgetStyle: "bubble",
  greeting: "Hi there! Need help?",
};

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const config = await db.liveChatConfig.findUnique({
    where: { storeId: store.id },
  });

  return ok(config ?? { storeId: store.id, ...DEFAULT_CHAT_CONFIG });
});

export const PUT = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(LiveChatConfigUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const config = await db.liveChatConfig.upsert({
    where: { storeId: store.id },
    create: {
      storeId: store.id,
      ...DEFAULT_CHAT_CONFIG,
      ...parsed.data,
    } as any,
    update: parsed.data,
  });

  return ok(config);
});
