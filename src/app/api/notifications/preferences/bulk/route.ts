import { NextRequest } from "next/server";
import { z } from "zod";
import { NotificationType, Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

const PreferenceSchema = z.object({
  eventKey: z.string().min(1),
  category: z.enum(NotificationType),
  inApp: z.boolean().default(true),
  email: z.boolean().default(false),
  sms: z.boolean().default(false),
  whatsapp: z.boolean().default(false),
  push: z.boolean().default(false),
  browser: z.boolean().default(false),
  digestFrequency: z.enum(["immediate", "hourly", "daily", "weekly", "disabled"]).default("immediate"),
});

const BulkSchema = z.object({
  preferences: z.array(PreferenceSchema).min(1).max(50),
});

export const PUT = withAuth(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const results = await Promise.all(
    parsed.data.preferences.map((pref) =>
      db.notificationPreference.upsert({
        where: {
          userId_eventKey_category: {
            userId: user.id,
            eventKey: pref.eventKey,
            category: pref.category,
          },
        },
        update: {
          inApp: pref.inApp,
          email: pref.email,
          sms: pref.sms,
          whatsapp: pref.whatsapp,
          push: pref.push,
          browser: pref.browser,
          digestFrequency: pref.digestFrequency,
        },
        create: {
          userId: user.id,
          role: user.role,
          eventKey: pref.eventKey,
          category: pref.category,
          inApp: pref.inApp,
          email: pref.email,
          sms: pref.sms,
          whatsapp: pref.whatsapp,
          push: pref.push,
          browser: pref.browser,
          digestFrequency: pref.digestFrequency,
        },
      })
    )
  );

  return ok(results, 201);
});
