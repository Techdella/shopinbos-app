import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { creditBalance } from "@/lib/ai/credits.server";
import { CreateInputError, loadCreateContext, resolveIdea, runCreateJob } from "@/lib/create/jobs.server";
import { CREATE_FORMAT_KEYS, CREATE_USAGE_KIND } from "@shared/create-with-rex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Create with Rex in the phone app, for every role. POST { format, ideaId?, prompt?, productId? } → { job }: 3
// templated designs (src/lib/create/render.server.tsx) with captions, made now (a few seconds), so the job usually
// comes back "done"; GET /api/mobile/create/[id] reads it again. Metered as one "image" a job (meterAi: the day's
// picture allowance first, then the image credit cost, 5 by default); out of both → 402 AI_CREDITS_NEEDED. If the
// designs can't be made, the credits taken for it go back.

const Body = z.object({
  format: z.enum(CREATE_FORMAT_KEYS),
  ideaId: z.string().trim().min(1).max(200).optional(),
  prompt: z.string().trim().max(300).optional(),
  productId: z.string().trim().min(1).max(64).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick a format: status, reel, post or flyer.");

  const context = await loadCreateContext(user);
  let idea;
  try {
    idea = await resolveIdea(user, context, parsed.data);
  } catch (error) {
    if (error instanceof CreateInputError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }

  const before = await creditBalance(user.id).catch(() => null);
  const limited = await meterAi(user.id, CREATE_USAGE_KIND);
  if (limited) return limited;
  const after = before === null ? null : await creditBalance(user.id).catch(() => null);
  const charged = before !== null && after !== null && after < before ? before - after : 0;

  const row = await db.createJob.create({
    data: { userId: user.id, format: idea.format, ideaId: parsed.data.ideaId ?? (idea.id === "prompt" ? null : idea.id), prompt: parsed.data.prompt || null, productId: idea.productId },
  });
  const job = await runCreateJob(row.id, user, context, idea, parsed.data.prompt);
  if (job.status === "failed" && charged > 0) {
    await db.aiCreditAccount.update({ where: { userId: user.id }, data: { balance: { increment: charged } } }).catch((error) => console.error("[create] refund failed", error));
  }
  return ok({ job });
}, ["seller", "supplier", "logistics_partner"]);
