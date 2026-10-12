import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { listDropship, setDropshipPausedFor } from "@/lib/marketplace/dropship.server";

export const dynamic = "force-dynamic";

// Dropship products for the mobile app (web /home/dropship reads the same list on the server).
// GET → the products; POST { relationshipId, pause } → pause or sell again.

export const GET = withSeller(async (_req: NextRequest, { user }) => ok(await listDropship(user.id)));

const Body = z.object({ relationshipId: z.string().min(1).max(64), pause: z.boolean() });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which product to pause.");
  const status = await setDropshipPausedFor(user.id, parsed.data.relationshipId, parsed.data.pause);
  if (!status) return apiError("NOT_FOUND", "That product couldn't be found.", 404);
  return ok({ status });
});
