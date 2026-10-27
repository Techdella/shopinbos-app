// Weekly updates from the Shopinbos team (WeeklyUpdate, /admin/updates, the ring in the top bar) and the narrator and
// music in the 60-second intros (useIntroSound, /api/learn/narration).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const updates = await import("../shared/weekly-updates.ts");
const narration = await import("../shared/intro-narration.ts");
const intros = await import("../shared/feature-intros.ts");

test("updates: status follows published, start and end", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  assert.equal(updates.updateStatus({ published: false, publishAt: null, expiresAt: null }, now), "draft");
  assert.equal(updates.updateStatus({ published: true, publishAt: null, expiresAt: null }, now), "live");
  assert.equal(updates.updateStatus({ published: true, publishAt: "2026-10-27T07:00:00Z", expiresAt: null }, now), "scheduled");
  assert.equal(updates.updateStatus({ published: true, publishAt: "2026-10-19T07:00:00Z", expiresAt: "2026-10-26T07:00:00Z" }, now), "ended");
  assert.equal(updates.updateStatus({ published: true, publishAt: "2026-10-19T07:00:00Z", expiresAt: "2026-11-02T07:00:00Z" }, now), "live");
});

test("updates: new ones default to next Monday 8am Lagos", () => {
  const friday = new Date("2026-10-23T15:00:00Z");
  assert.equal(updates.nextMondayMorning(friday).toISOString(), "2026-10-26T07:00:00.000Z");
  const monday = new Date("2026-10-26T09:00:00Z");
  assert.equal(updates.nextMondayMorning(monday).toISOString(), "2026-11-02T07:00:00.000Z", "a Monday rolls to the next week");
});

test("updates: button links stay in the app or on https", () => {
  assert.equal(updates.safeCtaUrl("/home/ads"), "/home/ads");
  assert.equal(updates.safeCtaUrl("https://shopinbos.com/blog"), "https://shopinbos.com/blog");
  for (const bad of ["javascript:alert(1)", "//evil.com", "http://shopinbos.com", "https://a:b@evil.com", "data:text/html,hi", ""]) assert.equal(updates.safeCtaUrl(bad), null, bad);
});

test("updates: uploads are checked by type and size, and only our own folder counts", () => {
  assert.equal(updates.updateUploadProblem("image", "image/png", 1000), null);
  assert.equal(updates.updateUploadProblem("image", "image/gif", 1000), null);
  assert.match(updates.updateUploadProblem("image", "image/svg+xml", 1000), /JPG/);
  assert.match(updates.updateUploadProblem("image", "image/png", 6 * 1024 * 1024), /5 MB/);
  assert.equal(updates.updateUploadProblem("video", "video/mp4", 10 * 1024 * 1024), null);
  assert.match(updates.updateUploadProblem("video", "video/mp4", 60 * 1024 * 1024), /50 MB/);
  const base = "https://x.supabase.co/storage/v1/object/public/shopinbos-media/";
  assert.equal(updates.isOwnUpdateFile(`${base}platform/updates/images/1.png`, base), true);
  assert.equal(updates.isOwnUpdateFile(`${base}platform/help-videos/1.mp4`, base), false);
  assert.equal(updates.isOwnUpdateFile(`${base}platform/updates/../secret.png`, base), false);
  assert.equal(updates.isOwnUpdateFile("https://evil.com/platform/updates/1.png", base), false);
});

test("updates: slides last long enough to read, and motion lines split", () => {
  assert.equal(updates.slideDurationMs({ kind: "text", body: "Short" }), 6000);
  assert.ok(updates.slideDurationMs({ kind: "text", body: "word ".repeat(200) }) <= 20_000);
  assert.ok(updates.slideDurationMs({ kind: "motion", body: "a b c" }) > updates.slideDurationMs({ kind: "text", body: "a b c" }));
  assert.equal(updates.slideDurationMs({ kind: "video", durationSeconds: 45 }), 45_000);
  assert.deepEqual(updates.motionLines("Post daily\n\none two three four five six seven"), ["Post daily", "one two three four five six", "seven"]);
});

