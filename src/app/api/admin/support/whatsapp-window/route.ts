import { withAdmin } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { whatsappWindowFor } from "@/lib/support/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/support/whatsapp-window?phone=: { open, number } — can the team write freely to this number
// (they messaged in the last 24 hours), and which conversation it joins.
export const GET = withAdmin(async (req) => ok(await whatsappWindowFor(req.nextUrl.searchParams.get("phone") ?? "")));
