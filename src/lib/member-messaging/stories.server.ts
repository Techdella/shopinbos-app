import "server-only";

import { db } from "@/lib/db/client";
import { logDataAccess } from "@/lib/admin/data-access.server";
import { CONSENT_VERSION, checkStory, consentText, storyForReader, storyWeek, type StoryInput, type StoryRole } from "@shared/member-stories";

// Member stories (shared/member-stories.ts has the rules and the consent wording): members share and withdraw their
// own; the team approves; the weekly tip emails show one approved story for the reader's role, and the video tips a
// Rex video (a member's, shared with consent; else the reader's own; else the team's sample).

const SAMPLE_SETTING = "member.tips.videoSample";

export async function myStory(userId: string) {
  return db.memberStory.findUnique({ where: { userId } }).catch(() => null);
}

/** The member's Rex videos that can be shown (a finished video with a cover picture), newest first. */
export async function myRexVideos(userId: string) {
  return db.videoProject
    .findMany({ where: { userId, videoUrl: { not: null }, posterUrl: { not: null } }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, title: true, videoUrl: true, posterUrl: true } })
    .catch(() => []);
}

/** Saves the member's story with their consent; a new version goes back for review. */
export async function saveStory(user: { id: string; role: string }, input: StoryInput & { videoProjectId?: string | null; language?: string }) {
  const role = user.role as StoryRole;
  const checked = checkStory(input);
  if (!checked.ok) return checked;
  let video: { id: string; videoUrl: string | null; posterUrl: string | null } | null = null;
  if (input.videoProjectId) {
    video = await db.videoProject.findFirst({ where: { id: input.videoProjectId, userId: user.id, videoUrl: { not: null }, posterUrl: { not: null } }, select: { id: true, videoUrl: true, posterUrl: true } });
    if (!video) return { ok: false as const, error: "That video isn't available any more. Pick another one." };
  }
  const data = {
    role,
    ...checked.value,
    videoProjectId: video?.id ?? null,
    videoUrl: video?.videoUrl ?? null,
    posterUrl: video?.posterUrl ?? null,
    language: input.language ?? "en",
    status: "submitted",
    consentVersion: CONSENT_VERSION,
    consentText: consentText(),
    consentAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    withdrawnAt: null,
  };
  await db.memberStory.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  return { ok: true as const };
}

/** The member takes their story back: it stops appearing at once. */
export async function withdrawStory(userId: string) {
  await db.memberStory.updateMany({ where: { userId, status: { not: "withdrawn" } }, data: { status: "withdrawn", withdrawnAt: new Date() } });
}

/** The member deletes it altogether. */
export async function deleteStory(userId: string) {
  await db.memberStory.deleteMany({ where: { userId } });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function storiesForReview(status?: string) {
  return db.memberStory.findMany({ where: status ? { status } : {}, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 200 });
}

export async function storyCounts() {
  const rows = await db.memberStory.groupBy({ by: ["status"], _count: { _all: true } }).catch(() => []);
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Record<string, number>;
}

/** Approve or reject a story (logged against the member, like other admin decisions about their data). */
export async function reviewStory(adminId: string, storyId: string, decision: "approved" | "rejected", note?: string | null) {
  const story = await db.memberStory.findUnique({ where: { id: storyId } });
  if (!story || story.status === "withdrawn") return { ok: false as const, error: "This story was withdrawn by the member." };
  await db.memberStory.update({ where: { id: storyId }, data: { status: decision, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note?.trim().slice(0, 300) || null } });
  await logDataAccess({ adminId, subjectUserId: story.userId, action: decision === "approved" ? "approve_story" : "reject_story", reason: "story", note }).catch(() => undefined);
  return { ok: true as const };
}

// ─── In the tip emails ────────────────────────────────────────────────────────

export type TipStory = { id: string; userId: string; role: string; status: string; displayName: string; city: string | null; result: string | null; story: string; videoUrl: string | null; posterUrl: string | null };

/** Every approved story (loaded once per tips run). */
export async function approvedStories(): Promise<TipStory[]> {
  return db.memberStory
    .findMany({ where: { status: "approved" }, select: { id: true, userId: true, role: true, status: true, displayName: true, city: true, result: true, story: true, videoUrl: true, posterUrl: true } })
    .catch(() => []);
}

export function pickStory(stories: readonly TipStory[], role: string, readerId: string, now: Date) {
  return storyForReader(stories, role, readerId, storyWeek(now));
}

export async function markStoryShown(storyId: string) {
  await db.memberStory.update({ where: { id: storyId }, data: { timesShown: { increment: 1 }, lastShownAt: new Date() } }).catch(() => undefined);
}

export type VideoSample = { videoUrl: string; posterUrl: string; caption: string };

export async function videoSample(): Promise<VideoSample | null> {
  const row = await db.platformSetting.findUnique({ where: { key: SAMPLE_SETTING } }).catch(() => null);
  const value = (row?.value ?? {}) as Partial<VideoSample>;
  return value.videoUrl && value.posterUrl ? { videoUrl: value.videoUrl, posterUrl: value.posterUrl, caption: value.caption ?? "" } : null;
}

export async function saveVideoSample(sample: VideoSample | null, userId: string) {
  const value = sample ? { ...sample, updatedBy: userId, updatedAt: new Date().toISOString() } : {};
  await db.platformSetting.upsert({ where: { key: SAMPLE_SETTING }, create: { key: SAMPLE_SETTING, value }, update: { value } });
}

export type VideoPreview = { kind: "member" | "yours" | "sample"; videoUrl: string; posterUrl: string; name?: string | null; caption?: string | null };

/**
 * The Rex video shown in a video tip: another member's (shared with consent, same role, not the reader's), else the
 * reader's own latest, else the team's sample. Null when there's none.
 */
export async function videoPreviewFor(readerId: string, role: string, stories: readonly TipStory[], sample: VideoSample | null, now: Date): Promise<VideoPreview | null> {
  const withVideo = stories.filter((story) => story.videoUrl && story.posterUrl);
  const member = storyForReader(withVideo, role, readerId, storyWeek(now));
  if (member) return { kind: "member", videoUrl: member.videoUrl!, posterUrl: member.posterUrl!, name: member.displayName };
  const own = (await myRexVideos(readerId))[0];
  if (own?.videoUrl && own.posterUrl) return { kind: "yours", videoUrl: own.videoUrl, posterUrl: own.posterUrl, caption: own.title };
  return sample ? { kind: "sample", videoUrl: sample.videoUrl, posterUrl: sample.posterUrl, caption: sample.caption } : null;
}
