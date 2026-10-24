import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { updateShopinbos } from "@/lib/status/shopinbos.server";
import { SHOPINBOS_DISMISS } from "@shared/shopinbos-status";
import { withStatusUser } from "../../_shared";

export const dynamic = "force-dynamic";

// POST /api/mobile/status/shopinbos/dismiss { what?: "status" | "start" } → { statusOff, startOff }
// "Don't show again" on Shopinbos's statuses (what: "status", the default), or the X on the Getting started card
// on Home (what: "start"). For good, on the account (User.preferences), so every phone and store build agrees.
const Body = z.object({ what: z.enum(SHOPINBOS_DISMISS).default("status") });

export const POST = withStatusUser(async (req: NextRequest, { user }) => {
  const raw = await req.text().catch(() => "");
  let json: unknown = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return apiError("BAD_REQUEST", "Check the request and try again.");
  }
  const parsed = Body.safeParse(json ?? {});
  if (!parsed.success) return apiError("BAD_REQUEST", "Check the request and try again.");
  return ok(await updateShopinbos(user.id, { off: parsed.data.what }));
});