test("updates: wired into the schema, migration, admin, nav, team roles and the top bar", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model WeeklyUpdate \{/);
  assert.match(schema, /model WeeklyUpdateView \{[\s\S]*@@unique\(\[updateId, userId\]\)/);
  const sql = read("docs/migrations/2026-11-26-weekly-updates.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "WeeklyUpdate"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  for (const file of ["src/app/admin/updates/page.tsx", "src/app/api/admin/updates/route.ts", "src/app/api/admin/updates/[id]/route.ts", "src/app/api/admin/updates/upload/route.ts", "src/app/api/updates/route.ts", "src/app/api/updates/[id]/view/route.ts"]) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  for (const file of ["src/app/api/admin/updates/route.ts", "src/app/api/admin/updates/[id]/route.ts", "src/app/api/admin/updates/upload/route.ts"]) assert.match(read(file), /withAdmin\(/, file);
  assert.match(read("src/lib/nav.ts"), /href: "\/admin\/updates"/);
  assert.match(read("src/lib/admin-team/pure.ts"), /updates: "content"/);
  assert.match(read("src/components/shell/GlobalTopBar.tsx"), /<UpdatesRing role=\{role\} \/>/);
  // Views only count for live updates for the person's own role.
  assert.match(read("src/app/api/updates/[id]/view/route.ts"), /liveUpdatesFor\(role, user\.id\)/);
});

test("intro sound: narration text, clip paths and saved settings", () => {
  assert.equal(narration.narrationText({ caption: "Choose who gets it", sub: "Everyone or a segment." }), "Choose who gets it. Everyone or a segment.");
  assert.equal(narration.narrationText({ caption: "Done!", sub: "" }), "Done!");
  const path = narration.narrationPath("segments", 2, "yo", "Ẹ kú àbọ̀");
  assert.match(path, /^platform\/intro-voice\/yo\/segments-2-v\d+-[0-9a-f]{8}\.mp3$/);
  assert.notEqual(path, narration.narrationPath("segments", 2, "yo", "Ẹ kú àbọ̀!"), "changed words get a new clip");
  assert.equal(narration.textHash("abc"), narration.textHash("abc"));
  assert.deepEqual(narration.parseSoundPrefs(null), { voice: true, music: true });
  assert.deepEqual(narration.parseSoundPrefs('{"voice":false}'), { voice: false, music: true });
  assert.deepEqual(narration.parseSoundPrefs("not json"), { voice: true, music: true });
  assert.ok(narration.isNarrationLocale("ig") && !narration.isNarrationLocale("fr"));
});

test("intro sound: browser voices never read a language they don't speak", () => {
  const voices = [{ lang: "en-US", name: "US" }, { lang: "en-GB", name: "UK" }, { lang: "yo-NG", name: "Yoruba" }];
  assert.equal(narration.pickBrowserVoice(voices, "yo-NG")?.name, "Yoruba");
  assert.equal(narration.pickBrowserVoice(voices, "en-NG")?.name, "UK");
  assert.equal(narration.pickBrowserVoice(voices, "ha-NG"), null);
  assert.equal(narration.browserVoiceLang("pcm"), "en-NG");
  assert.equal(narration.browserVoiceLang("ig"), "ig-NG");
});

test("intro sound: only intro scenes can be spoken, and the player waits for the narrator", () => {
  const server = read("src/lib/learn/narration.server.ts");
  assert.match(server, /introByKey\(introKey\)/, "the text is looked up by key, never taken from the request");
  const route = read("src/app/api/learn/narration/route.ts");
  assert.doesNotMatch(route, /params\.get\("text"\)/);
  assert.match(route, /withAuth\(/);
  assert.ok(intros.FEATURE_INTROS.every((intro) => intros.INTRO_KEY_PATTERN.test(intro.key)), "intro keys are safe in storage paths");
  const player = read("src/components/learn/FeatureIntro.tsx");
  assert.match(player, /useIntroSound\(/);
  assert.match(player, /sound\.voiceBusy && elapsed < scene\.durationMs \+ VOICE_GRACE_MS/);
  assert.match(player, /data-intro-sound="voice"/);
  assert.match(player, /data-intro-sound="music"/);
});

test("mobile: the Shopinbos ring leads the Status row on every home, and plays the same feed", () => {
  // One Shopinbos ring: the team's updates join Shopinbos's getting-started ring when it's there (useShopinbosRings),
  // else keep their own ring in `leading`.
  for (const file of ["apps/mobile/src/app/(tabs)/home.tsx", "apps/mobile/src/app/supplier/(tabs)/home.tsx", "apps/mobile/src/app/logistics/(tabs)/jobs.tsx"]) {
    const source = read(file);
    assert.match(source, /useShopinbosRings\(/, file);
    assert.match(source, /leading=\{rings\.leading\}/, file);
    assert.match(source, /authors=\{rings\.authors\}/, file);
  }
  const ring = read("apps/mobile/src/components/updates/TeamUpdatesRing.tsx");
  assert.match(ring, /leading: merged\.merged \? null : <TeamUpdatesRingView/);
  assert.match(read("apps/mobile/src/components/familiar/StatusRow.tsx"), /\{leading\}/);
  const lib = read("apps/mobile/src/lib/updates.ts");
  assert.match(lib, /"\/api\/updates"/);
  assert.match(lib, /\/api\/updates\/\$\{encodeURIComponent\(id\)\}\/view/);
  const viewer = read("apps/mobile/src/components/updates/TeamUpdatesViewer.tsx");
  assert.match(viewer, /slideDurationMs\(update\)/);
  assert.match(viewer, /openPath\(url\)/, "in-app links open the app's own screen when there is one");
});

test("intro music: the Afrobeats tips collection, a different track each intro, on web and phone", () => {
  for (const track of narration.INTRO_TRACKS) assert.ok(existsSync(new URL(`../public${narration.introTrackPath(track.id)}`, import.meta.url)), track.id);
  const ids = narration.INTRO_TRACKS.map((track) => track.id);
  for (const previous of [null, ...ids]) {
    for (const random of [0, 0.3, 0.6, 0.999, 1]) {
      const picked = narration.pickIntroTrack(previous, random);
      assert.ok(ids.includes(picked));
      assert.notEqual(picked, previous, "never the same track twice in a row");
    }
  }
  const web = read("src/components/learn/useIntroSound.ts");
  assert.match(web, /pickIntroTrack\(/);
  assert.match(web, /source\.loop = true/);
  assert.doesNotMatch(web, /renderMusic\(/, "the generated track is gone from the tips");
  assert.match(read("apps/mobile/src/components/learn/useIntroSound.ts"), /createAudioPlayer\(\{ uri: nextTrackUrl\(\) \}\)/);
});

test("mobile: the intro sheet has the narrator and the same music as the web", () => {
  const hook = read("apps/mobile/src/components/learn/useIntroSound.ts");
  assert.match(hook, /\/api\/learn\/narration\?/);
  assert.match(hook, /music\.current\.loop = true/);
  const sheet = read("apps/mobile/src/components/learn/FeatureIntroSheet.tsx");
  assert.match(sheet, /useIntroSound\(/);
  assert.match(sheet, /voiceBusy\.current && next < length \+ VOICE_GRACE_MS/);
  assert.match(sheet, /testID="feature-intro-voice"/);
  assert.match(sheet, /testID="feature-intro-music"/);
});
