// Social posts (Marketing > Social posts): the sizes each channel wants, the calendar in Lagos time, the queue's
// next free slot, what blocks a post, the status from each channel's result, and the routes and cron around it.
// Pure TypeScript (src/lib/social-posts/pure.ts), Node strips the types natively; plus source checks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sp = await import("../src/lib/social-posts/pure.ts");
const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");

test("each size has its real pixels and ratio", () => {
  assert.deepEqual(sp.POST_FORMATS.portrait, { width: 1080, height: 1350, ratio: "4:5" });
  assert.deepEqual(sp.POST_FORMATS.story, { width: 1080, height: 1920, ratio: "9:16" });
  assert.equal(sp.formatSize("square"), "1080 × 1080");
  assert.equal(sp.formatForShape(1024, 1792), "story");
  assert.equal(sp.formatForShape(1080, 1300), "portrait");
  assert.equal(sp.formatForShape(1792, 1024), "landscape");
  assert.equal(sp.formatForShape(1024, 1024), "square");
  assert.equal(sp.formatForShape(null, 10), null);
});

test("the recommended size suits every picked channel", () => {
  assert.equal(sp.recommendFormat([]), "square");
  assert.equal(sp.recommendFormat(["instagram"]), "portrait");
  assert.equal(sp.recommendFormat(["instagram", "facebook"]), "square");
  assert.equal(sp.recommendFormat(["tiktok"]), "story");
  assert.equal(sp.recommendFormat(["instagram", "tiktok"]), "story", "TikTok only takes 9:16, Instagram shows it as a story");
  assert.equal(sp.recommendFormat(["whatsapp", "x"]), "square");
  assert.equal(sp.recommendFormat(["x"]), "landscape");
});

test("Instagram: 9:16 pictures are stories, videos are reels", () => {
  assert.equal(sp.instagramKind("story", "image"), "story");
  assert.equal(sp.instagramKind("portrait", "image"), "feed");
  assert.equal(sp.instagramKind("square", "video"), "reel");
});

test("problems: missing media, long captions, sizes, WebM and unconnected accounts", () => {
  const base = { caption: "Hello", format: "square", mediaUrl: null, mediaKind: null };
  const kinds = (draft, connected) => sp.postProblems({ ...base, ...draft }, connected).map((p) => `${p.channel}:${p.kind}`);
  assert.deepEqual(kinds({ channels: ["instagram", "facebook"] }), ["instagram:needs_media"]);
  assert.deepEqual(kinds({ channels: ["x"], caption: "a".repeat(270), linkLength: 60 }), ["x:too_long"], "X counts the link as 23");
  assert.deepEqual(kinds({ channels: ["x"], caption: "a".repeat(250), linkLength: 60 }), []);
  assert.deepEqual(kinds({ channels: ["tiktok"], mediaUrl: "https://x/p.jpg", mediaKind: "image" }), ["tiktok:size"]);
  assert.deepEqual(kinds({ channels: ["facebook"], mediaUrl: "https://x/r.webm", mediaKind: "video", format: "story" }), ["facebook:video_type"]);
  assert.deepEqual(kinds({ channels: ["facebook", "whatsapp"] }, { facebook: false }), ["facebook:not_connected"]);
  const all = sp.postProblems({ ...base, channels: ["tiktok"], mediaUrl: "https://x/p.jpg", mediaKind: "image" });
  assert.deepEqual(sp.blockingProblems(all), [], "a size is advice, not a blocker");
});

test("the post's status follows its channels' results", () => {
  const at = "2026-10-21T08:00:00.000Z";
  assert.equal(sp.statusFromResults([], {}), "draft");
  assert.equal(sp.statusFromResults(["facebook"], {}), "publishing");
  assert.equal(sp.statusFromResults(["instagram"], { instagram: { status: "waiting", container: "1", at } }), "publishing");
  assert.equal(sp.statusFromResults(["facebook", "whatsapp"], { facebook: { status: "posted", at }, whatsapp: { status: "ready", at } }), "posted");
  assert.equal(sp.statusFromResults(["facebook", "instagram"], { facebook: { status: "posted", at }, instagram: { status: "failed", error: "x", at } }), "partial");
  assert.equal(sp.statusFromResults(["facebook"], { facebook: { status: "failed", error: "x", at } }), "failed");
  assert.deepEqual(sp.readyToShare(["facebook", "whatsapp", "x"], { whatsapp: { status: "ready", at }, x: { status: "shared", at } }), ["whatsapp"]);
  // Stored JSON is read defensively.
  assert.deepEqual(sp.readResults({ facebook: { status: "posted", id: "1_2", at }, bogus: { status: "posted" }, x: { status: "nope" }, instagram: { status: "waiting" } }), { facebook: { status: "posted", id: "1_2", at } });
  assert.deepEqual(sp.readResults(null), {});
});

