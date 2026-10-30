import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { aiConfigured } from "@/lib/ai/client";
import { aiText } from "@/lib/ai/text";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { db } from "@/lib/db/client";
import { overLimit, readJson, writerLanguage } from "../../banner/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/mobile/onboarding/about { started, different, round, language?, clientKey } → { story }
// "Tell me about your business." (design RB-12): Rex writes the About story from the seller's two answers (typed or
// spoken), in the phone's language; "Rewrite it" asks again with the next round. A Rex job (kind store_words): one
// text use, kept if the seller leaves the screen, never charged twice for the same tap. The phone falls back to the
// seller's own words when Rex can't write (shared/seller-onboarding.ts plainAboutStory).
const Body = z.object({
  started: z.string().trim().max(300).default(""),
  different: z.string().trim().max(500).default(""),
  round: z.number().int().min(1).max(20).default(1),
  language: z.string().max(8).optional(),
  clientKey: z.string().max(80).optional(),
});

const SYSTEM = `You write the "About us" story for a small African online shop, in the seller's own voice and in the language asked for.
Two to four short sentences, warm and specific, using only the facts the seller gave. Never invent awards, numbers, years, places, customer counts or promises.
Write only the story: no title, no quotes around it, no emojis, no Markdown. Do not mention AI, Rex or Shopinbos.`;

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const input = await readJson(req, Body);
  if (input instanceof NextResponse) return input;
  if (!input.started && !input.different) return apiError("BAD_REQUEST", "Tell Rex a little about your business first.", 400);
  if (!aiConfigured()) return apiError("AI_OFF", "Rex isn't switched on yet.", 503);
  const limited = await overLimit("mobile-onboarding-about", user.id, 20);
  if (limited) return limited;

  const job = await runRexJob({ user, kind: "store_words", clientKey: input.clientKey, input: { started: input.started, different: input.different, round: input.round } }, async (rex) => {
    const credits = await rex.charge("text", 1);
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true } });
    const prompt = [
      `Shop name: ${store?.name ?? "the shop"}`,
      `Owner: ${user.name || "the owner"}`,
      `When and where it started: ${input.started || "(not given)"}`,
      `What makes it different: ${input.different || "(not given)"}`,
      `Language: ${writerLanguage(input.language)}`,
      input.round > 1 ? `This is rewrite number ${input.round}: write it differently from before (another opening, another rhythm).` : "",
    ].filter(Boolean).join("\n");
    const result = await aiText({ system: SYSTEM, prompt, fast: true, maxTokens: 800 });
    const story = (result?.text ?? "").replace(/^["“]|["”]$/g, "").trim().slice(0, 1200);
    if (!story) {
      await rex.refund("text", 1, credits);
      throw new Error("Rex couldn't write the story just now.");
    }
    return { story };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  if (job.status === "failed") return apiError("UNAVAILABLE", "Rex couldn't write the story just now. Try again in a moment.", 503);
  return ok({ ...job.result, rexJobId: job.jobId, resumed: job.replayed });
});
