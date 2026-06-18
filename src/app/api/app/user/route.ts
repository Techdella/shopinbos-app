import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";

export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, city: true, country: true, role: true, avatarUrl: true },
  });
  if (!u) return apiError("NOT_FOUND", "User not found", 404);
  return ok(u);
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const allowed = ["name", "phone", "city", "country", "avatarUrl"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body && typeof body[key] === "string") {
      update[key] = (body[key] as string).trim();
    }
  }
  if (Object.keys(update).length === 0) return apiError("BAD_REQUEST", "No valid fields to update");
  const updated = await db.user.update({
    where: { id: user.id },
    data: update,
    select: { id: true, name: true, city: true, country: true },
  });
  return ok(updated);
});
