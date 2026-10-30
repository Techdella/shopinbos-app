import { NextRequest, NextResponse } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { listRiderThreads } from "@/lib/logistics/rider-messages.server";
import { totalUnread } from "@shared/logistics-chats";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// The delivery company's chats with its riders, for the Messages list (web /logistics/inbox, the phone's Chats tab)
// and the Today cards (shared/logistics-chats.ts):
//   GET → { data: [{ riderId, name, phone, active, last: { text, mine, createdAt, seen } | null, unread }], meta: { unread } }
// Opening a chat (GET /api/mobile/logistics/riders/<id>/messages) marks the rider's messages read.

export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const riders = await listRiderThreads(partner.id);
  return NextResponse.json({ data: riders, meta: { page: 1, limit: riders.length, total: riders.length, unread: totalUnread(riders) } });
});
