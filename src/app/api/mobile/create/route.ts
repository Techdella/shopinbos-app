import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { CreateInputError, loadCreateContext, resolveIdea, runCreateJob } from "@/lib/create/jobs.server";
import { CREATE_FORMAT_KEYS, CREATE_USAGE_KIND, type CreateFormat } from "@shared/create-with-rex";
import type { RexJobKind } from "@shared/rex-jobs";

const JOB_KIND: Record<CreateFormat, RexJobKind> = { status: "status", reel: "reel_design", post: "post", flyer: "flyer" };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180; // premium flyers come from the image model (high quality), which can take a minute or more

// Create with Rex in the phone app, for every role. POST { format, ideaId?, prompt?, productId? } → { job }: 3
// templated designs (src/lib/create/render.server.tsx) with captions, made now (a few seconds), so the job usually
// comes back "done"; GET /api/mobile/create/[id] reads it again. Metered as one "image" a job (meterAi: the day's
// picture allowance first, then the image credit cost, 5 by default); out of both → 402 AI_CREDITS_NEEDED. If the
// designs can't be made, the credits taken for it go back (refundAi, as a 12-month lot). With `clientKey` (one per
// "Make it" tap, sent again on a retry) it is also a Rex job (src/lib/ai/rex-jobs.server.ts): a retry after the phone
// lost signal gets the same job back without paying again, and 202 { data: { pending, rexJobId } } means Rex is
// still on it.

const Body = z.object({
  format: z.enum(CREATE_FORMAT_KEYS),
  ideaId: z.string().trim().min(1).max(200).optional(),
  prompt: z.string().trim().max(300).optional(),
  productId: z.string().trim().min(1).max(64).optional(),
  clientKey: z.string().max(80).optional(),
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

  const outcome = await runRexJob(
    { user, kind: JOB_KIND[idea.format], clientKey: parsed.data.clientKey, input: { format: idea.format, ideaId: parsed.data.ideaId ?? null, prompt: parsed.data.prompt ?? null, productId: idea.productId ?? null } },
    async (rex) => {
      await rex.charge(CREATE_USAGE_KIND);
      const row = await db.createJob.create({
        data: { userId: user.id, format: idea.format, ideaId: parsed.data.ideaId ?? (idea.id === "prompt" ? null : idea.id), prompt: parsed.data.prompt || null, productId: idea.productId },
      });
      const job = await runCreateJob(row.id, user, context, idea, parsed.data.prompt);
      // No designs: the job fails and its credits go back.
      if (job.status === "failed") throw Object.assign(new Error(job.error ?? "failed"), { job });
      return { job };
    },
  );
  if (outcome.status === "blocked") return outcome.response;
  if (outcome.status === "pending") return ok(rexPendingBody(outcome.jobId), 202);
  if (outcome.status === "failed") {
    const job = (outcome.error as { job?: unknown } | null)?.job;
    if (job) return ok({ job });
    console.error("[create] failed", outcome.error);
    return apiError("UNAVAILABLE", "Rex couldn't make the designs just now. Try again in a moment.", 503);
  }
  return ok({ ...outcome.result, rexJobId: outcome.jobId, resumed: outcome.replayed });
}, ["seller", "supplier", "logistics_partner"]);
