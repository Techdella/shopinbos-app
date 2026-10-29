import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { shopinbosState } from "@/lib/status/shopinbos.server";
import { withStatusUser } from "../_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/status/shopinbos?lang=yo → { author, statusOff, startOff }: Shopinbos's getting-started posts for
// my role (videos and tips, each with `seen`), even after "Don't show again", for the Getting started card on Home
// and "Getting started videos" in Help. statusOff: the Status ring is switched off; startOff: the Home card is.
export const GET = withStatusUser(async (req: NextRequest, { user }) => {
  return ok(await shopinbosState({ id: user.id, role: user.role }, { lang: req.nextUrl.searchParams.get("lang"), acceptLanguage: req.headers.get("accept-language"), origin: req.nextUrl.origin }));
});
