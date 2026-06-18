import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

const UpsertSchema = z.object({
  role: z.string().optional(),
  eventKey: z.string().min(1),
  category: z.string().min(1),
  inApp: z.boolean().default(true),
  email: z.boolean().default(false),
  sms: z.boolean().default(false),
  whatsapp: z.boolean().default(false),
  push: z.boolean().default(false),
  browser: z.boolean().default(false),
  digestFrequency: z.enum(["immediate", "hourly", "daily", "weekly", "disabled"]).default("immediate"),
});

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const preferences = await db.notificationPreference.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok(preferences);
});

export const PUT = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const preference = await db.notificationPreference.upsert({
    where: {
      userId_eventKey_category: {
        userId: user.id,
        eventKey: parsed.data.eventKey,
        category: parsed.data.category,
      },
    },
    update: {
      inApp: parsed.data.inApp,
      email: parsed.data.email,
      sms: parsed.data.sms,
      whatsapp: parsed.data.whatsapp,
      push: parsed.data.push,
      browser: parsed.data.browser,
      digestFrequency: parsed.data.digestFrequency,
      role: parsed.data.role ?? user.role,
    },
    create: {
      userId: user.id,
      role: parsed.data.role ?? user.role,
      eventKey: parsed.data.eventKey,
      category: parsed.data.category,
      inApp: parsed.data.inApp,
      email: parsed.data.email,
      sms: parsed.data.sms,
      whatsapp: parsed.data.whatsapp,
      push: parsed.data.push,
      browser: parsed.data.browser,
      digestFrequency: parsed.data.digestFrequency,
    },
  });

  return ok(preference, 201);
});

export const DELETE = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return apiError("BAD_REQUEST", "Preference id is required");

  const existing = await db.notificationPreference.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Preference not found", 404);

  await db.notificationPreference.delete({ where: { id } });
  return ok({ success: true });
});
