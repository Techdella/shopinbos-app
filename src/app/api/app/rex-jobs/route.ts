import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { parseRexKinds, REX_JOB_RESUME_WINDOW_MS, rexJobView } from "@shared/rex-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rex jobs (shared/rex-jobs.ts): what Rex made, or is still making, for the signed-in person.
//   GET  ?unseen=1&kind=logo,image&limit=10 → { data: RexJobView[] } newest first (last 3 days; failed jobs only
//        when not seen, so a "couldn't finish" note can be shown once)
//   POST { ids: string[] } (or { all: true, kind? }) → marks them seen (the result is on screen)
// Web and phone call this when a Rex screen opens, to show "Rex finished your logo while you were away" and to
// pick up a job that is still running.

const ROLES = ["seller", "supplier", "logistics_partner"] as const;

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const url = new URL(req.url);
  const kinds = parseRexKinds(url.searchParams.get("kind"));
  const unseen = url.searchParams.get("unseen") === "1";
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  try {
    const rows = await db.rexJob.findMany({
      where: {
        userId: user.id,
        updatedAt: { gte: new Date(Date.now() - REX_JOB_RESUME_WINDOW_MS) },
        ...(kinds.length ? { kind: { in: kinds } } : {}),
        ...(unseen ? { seenAt: null } : {}),
        NOT: { error: "blocked" },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    return ok(rows.map(rexJobView));
  } catch (error) {
    // Before the migration: nothing to resume.
    console.error("[rex-jobs] list failed", error);
    return ok([]);
  }
}, [...ROLES]);

const Seen = z.object({ ids: z.array(z.string().min(1).max(64)).max(50).optional(), all: z.boolean().optional(), kind: z.string().max(200).optional() });

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = Seen.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.ids?.length && !parsed.data.all)) return apiError("BAD_REQUEST", "Say which Rex results you've seen.");
  const kinds = parseRexKinds(parsed.data.kind);
  try {
    const marked = await db.rexJob.updateMany({
      where: {
        userId: user.id,
        seenAt: null,
        status: { in: ["done", "failed"] },
        ...(parsed.data.all ? {} : { id: { in: parsed.data.ids ?? [] } }),
        ...(kinds.length ? { kind: { in: kinds } } : {}),
      },
      data: { seenAt: new Date() },
    });
    return ok({ seen: marked.count });
  } catch (error) {
    console.error("[rex-jobs] mark seen failed", error);
    return ok({ seen: 0 });
  }
}, [...ROLES]);