test("Lagos time: UTC+1 all year, and impossible days are refused", () => {
  const moment = sp.fromLagos("2026-10-21", "09:30");
  assert.equal(moment.toISOString(), "2026-10-21T08:30:00.000Z");
  assert.equal(sp.lagosDayKey(new Date("2026-10-20T23:30:00Z")), "2026-10-21", "half past midnight in Lagos is the next day");
  assert.equal(sp.lagosTime(new Date("2026-10-20T23:30:00Z")), "00:30");
  assert.equal(sp.fromLagos("2026-02-31", "09:00"), null);
  assert.equal(sp.fromLagos("2026-10-21", "25:00"), null);
  assert.equal(sp.isDayKey("2026-13-01"), false);
  assert.deepEqual(sp.parseMonth("2026-11", new Date()), { year: 2026, month: 11 });
  assert.deepEqual(sp.parseMonth("junk", new Date("2026-12-31T23:30:00Z")), { year: 2027, month: 1 });
});

test("the month grid starts on Monday and covers whole weeks", () => {
  const grid = sp.monthGrid(2026, 10);
  // 1 October 2026 is a Thursday.
  assert.equal(grid.weeks[0][0].key, "2026-09-28");
  assert.equal(grid.weeks[0][3].key, "2026-10-01");
  assert.ok(grid.weeks.every((week) => week.length === 7));
  assert.equal(grid.weeks.flat().filter((cell) => cell.inMonth).length, 31);
  assert.equal(grid.prev, "2026-09");
  assert.equal(grid.next, "2026-11");
  assert.equal(sp.monthGrid(2026, 12).next, "2027-01");
  assert.equal(grid.start.toISOString(), "2026-09-27T23:00:00.000Z");
});

test("Add to queue picks the next free good time", () => {
  const now = new Date("2026-10-21T06:00:00Z"); // 07:00 in Lagos
  assert.equal(sp.nextQueueSlot([], now).toISOString(), "2026-10-21T07:00:00.000Z", "08:00 Lagos");
  const taken = [new Date("2026-10-21T07:00:00Z"), new Date("2026-10-21T12:10:00Z")];
  assert.equal(sp.nextQueueSlot(taken, now).toISOString(), "2026-10-21T18:30:00.000Z", "13:00 is near a post, so 19:30");
  assert.equal(sp.nextQueueSlot([], new Date("2026-10-21T06:55:00Z")).toISOString(), "2026-10-21T12:00:00.000Z", "at least 10 minutes away");
});

test("routes, cron, schedule and migration are wired", () => {
  const cron = read("src/app/api/cron/social-posts/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/);
  assert.match(cron, /publishDue\(new Date\(\)\)/);
  assert.match(read("scripts/qstash-schedules.mjs"), /\{ id: "social-posts", path: "\/api\/cron\/social-posts", cron: "\*\/5 \* \* \* \*" \}/);
  assert.match(read("prisma/schema.prisma"), /model SocialPost \{[\s\S]*@@index\(\[status, scheduledAt\]\)/);
  const migration = read("docs/migrations/2026-11-16-social-posts.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "SocialPost"/);
  assert.match(migration, /ALTER TABLE "SocialPost" ENABLE ROW LEVEL SECURITY;/);
  // Due posts are claimed before posting, so two runs never post twice.
  assert.match(read("src/lib/social-posts/server.ts"), /updateMany\(\{ where: \{ id, status: "scheduled" \}, data: \{ status: "publishing" \} \}\)/);
  // Posting needs the publish permissions in the Facebook sign-in.
  const sc = read("src/lib/sales-channels/pure.ts");
  assert.match(sc, /"pages_manage_posts"/);
  assert.match(sc, /"instagram_content_publish"/);
  for (const route of ["src/app/api/app/social-posts/route.ts", "src/app/api/app/social-posts/[id]/route.ts"]) assert.match(read(route), /withSeller\(/);
});

test("Social posts is under Marketing; Sell everywhere is the marketplaces, coming soon", () => {
  const nav = read("src/lib/nav.ts");
  assert.match(nav, /id: "social-posts", label: "Social posts", icon: "calendar", href: "\/home\/marketing\/social"/);
  assert.match(nav, /id: "sell-everywhere", label: "Sell everywhere", icon: "globe", href: "\/channels"/);
  const page = read("src/app/channels/page.tsx");
  assert.match(page, /MARKETPLACE_PLATFORMS\.map/);
  assert.match(page, /redirect\(`\/home\/marketing\/social\/new/, "old Post & share links go to the composer");
  assert.match(read("src/components/builder/rex/RexImageActions.tsx"), /\/home\/marketing\/social\/new\?image=/);
});

test("an Instagram reel goes up as soon as Instagram has it ready while the post page is open", () => {
  const at = "2026-10-22T16:00:40.000Z";
  // The processing start is kept across checks, for the page's timer.
  assert.deepEqual(sp.readResults({ instagram: { status: "waiting", container: "c1", at, since: "2026-10-22T16:00:33.000Z" } }), { instagram: { status: "waiting", container: "c1", at, since: "2026-10-22T16:00:33.000Z" } });
  const server = read("src/lib/social-posts/server.ts");
  assert.match(server, /export async function checkPost\(postId: string/);
  assert.match(server, /status: "publishing", updatedAt: \{ lte: new Date\(now\.getTime\(\) - 2000\) \}/, "several open tabs don't double up");
  assert.match(read("src/app/api/app/social-posts/[id]/route.ts"), /action === "check"[\s\S]*checkPost\(found\.post\.id\)/);
  const live = read("src/app/home/marketing/social/_kit/LiveProgress.tsx");
  assert.match(live, /const CHECK_MS = 3000;/);
  assert.match(live, /JSON\.stringify\(\{ action: "check" \}\)/);
});
