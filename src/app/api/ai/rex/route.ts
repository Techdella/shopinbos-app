import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { parseRexBody } from "@/lib/ai/rex/agent-pure";
import { runRex } from "@/lib/ai/rex/agent";
import { isPhoneAppRequest } from "@shared/store-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rex, the seller's studio assistant (Rex Studio chat at /studio). Body: { messages: [{ role, content }] } (the
// whole conversation, newest last) and optional { imageUrls } attached to the newest message (uploaded first).
// Reply: { data: { text, cards, draft, versions } }. Each turn counts as one AI request; the tools meter
// their own pictures and writing on top. From the phone app (x-shopinbos-client: app) Rex follows the app store
// payment rule (shared/store-payments.ts): he never tells the seller to buy credits, plans or themes.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = parseRexBody(await req.json().catch(() => null));
  if (!parsed.ok) return apiError("BAD_REQUEST", parsed.error);

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const result = await runRex(user.id, parsed.turns, parsed.imageUrls, { inApp: isPhoneAppRequest(req.headers) });
  if ("error" in result) return apiError(result.status === 404 ? "NOT_FOUND" : "UNAVAILABLE", result.error, result.status ?? 503);
  return ok(result);
});
