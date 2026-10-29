// Video statuses (shared/status-video.ts): a person's short video on a Status post (up to 30 s and 25 MB, uploaded
// straight to Storage with a signed URL), the viewer's timing, the ▶ badge, and Shopinbos's own video statuses
// (public/status-videos/, shared/shopinbos-status.ts) in every role with their words in all five languages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const v = await import("../shared/status-video.ts");
const sib = await import("../shared/shopinbos-status.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const size = (path) => statSync(new URL(`../${path}`, import.meta.url)).size;
const LANGS = ["en", "pcm", "yo", "ha", "ig"];
const catalogs = Object.fromEntries(await Promise.all(LANGS.map(async (lang) => [lang, (await import(`../shared/i18n/messages/m_familiar/${lang}.ts`)).default])));

const opts = { supabaseUrl: "https://abc.supabase.co", bucket: "shopinbos-media", userId: "user1" };
const base = "https://abc.supabase.co/storage/v1/object/public/shopinbos-media/status/user1/";

test("limits: 30 seconds, 25 MB, MP4 or MOV", () => {
  assert.equal(v.STATUS_VIDEO_MAX_MS, 30_000);
  assert.equal(v.STATUS_VIDEO_MAX_BYTES, 25 * 1024 * 1024);
  assert.equal(v.statusVideoProblem({ type: "video/mp4", size: 5_000_000, durationMs: 12_000 }), null);
  assert.equal(v.statusVideoProblem({ type: "video/quicktime", size: 5_000_000, durationMs: 30_400 }), null, "a picker's rounding is fine");
  assert.equal(v.statusVideoProblem({ type: "video/mp4", size: 5_000_000, durationMs: 45_000 }), "too_long");
  assert.equal(v.statusVideoProblem({ type: "video/mp4", size: 26 * 1024 * 1024, durationMs: 10_000 }), "too_big");
  assert.equal(v.statusVideoProblem({ type: "video/mp4", size: 0 }), "empty");
  assert.equal(v.statusVideoProblem({ type: "video/webm", size: 10 }), "type");
  assert.equal(v.statusVideoProblem({ type: "text/html", size: 10 }), "type");
  assert.equal(v.statusVideoProblem({ type: "video/mp4; codecs=avc1", size: null, durationMs: null }), null, "unknown size and length are checked later");
  assert.equal(v.statusPosterProblem({ type: "image/jpeg", size: 80_000 }), null);
  assert.equal(v.statusPosterProblem({ type: "image/jpeg", size: 3 * 1024 * 1024 }), "too_big");
  assert.equal(v.statusPosterProblem({ type: "image/svg+xml", size: 10 }), "type");
  assert.equal(v.cleanDurationMs(12_345.6), 12_346);
  assert.equal(v.cleanDurationMs(90_000), 31_000, "capped");
  assert.equal(v.cleanDurationMs(-1), null);
  assert.equal(v.cleanDurationMs("x"), null);
  assert.equal(v.pickerDurationMs(12_000), 12_000, "milliseconds");
  assert.equal(v.pickerDurationMs(12.5), 12_500, "seconds on some Android builds");
  assert.equal(v.pickerDurationMs(null), null);
  assert.equal(v.clockLabel(12_400), "0:12");
  assert.equal(v.clockLabel(65_000), "1:05");
});

test("paths and URLs: only this author's status folder, a video or a -poster picture", () => {
  assert.equal(v.statusVideoPath("user1", "video", "video/mp4", "abcdef0123456789", 5), "status/user1/5-abcdef0123456789.mp4");
  assert.equal(v.statusVideoPath("user1", "video", "video/quicktime", "abcdef0123456789", 5), "status/user1/5-abcdef0123456789.mov");
  assert.equal(v.statusVideoPath("user1", "poster", "image/jpeg", "abcdef0123456789", 5), "status/user1/5-abcdef0123456789-poster.jpg");
  assert.throws(() => v.statusVideoPath("user1", "video", "text/html", "abcdef0123456789"));
  assert.throws(() => v.statusVideoPath("user1", "poster", "video/mp4", "abcdef0123456789"));
  assert.throws(() => v.statusVideoPath("../x", "video", "video/mp4", "abcdef0123456789"));
  assert.throws(() => v.statusVideoPath("user1", "video", "video/mp4", "../../x"));

  const video = `${base}1-abcdef0123.mp4`;
  const poster = `${base}1-abcdef0123-poster.jpg`;
  assert.equal(v.isStatusVideoUrl(video, opts), true);
  assert.equal(v.isStatusVideoUrl(`${base}1-abcdef0123.mov`, { ...opts, kind: "video" }), true);
  assert.equal(v.isStatusVideoUrl(poster, { ...opts, kind: "poster" }), true);
  assert.equal(v.isStatusVideoUrl(poster, opts), false, "a picture isn't a video");
  assert.equal(v.isStatusVideoUrl(video, { ...opts, kind: "poster" }), false, "a video isn't a poster");
  assert.equal(v.isStatusVideoUrl(`${base}1-abcdef0123.jpg`, { ...opts, kind: "poster" }), false, "a status photo isn't a poster");
  assert.equal(v.isStatusVideoUrl(video.replace("user1", "user2"), opts), false, "someone else's video");
  assert.equal(v.isStatusVideoUrl(video.replace("https", "http"), opts), false);
  assert.equal(v.isStatusVideoUrl(video.replace("abc.supabase.co", "evil.example"), opts), false);
  assert.equal(v.isStatusVideoUrl(video.replace("/status/", "/products/"), opts), false);
  assert.equal(v.isStatusVideoUrl(`${video}?x=1`, opts), false);
  assert.equal(v.isStatusVideoUrl(`${video}#x`, opts), false);
  assert.equal(v.isStatusVideoUrl(video.replace(".mp4", ".html"), opts), false);
  assert.equal(v.isStatusVideoUrl(`${base}sub/1-abcdef0123.mp4`, opts), false, "no sub-folders");
  assert.equal(v.isStatusVideoUrl(`${base}..%2F..%2Fuser2%2Fa.mp4`, opts), false);
  assert.equal(v.isStatusVideoUrl("not a url", opts), false);
  assert.equal(v.isStatusVideoUrl(null, opts), false);
  assert.equal(v.isStatusVideoUrl(video, { ...opts, supabaseUrl: undefined }), false);
  assert.equal(v.isStatusVideoUrl(video, { ...opts, userId: "../x" }), false);
  assert.equal(v.isStatusVideoUrl("http://127.0.0.1:54321/storage/v1/object/public/shopinbos-media/status/user1/1-abcdef0123.mp4", { ...opts, supabaseUrl: "http://127.0.0.1:54321" }), true, "local Supabase");
});

test("viewer timing: photos 6 s, videos as long as the video, bars fill 0..1", () => {
  assert.equal(v.STORY_SHOW_MS, 6000);
  assert.equal(v.storyDurationMs({ video: null }), 6000, "a photo or text post");
  assert.equal(v.storyDurationMs({ video: { url: null, durationSeconds: 60 } }), 6000, "an intro that doesn't play here");
  assert.equal(v.storyDurationMs({ video: { url: "https://x/v.mp4", durationSeconds: 10 } }), 10_000, "the saved length");
  assert.equal(v.storyDurationMs({ video: { url: "https://x/v.mp4", durationSeconds: 10 } }, 12.5), 12_500, "the player's own length wins");
  assert.equal(v.storyDurationMs({ video: { url: "https://x/v.mp4" }, durationMs: 21_000 }), 21_000);
  assert.equal(v.storyDurationMs({ video: { url: "https://x/v.mp4" } }, 0), 6000, "nothing known yet");
  assert.equal(v.storyProgress(3000, 6000), 0.5);
  assert.equal(v.storyProgress(-5, 6000), 0);
  assert.equal(v.storyProgress(9000, 6000), 1);
  assert.equal(v.storyProgress(100, 0), 0);
  assert.equal(v.storyTimeUp(5900, 6000), false);
  assert.equal(v.storyTimeUp(6000, 6000), true);
  assert.equal(v.hasPlayableVideo([{ video: null }, { video: { url: "https://x/v.mp4" } }]), true);
  assert.equal(v.hasPlayableVideo([{ video: { url: null, intro: "home" } }, {}]), false);
});

test("Shopinbos's video statuses: two per role, real files, small, with posters and words in five languages", () => {
  let total = 0;
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    const clips = sib.shopinbosPosts(role).filter((post) => post.clip);
    assert.ok(clips.length >= 2 && clips.length <= 3, `${role}: ${clips.length} video statuses`);
    for (const post of clips) {
      assert.match(post.key, /^vid[a-z]+$/);
      assert.ok(sib.parseShopinbosPostId(sib.shopinbosPostId(role, post.key)), `${role}.${post.key}: a valid id`);
      assert.deepEqual(post.cta, { kind: "open", path: sib.VIDEO_STATUS_PATH }, "the button opens the composer on Video");
      const paths = sib.clipPaths(post);
      assert.ok(paths.video.startsWith("/status-videos/") && paths.video.endsWith(".mp4"));
      const mp4 = size(`public${paths.video}`);
      const jpg = size(`public${paths.poster}`);
      assert.ok(mp4 > 50_000 && mp4 <= 3 * 1024 * 1024, `${paths.video}: ${mp4} bytes`);
      assert.ok(jpg > 5_000 && jpg <= 300_000, `${paths.poster}: ${jpg} bytes`);
      assert.ok(post.clip.durationSeconds >= 8 && post.clip.durationSeconds <= 15);
      // MP4 (ftyp box) and JPEG signatures.
      const head = readFileSync(new URL(`../public${paths.video}`, import.meta.url)).subarray(4, 8).toString("ascii");
      assert.equal(head, "ftyp");
      assert.deepEqual([...readFileSync(new URL(`../public${paths.poster}`, import.meta.url)).subarray(0, 3)], [0xff, 0xd8, 0xff]);
      total += mp4 + jpg;
      const keys = sib.shopinbosMessageKeys(role, post.key);
      for (const lang of LANGS) for (const key of [keys.title, keys.body, keys.cta]) assert.ok(catalogs[lang][key], `${lang} ${key}`);
    }
  }
  assert.ok(total < 12 * 1024 * 1024, `all clips together: ${total} bytes`);
  assert.equal(sib.isShopinbosPath("/status/new?kind=video"), true);
  assert.equal(sib.clipPaths({ clip: { file: "../x", durationSeconds: 10 } }), null);
  assert.equal(sib.clipPaths({}), null);
  // The owner's examples are there.
  assert.equal(catalogs.en["sib.seller.vidproduct.title"], "Post a video of your product");
  assert.equal(catalogs.en["sib.seller.vidcustomer.title"], "Show a happy customer");
  assert.equal(catalogs.en["sib.supplier.vidstock.title"], "Show your stock arriving");
  assert.equal(catalogs.en["sib.partner.vidready.title"], "Show your bike or van ready");
});

