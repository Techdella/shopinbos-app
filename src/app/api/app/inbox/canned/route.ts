import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { sellerStore } from "@/lib/inbox/auth";

export const dynamic = "force-dynamic";

const ReplySchema = z.object({ title: z.string().trim().min(1, "Give it a short name").max(60), body: z.string().trim().min(1, "Write the reply").max(2000) }).strict();

export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await db.inboxCannedReply.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, select: { id: true, title: true, body: true } }));
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = ReplySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid reply");
  if ((await db.inboxCannedReply.count({ where: { storeId: store.id } })) >= 100) return apiError("BAD_REQUEST", "You can keep up to 100 saved replies.");
  const reply = await db.inboxCannedReply.create({ data: { storeId: store.id, ...parsed.data }, select: { id: true, title: true, body: true } });
  return ok(reply);
});
