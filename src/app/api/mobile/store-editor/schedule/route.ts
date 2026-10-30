import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { cancelScheduledPublish, loadScheduledPublish, schedulePublish, ScheduleError } from "@/lib/store-editor/scheduled-publish.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Schedule for later" on the phone's Publish sheet (design SE-13; rules in shared/store-editor.ts, the job in
// src/lib/store-editor/scheduled-publish.server.ts):
//   GET    → { scheduled: { id, runAt, status, draftVersion, draftChanged } | null }   (the editor's top bar, Shop tab)
//   POST   { at: ISO time, version } → { scheduled }   The draft as saved now (version: the save stamp the phone
//          saw; 409 when it changed on another device) goes live at `at`. Again: reschedules (replaces it).
//   DELETE → { cancelled: boolean }
// Owners and their staff (withSeller acts as the owner for staff), like the rest of the editor.

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);
  return ok({ scheduled: await loadScheduledPublish(store.id, store.brandSettings) });
});

const Body = z.object({
  at: z.string().datetime({ offset: true }),
  version: z.string().max(80).nullable().optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick a day and a time.", 400);
  try {
    const scheduled = await schedulePublish({ userId: user.id, at: new Date(parsed.data.at), version: parsed.data.version ?? null });
    return ok({ scheduled });
  } catch (error) {
    if (error instanceof ScheduleError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});

export const DELETE = withSeller(async (_req: NextRequest, { user }) => {
  return ok({ cancelled: await cancelScheduledPublish(user.id) });
});
