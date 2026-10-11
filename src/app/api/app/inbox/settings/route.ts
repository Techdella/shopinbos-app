import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { sellerStore } from "@/lib/inbox/auth";
import { normalisePhone } from "@/lib/inbox/pure";

export const dynamic = "force-dynamic";

const SettingsSchema = z
  .object({
    autoReplyEnabled: z.boolean(),
    autoReplyMode: z.enum(["message", "peggy"]),
    awayMessage: z.string().trim().max(600),
    forwardCallsTo: z.string().trim().max(30),
  })
  .partial()
  .strict();

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid settings");
  const input = parsed.data;
  if (input.forwardCallsTo && !normalisePhone(input.forwardCallsTo)) return apiError("BAD_REQUEST", "Enter the phone number with its country code, like +2348012345678.");
  const data = {
    ...(input.autoReplyEnabled !== undefined ? { autoReplyEnabled: input.autoReplyEnabled } : {}),
    ...(input.autoReplyMode ? { autoReplyMode: input.autoReplyMode } : {}),
    ...(input.awayMessage !== undefined ? { awayMessage: input.awayMessage || null } : {}),
    ...(input.forwardCallsTo !== undefined ? { forwardCallsTo: normalisePhone(input.forwardCallsTo) } : {}),
  };
  const saved = await db.inboxSettings.upsert({ where: { storeId: store.id }, create: { storeId: store.id, ...data }, update: data });
  return ok({ autoReplyEnabled: saved.autoReplyEnabled, autoReplyMode: saved.autoReplyMode, awayMessage: saved.awayMessage ?? "", forwardCallsTo: saved.forwardCallsTo ?? "" });
});
