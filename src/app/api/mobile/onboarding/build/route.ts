import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { buildShopDraft, RexBuildError, saveRexBuild, trackOnboarding } from "@/lib/onboarding/rex-build.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "Watch the magic ✨ Your shop is building" (design RB-14).
//   POST  { clientKey } → { version, pages, done } (202 { pending, rexJobId } while it's still going)
//         Rex applies every answer to the store editor's DRAFT (src/lib/onboarding/rex-build.server.ts
//         buildShopDraft). It runs as a Rex job (kind store_build): leaving the screen or losing signal doesn't lose
//         it, and asking again with the same key gets the same build back. Nothing is charged here: the paid Rex
//         writing (banner lines, the About story) was its own job on the screens before.
//   PATCH { notify: true } → the seller left the screen: Peggy pushes "Your shop is ready" when it's done.
const Body = z.object({ clientKey: z.string().max(80).optional() });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("BAD_REQUEST", "Try building again.", 400);
  const started = Date.now();
  await trackOnboarding(user.id, "build_started", {});
  const job = await runRexJob({ user, kind: "store_build", clientKey: parsed.data.clientKey, input: { onboarding: true } }, async () => {
    const result = await buildShopDraft(user.id);
    await trackOnboarding(user.id, "build_finished", { seconds: Math.round((Date.now() - started) / 1000) });
    return result;
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  if (job.status === "failed") {
    const error = job.error;
    if (error instanceof RexBuildError) return apiError(error.code, error.message, error.status);
    return apiError("UNAVAILABLE", "The build stopped. Nothing is lost: try again.", 503);
  }
  return ok({ ...job.result, rexJobId: job.jobId, resumed: job.replayed });
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { notify?: unknown };
  try {
    await saveRexBuild(user.id, { notifyWhenBuilt: body.notify === true });
    return ok({ notify: body.notify === true });
  } catch (error) {
    if (error instanceof RexBuildError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});