test("words: the composer and viewer keys in all five languages", () => {
  const keys = ["status.hasVideo", "story.unmute", "story.mute", "story.paused", "sn.photoOrVideo", "sn.mediaPhoto", "sn.mediaVideo", "sn.videoHint", "sn.recordVideo", "sn.pickVideo", "sn.removeVideo", "sn.video", "sn.videoLength", "sn.videoTooLong", "sn.videoTooBig", "sn.videoType", "sn.cameraPermission", "sn.uploading"];
  for (const lang of LANGS) for (const key of keys) assert.ok(catalogs[lang][key], `${lang} ${key}`);
  assert.equal(catalogs.en["sn.videoHint"], "Add a short video (up to 30s)");
  for (const lang of LANGS) assert.match(catalogs[lang]["sn.uploading"], /\{percent\}/, lang);
  for (const lang of LANGS) assert.match(catalogs[lang]["sn.videoLength"], /\{time\}/, lang);
});

test("server: signed upload URL (never the body), checks on posting, files removed with the post, clips served statically", () => {
  const sign = read("src/app/api/mobile/status/upload-url/route.ts");
  assert.match(sign, /withStatusUser\(/);
  assert.match(sign, /signedStatusUpload\(user\.id/);
  assert.doesNotMatch(sign, /formData\(\)/, "no file body through the function");
  const store = read("src/lib/status/status-video.server.ts");
  assert.match(store, /createSignedUploadUrl\(path\)/);
  assert.match(store, /statusVideoPath\(userId/);
  assert.match(store, /content-range/);
  const route = read("src/app/api/mobile/status/route.ts");
  assert.match(route, /isStatusVideoUrl\(videoUrl, \{ \.\.\.where, kind: "video" \}\)/);
  assert.match(route, /isStatusVideoUrl\(posterUrl, \{ \.\.\.where, kind: "poster" \}\)/);
  assert.match(route, /storedStatusFileProblem\(videoUrl, "video"\)/);
  assert.match(route, /Pick a photo or a video, not both/);
  const server = read("src/lib/status/status.server.ts");
  assert.match(server, /videoUrl: true, posterUrl: true, durationMs: true/);
  assert.match(server, /video: rowVideo\(row\)/);
  assert.match(server, /removeFileByPublicUrl\(url\)/);
  assert.match(read("src/app/api/mobile/status/[id]/route.ts"), /post\.videoUrl, post\.posterUrl/);
  assert.match(read("src/lib/status/shopinbos.server.ts"), /clipPaths\(def\)/);
  assert.match(read("src/proxy.ts"), /status-videos\//);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /videoUrl  String\?\n[\s\S]*posterUrl String\?\n[\s\S]*durationMs Int\?/);
  const sql = read("docs/migrations/2026-12-11-status-videos.sql");
  for (const column of ["videoUrl", "posterUrl", "durationMs"]) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
});

test("phone: Photo / Video in the composer, direct upload, viewer muted with sound button, hold to pause, ▶ badge", () => {
  const composer = read("apps/mobile/src/app/status/new.tsx");
  assert.match(composer, /t\("sn\.videoHint"\)/);
  assert.match(composer, /mediaTypes: \["videos"\]/);
  assert.match(composer, /videoMaxDuration: STATUS_VIDEO_MAX_MS \/ 1000/);
  assert.match(composer, /params\.kind === "video"/);
  assert.match(composer, /uploadStatusVideo\(/);
  const upload = read("apps/mobile/src/lib/status-video.ts");
  assert.match(upload, /\/api\/mobile\/status\/upload-url/);
  assert.match(upload, /httpMethod: "PUT"/);
  assert.match(upload, /generateThumbnailsAsync/);
  assert.doesNotMatch(upload, /FormData/);
  const viewer = read("apps/mobile/src/components/familiar/StoryViewer.tsx");
  assert.match(viewer, /useState\(true\)/, "muted by default");
  assert.match(viewer, /created\.loop = false/);
  assert.match(viewer, /created\.muted = muted/);
  assert.match(viewer, /addListener\("timeUpdate"/);
  assert.match(viewer, /storyDurationMs\(/);
  assert.match(viewer, /onLongPress=\{\(\) => setHeld\(true\)\}/);
  assert.match(viewer, /testID="story-sound"/);
  assert.match(viewer, /testID="story-poster"/);
  assert.match(viewer, /playableUrl\(post\?\.video\?\.url\)/, "a person's video plays too, not only Shopinbos's");
  const row = read("apps/mobile/src/components/familiar/StatusRow.tsx");
  assert.match(row, /hasPlayableVideo\(author\.posts\) \? <VideoBadge \/>/);
});
