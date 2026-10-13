import { Prisma } from "@prisma/client";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { toggleableItems, type Role } from "@/lib/nav";
import { mergePreferences, parsePreferences } from "@shared/preferences";
import { PreferencesPatchSchema as PatchSchema } from "@/lib/preferences-schema";
import { localeCookie } from "@/lib/i18n/cookie";

// "Customise your menu", walkthrough progress, the 60-second feature intros already seen and the app language
// (also written to the sib_lang cookie so server-rendered pages use it), for every role.
export const GET = withAuth(async (_req, { user }) => {
  const row = await db.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
  return ok(parsePreferences(row?.preferences));
});

export const PATCH = withAuth(async (req, { user }) => {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Invalid preferences");
  const row = await db.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
  const allowed = new Set(toggleableItems(user.role as Role).map((item) => item.id));
  const next = mergePreferences(parsePreferences(row?.preferences), parsed.data, allowed);
  await db.user.update({ where: { id: user.id }, data: { preferences: next as unknown as Prisma.InputJsonValue } });
  const response = ok(next);
  if (parsed.data.language) response.cookies.set(localeCookie(parsed.data.language));
  return response;
});
