import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { peggySettings, savePeggySettings } from "@/lib/support/peggy.server";
import { PEGGY_AUTO_CHANNELS } from "@/lib/support/peggy-pure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/admin/support/peggy: Peggy's inbox settings { autoReply: ["whatsapp" | "email" | "web"] }.
// PUT  /api/admin/support/peggy: same shape. The channels Peggy answers by herself.
export const GET = withAdmin(async () => ok(await peggySettings()));

export const PUT = withAdmin(async (req: NextRequest, { user }) => {
  const parsed = z.object({ autoReply: z.array(z.enum(PEGGY_AUTO_CHANNELS)).max(3) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick channels from WhatsApp, email and website forms.");
  await savePeggySettings(parsed.data, user.id);
  return ok(await peggySettings());
});
