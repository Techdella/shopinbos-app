import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { parsePeggyBody, runPeggy } from "@/lib/ai/peggy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Peggy, the seller's shop assistant, for the web Peggy page and the mobile app (cookie or Bearer auth).
// Body: { messages: [{ role: "user" | "assistant", content }] } (the whole conversation, newest last) or
// { message }. Reply: { data: { text, actions: [{ tool, summary, href? }] } }.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = parsePeggyBody(await req.json().catch(() => null));
  if (!parsed.ok) return apiError("BAD_REQUEST", parsed.error);

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const result = await runPeggy({ id: user.id, phone: user.phone ?? null }, parsed.turns);
  if ("error" in result) return apiError("UNAVAILABLE", result.error, 503);
  return ok({ text: result.text, actions: result.actions });
});
