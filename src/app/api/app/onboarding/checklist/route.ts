import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { getSellerOnboardingStatus, MANUAL_CHECKLIST_KEYS } from "@/lib/onboarding-status";

export const dynamic = "force-dynamic";

const Body = z.object({ key: z.enum(MANUAL_CHECKLIST_KEYS as [string, ...string[]]), done: z.boolean() });

// Ticks a checklist item the app can't detect on its own (e.g. "Print your first price tags").
export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "That checklist item can't be ticked by hand.");

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const settings = (store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? store.brandSettings : {}) as Record<string, unknown>;
  const setup = (settings.setup && typeof settings.setup === "object" ? settings.setup : {}) as Record<string, unknown>;
  const checklist = (setup.checklist && typeof setup.checklist === "object" ? setup.checklist : {}) as Record<string, unknown>;

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...settings, setup: { ...setup, checklist: { ...checklist, [parsed.data.key]: parsed.data.done } } } as Prisma.InputJsonValue },
  });
  return ok(await getSellerOnboardingStatus(user.id));
});
