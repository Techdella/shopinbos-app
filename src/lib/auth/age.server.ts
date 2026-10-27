import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

/** Keeps when the person first confirmed they're 18 or older (./age.ts); later confirmations don't move it. */
export async function recordAgeConfirmed(userId: string, at = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const preferences = user?.preferences && typeof user.preferences === "object" && !Array.isArray(user.preferences) ? (user.preferences as Record<string, unknown>) : {};
  if (!user || preferences.ageConfirmedAt) return;
  await db.user.update({ where: { id: userId }, data: { preferences: { ...preferences, ageConfirmedAt: at.toISOString() } as Prisma.InputJsonValue } });
}
