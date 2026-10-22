import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { jobView } from "@/lib/create/jobs.server";
import { accountsFor, postView } from "@/lib/create/posts.server";
import { POST_PLATFORM_KEYS, cleanPlatforms, parseDesignId, postStatusFor } from "@shared/create-with-rex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The posts calendar in the phone app, for every role. Nothing is posted for anyone: "Share now" opens the phone's
// share sheet, and a scheduled post gets one "Time to post" reminder at its time (src/app/api/cron/post-reminders).
//   GET ?from=ISO&to=ISO → { posts, accounts } (posts scheduled in the range, plus drafts with no time)
//   POST { designId?, imageUrl?, caption, platforms, scheduledAt? } → { post }

const DAY = 86_400_000;
const MAX_POSTS = 300;
const ROLES = ["seller", "supplier", "logistics_partner"] as const;

function readDate(value: string | null, fallback: Date) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : fallback;
}

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const now = Date.now();
  const from = readDate(req.nextUrl.searchParams.get("from"), new Date(now - 7 * DAY));
  const to = readDate(req.nextUrl.searchParams.get("to"), new Date(now + 31 * DAY));
  if (to.getTime() < from.getTime() || to.getTime() - from.getTime() > 400 * DAY) return apiError("BAD_REQUEST", "Pick a range of up to a year.");
  const [rows, accounts] = await Promise.all([
    db.scheduledPost.findMany({
      where: { userId: user.id, OR: [{ scheduledAt: { gte: from, lte: to } }, { scheduledAt: null, status: "draft" }] },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: MAX_POSTS,
    }),
    accountsFor(user),
  ]);
  return ok({ posts: rows.map(postView), accounts });
}, [...ROLES]);

const Body = z.object({
  designId: z.string().trim().max(80).optional(),
  imageUrl: z.string().trim().url().max(2000).regex(/^https:\/\//, "Use an https picture link").optional(),
  caption: z.string().trim().max(2200).optional(),
  platforms: z.array(z.enum(POST_PLATFORM_KEYS)).max(POST_PLATFORM_KEYS.length).default([]),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Add a caption and pick where to post.");
  const input = parsed.data;

  // A design from one of the person's own Create with Rex jobs brings its picture and caption.
  let imageUrl = input.imageUrl ?? null;
  let caption = input.caption ?? "";
  if (input.designId) {
    const ref = parseDesignId(input.designId);
    const job = ref ? await db.createJob.findFirst({ where: { id: ref.jobId, userId: user.id } }) : null;
    const design = job ? jobView(job).designs.find((item) => item.id === input.designId) : null;
    if (!design) return apiError("NOT_FOUND", "That design wasn't found.", 404);
    imageUrl = design.imageUrl;
    caption = caption || design.caption;
  }
  if (!caption.trim() && !imageUrl) return apiError("BAD_REQUEST", "Add a caption or a design.");

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() < Date.now() - 5 * 60_000) return apiError("BAD_REQUEST", "Pick a time that hasn't passed.");
  const count = await db.scheduledPost.count({ where: { userId: user.id, status: { not: "posted" } } });
  if (count >= 500) return apiError("BAD_REQUEST", "You have a lot of posts waiting. Delete some old drafts first.");

  const row = await db.scheduledPost.create({
    data: {
      userId: user.id,
      designId: input.designId ?? null,
      imageUrl,
      caption: caption.trim(),
      platforms: cleanPlatforms(input.platforms),
      status: postStatusFor({ scheduledAt }),
      scheduledAt,
    },
  });
  return ok({ post: postView(row) }, 201);
}, [...ROLES]);
