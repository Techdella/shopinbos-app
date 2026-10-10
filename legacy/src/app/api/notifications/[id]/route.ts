import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (req: NextRequest, { user, params }: { user: AuthUser; params: any }) => {
  const { id } = await params;
  const notification = await db.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!notification) return apiError("NOT_FOUND", "Notification not found", 404);
  return ok(notification);
});

export const PATCH = withSeller(async (req: NextRequest, { user, params }: { user: AuthUser; params: any }) => {
  const { id } = await params;
  const existing = await db.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Notification not found", 404);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.read === true) {
    data.read = true;
    data.readAt = new Date();
  }

  const updated = await db.notification.update({
    where: { id },
    data,
  });

  return ok(updated);
});

export const DELETE = withSeller(async (req: NextRequest, { user, params }: { user: AuthUser; params: any }) => {
  const { id } = await params;
  const existing = await db.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Notification not found", 404);

  await db.notification.delete({ where: { id } });
  return ok({ success: true });
});
