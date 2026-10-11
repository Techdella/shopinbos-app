import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { answerPeggy } from "@/lib/ai/seller-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ message: z.string().trim().min(1).max(2000) });

// "Ask Peggy about your shop" for the mobile app (the web uses the askPeggy server action; same answer).
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Ask Peggy a question.");
  const result = await answerPeggy(user.id, parsed.data.message);
  if (result.error || !result.text) return apiError("UNAVAILABLE", result.error ?? "Peggy couldn't answer just now.", 503);
  return ok({ text: result.text });
});
