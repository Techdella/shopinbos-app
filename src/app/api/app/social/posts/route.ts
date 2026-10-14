import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { schedulePost, scheduledPosts, socialAccounts } from "@/lib/social/publish.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The post scheduler: GET the connected accounts and posts; POST schedules one (checked in src/lib/social/schedule.ts).
const BODY = z.object({
  platforms: z.array(z.string()).max(2),
  caption: z.string().max(5000),
  imageUrl: z.string().max(2000).nullish(),
  link: z.string().max(2000).nullish(),
  productId: z.string().max(100).nullish(),
  scheduledAt: z.string().max(40),
});

export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const [accounts, posts] = await Promise.all([socialAccounts(store.id), scheduledPosts(store.id)]);
  return ok({ accounts, posts });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BODY.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Check the post and try again.", 422);
  const result = await schedulePost(store.id, parsed.data);
  return result.ok ? created(result.post) : apiError("VALIDATION_ERROR", result.error, 422);
});
