// Rex and Peggy (build spec 5.4): one <Mascot> on web and native, moods mapped to stills, reduced motion and
// low-end phones fall back to the still, and only animation files listed in the manifest are ever loaded.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const m = await import("../shared/mascots.ts");

const WEB_COMPONENT = "src/components/brand/Mascot.tsx";
const NATIVE_COMPONENT = "apps/mobile/src/components/Mascot.tsx";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx|jsx|ts)$/.test(name)) out.push(path);
  }
  return out;
}

test("no mascot image is placed directly: every one goes through <Mascot> (emails keep static PNGs)", () => {
  const files = [...walk("src"), ...walk("apps/mobile/src")];
  const allowed = new Set([WEB_COMPONENT, NATIVE_COMPONENT]);
  const isEmail = (file) => /(^|\/)emails?\//.test(file) || /email-templates?/.test(file);
  const offenders = [];
  for (const file of files) {
    if (allowed.has(file) || isEmail(file)) continue;
    const source = readFileSync(file, "utf8");
    const patterns = [
      // <img src="/brand/app/rex.png"> or <Image src="/brand/mascots/peggy-1.png">, in any form
      /<(img|Image)\b[^>]*\/brand\/(app|mascots)\/(rex|peggy)/i,
      // a mascot path in a TSX/JSX file at all (src={...} variables included)
      ...(file.endsWith("x") ? [/["'`]\/brand\/(app|mascots)\/(rex|peggy)[^"'`]*\.png/i] : []),
      // native: require("…/assets/brand/rex.png")
      /require\(\s*["'][^"']*assets\/brand\/(rex|peggy)[^"']*["']\s*\)/,
    ];
    for (const pattern of patterns) if (pattern.test(source)) offenders.push(`${file} (${pattern})`);
  }
  assert.deepEqual(offenders, [], "use <Mascot who mood size /> instead");
});

test("every mood of both mascots maps to a still that exists on web and on mobile", () => {
  for (const who of m.MASCOT_WHO) {
    for (const mood of m.MASCOT_MOODS) {
      const still = m.mascotStill(who, mood);
      assert.ok(m.MASCOT_STILL_NAMES.includes(still), `${who}/${mood} → ${still}`);
      assert.ok(still.startsWith(who), `${who}/${mood} shows ${who}, not the other mascot`);
      assert.ok(existsSync(`public/brand/app/${still}.png`), `web still ${still}.png`);
      assert.ok(existsSync(`apps/mobile/assets/brand/${still}.png`), `mobile still ${still}.png`);
    }
  }
  assert.equal(m.mascotStill("peggy", "wave"), "peggy-wave");
  assert.equal(m.mascotStill("rex", "idle"), "rex");
  assert.equal(m.mascotStill("peggy", "idle"), "peggy");
  // The native component requires every still name, so a new one cannot be forgotten there.
  const native = readFileSync(NATIVE_COMPONENT, "utf8");
  for (const still of m.MASCOT_STILL_NAMES) assert.match(native, new RegExp(`assets/brand/${still}\\.png`), `${still} is bundled on mobile`);
  assert.match(readFileSync(WEB_COMPONENT, "utf8"), /\/brand\/app\/\$\{mascotStill\(who, mood\)\}\.png/);
});

test("celebrate, wave and oops play once; idle and the working moods loop", () => {
  for (const mood of ["celebrate", "wave", "oops"]) assert.equal(m.playsOnce(mood), true, mood);
  for (const mood of ["idle", "thinking", "working", "sleep"]) assert.equal(m.playsOnce(mood), false, mood);
});

test("reduce motion and low-end Android fall back to the still", () => {
  const source = { kind: "lottie", file: "rex-idle.json" };
  assert.equal(m.shouldAnimate(source, { reducedMotion: false }), true);
  assert.equal(m.shouldAnimate(source, { reducedMotion: true }), false, "reduce motion: the still");
  assert.equal(m.shouldMoveStill({ reducedMotion: true }), false, "and the still does not move either");
  assert.equal(m.shouldMoveStill({ reducedMotion: false }), true);
  assert.equal(m.shouldAnimate(source, { reducedMotion: false, lowEndDevice: true }), false, "low-end phone: the still");
  const GB = 1024 ** 3;
  assert.equal(m.isLowEndAndroid("android", 2 * GB), true);
  assert.equal(m.isLowEndAndroid("android", 4 * GB), false);
  assert.equal(m.isLowEndAndroid("ios", 2 * GB), false);
  assert.equal(m.isLowEndAndroid("android", null), false, "unknown memory skips the check");
  assert.equal(m.isLowEndAndroid("web", null), false);

  const web = readFileSync(WEB_COMPONENT, "utf8");
  assert.match(web, /prefers-reduced-motion: reduce/);
  assert.match(web, /shouldAnimate\(source, \{ reducedMotion, size: renderedSize \}\)/);
  assert.match(web, /ResizeObserver/, "web: className-sized mascots are measured for the sticker size gate");
  assert.match(readFileSync("src/components/brand/mascot.css", "utf8"), /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  const native = readFileSync(NATIVE_COMPONENT, "utf8");
  assert.match(native, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(native, /reduceMotionChanged/);
  assert.match(native, /isLowEndAndroid\(Platform\.OS, Device\.totalMemory\)/);
  assert.match(native, /shouldAnimate\(source, \{ reducedMotion, lowEndDevice: LOW_END, size \}\)/);
});

test("the manifest gate: a file that is not listed (or has no renderer) falls back to the still", () => {
  const all = { rive: true, lottie: true };
  assert.equal(m.mascotAnimation("rex", "celebrate", { files: [] }, all), null, "nothing listed: the still");
  assert.equal(m.mascotAnimation("rex", "celebrate", null, all), null, "no manifest: the still");
  assert.equal(m.mascotAnimation("rex", "celebrate", { files: ["peggy-celebrate.json"] }, all), null, "only Peggy's file exists");
  assert.equal(m.mascotAnimation("rex", "oops", { files: ["rex-celebrate.json"] }, all), null, "only another mood exists");
  assert.deepEqual(m.mascotAnimation("rex", "celebrate", { files: ["rex-celebrate.json"] }, all), { kind: "lottie", file: "rex-celebrate.json" });
  assert.deepEqual(m.mascotAnimation("peggy", "wave", { files: ["peggy.riv", "peggy-wave.json"] }, all), { kind: "rive", file: "peggy.riv", stateMachine: "mood" }, "Rive preferred");
  assert.deepEqual(m.mascotAnimation("peggy", "wave", { files: ["peggy.riv", "peggy-wave.json"] }, { lottie: true }), { kind: "lottie", file: "peggy-wave.json" }, "no Rive runtime: Lottie");
  assert.equal(m.mascotAnimation("peggy", "wave", { files: ["peggy.riv"] }, { lottie: true }), null, "no Rive runtime and no Lottie: the still");
  assert.equal(m.shouldAnimate(null, { reducedMotion: false }), false);

  // The manifests exist, list only files that are there, and the components read them (never guess a URL).
  for (const dir of ["public/brand/mascots/anim", "apps/mobile/assets/mascots"]) {
    const manifest = JSON.parse(readFileSync(`${dir}/mascots.json`, "utf8"));
    assert.ok(Array.isArray(manifest.files), `${dir}/mascots.json lists files`);
    for (const file of manifest.files) assert.ok(existsSync(`${dir}/${file}`), `${dir}/${file} exists`);
  }
  const nativeFiles = readFileSync("apps/mobile/assets/mascots/index.ts", "utf8");
  for (const file of JSON.parse(readFileSync("apps/mobile/assets/mascots/mascots.json", "utf8")).files) {
    assert.ok(nativeFiles.includes(`require("./${file}")`), `${file} is bundled on mobile`);
  }
  assert.match(readFileSync(WEB_COMPONENT, "utf8"), /public\/brand\/mascots\/anim\/mascots\.json/);
  assert.match(readFileSync(NATIVE_COMPONENT, "utf8"), /assets\/mascots\/mascots\.json/);
});

test("the old Mascot exports keep working and map onto the shared component", () => {
  const appUi = readFileSync("src/components/app-ui/index.tsx", "utf8");
  assert.match(appUi, /from "@\/components\/brand\/Mascot"/);
  assert.match(appUi, /name === "peggy-wave" \? "wave" : "idle"/);
  const ui = readFileSync("apps/mobile/src/components/ui.tsx", "utf8");
  assert.match(ui, /from "@\/components\/Mascot"/);
  assert.match(ui, /name === "peggyWave" \? "wave" : "idle"/);
});

test("moods follow the spec where the app knows the state", () => {
  const read = (file) => readFileSync(file, "utf8");
  assert.match(read("src/components/auth/app/AppAuth.tsx"), /<MascotVideo clip="peggy-hello"/, "Welcome: Peggy's hello clip (Prototype 10)");
  assert.match(read("src/components/auth/app/AppAuth.tsx"), /<MascotVideo clip="rex-hello"/, "Welcome to Shopinbos: Rex's hello clip");
  assert.match(read("src/components/auth/app/AuthShowcasePanel.tsx"), /mood=\{who === "rex" \? "celebrate" : "wave"\} size=\{150\}/, "the panel's sticker: Rex cheers on sign-up, Peggy waves on sign-in");
  assert.match(read("apps/mobile/src/app/welcome.tsx"), /<MascotVideo clip="peggy-hello"/, "phone welcome: Peggy's hello clip (Prototype 10)");
  assert.match(read("src/components/shell/SupportChatModal.tsx"), /<Mascot name="peggy" mood="wave"/, "Help sheet: Peggy waves");
  assert.match(read("src/app/home/page.tsx"), /mood=\{isPeggyNight\(\) \? "sleep" : "idle"\}/, "night-time Home: Peggy sleeps");
  assert.match(read("apps/mobile/src/app/(tabs)/home.tsx"), /mood=\{isPeggyNight\(\) \? "sleep" : "idle"\}/);
  assert.match(read("src/components/errors/MascotScenes.tsx"), /mood: "oops"/, "error and 404 pages: oops");
  assert.match(read("src/components/builder/BuildProgress.tsx"), /mood=\{hasFailures \? "oops" : summary \? "celebrate" : "working"\}/);
  assert.match(read("src/app/studio/loading.tsx"), /mood="thinking"/);
  // Lagos night is 10pm to 6am (UTC+1).
  assert.equal(m.isPeggyNight(new Date("2026-10-12T21:00:00Z")), true, "10pm Lagos");
  assert.equal(m.isPeggyNight(new Date("2026-10-12T04:59:00Z")), true, "5:59am Lagos");
  assert.equal(m.isPeggyNight(new Date("2026-10-12T05:00:00Z")), false, "6am Lagos");
  assert.equal(m.isPeggyNight(new Date("2026-10-12T12:00:00Z")), false, "1pm Lagos");
});

test("animated WebP stickers: an 'image' kind, only at 96 px and up, never under reduced motion, and they loop", () => {
  const files = { files: ["peggy-wave.webp", "rex-celebrate.webp"] };
  assert.deepEqual(m.mascotAnimation("peggy", "wave", files, { image: true }), { kind: "image", file: "peggy-wave.webp" });
  assert.deepEqual(m.mascotAnimation("rex", "celebrate", files, { image: true, lottie: true }), { kind: "image", file: "rex-celebrate.webp" });
  assert.equal(m.mascotAnimation("rex", "wave", files, { image: true }), null, "no rex-wave.webp: the still");
  assert.equal(m.mascotAnimation("peggy", "wave", files, { lottie: true }), null, "no image renderer: the still");
  assert.deepEqual(m.mascotAnimation("peggy", "wave", { files: ["peggy-wave.json", "peggy-wave.webp"] }, { image: true, lottie: true }), { kind: "lottie", file: "peggy-wave.json" }, "Lottie before WebP");

  const sticker = { kind: "image", file: "peggy-wave.webp" };
  assert.equal(m.MASCOT_IMAGE_MIN_SIZE, 96);
  assert.equal(m.shouldAnimate(sticker, { reducedMotion: false, size: 96 }), true);
  assert.equal(m.shouldAnimate(sticker, { reducedMotion: false, size: 150 }), true);
  assert.equal(m.shouldAnimate(sticker, { reducedMotion: false, size: 56 }), false, "small avatars keep the still");
  assert.equal(m.shouldAnimate(sticker, { reducedMotion: false }), false, "unknown size keeps the still");
  assert.equal(m.shouldAnimate(sticker, { reducedMotion: true, size: 150 }), false, "reduce motion: the still");
  assert.equal(m.shouldAnimate(sticker, { reducedMotion: false, lowEndDevice: true, size: 150 }), false, "low-end phone: the still");
  assert.equal(m.shouldAnimate({ kind: "lottie", file: "rex-idle.json" }, { reducedMotion: false, size: 20 }), true, "the size gate is only for stickers");
  assert.equal(m.loopsForever(sticker), true);
  assert.equal(m.loopsForever({ kind: "lottie", file: "rex-celebrate.json" }), false);
  assert.equal(m.loopsForever(null), false);

  // Both stickers are listed for web and mobile, and the script accepts .webp (and skips the -poster.png files).
  for (const dir of ["public/brand/mascots/anim", "apps/mobile/assets/mascots"]) {
    const listed = JSON.parse(readFileSync(`${dir}/mascots.json`, "utf8")).files;
    assert.ok(listed.includes("peggy-wave.webp") && listed.includes("rex-celebrate.webp"), `${dir} lists the stickers`);
    assert.ok(!listed.some((file) => file.includes("poster")), "posters are not animations");
  }
  assert.match(readFileSync("scripts/mascots-manifest.mjs", "utf8"), /\(json\|webp\)/);

  // Web: the image renderer is on and draws a plain <img>; Lottie stays in its own lazy chunk.
  const web = readFileSync(WEB_COMPONENT, "utf8");
  assert.match(web, /image: true/);
  assert.match(web, /loopsForever\(source\)/);
  const anim = readFileSync("src/components/brand/MascotAnimation.tsx", "utf8");
  assert.match(anim, /source\.kind === "image"/);
  assert.match(anim, /lazy\(\(\) => import\("lottie-react"\)/);
  // Native: expo-image renders the sticker and is registered as the image renderer.
  const native = readFileSync(NATIVE_COMPONENT, "utf8");
  assert.match(native, /\{ image: MascotImage \}/);
  assert.match(native, /loopsForever\(source\)/);
});

test("<MascotVideo>: three studio clips in a fading spotlight, poster first, muted, looped, still under reduced motion", () => {
  assert.deepEqual([...m.MASCOT_CLIPS], ["peggy-hello", "rex-hello", "rex-thumbs"]);
  for (const clip of m.MASCOT_CLIPS) {
    assert.match(m.MASCOT_CLIP_INFO[clip].backdrop, /^#[0-9A-F]{6}$/i, `${clip} backdrop`);
    assert.equal(m.mascotClipLabel(clip), clip.startsWith("peggy") ? "Peggy" : "Rex");
    for (const ext of ["mp4", "webm"]) assert.ok(existsSync(`public/brand/mascots/video/${clip}.${ext}`), `web ${clip}.${ext}`);
    assert.ok(existsSync(`public/brand/mascots/video/${clip}-poster.jpg`), `web ${clip} poster`);
    assert.ok(existsSync(`apps/mobile/assets/mascots/video/${clip}.mp4`), `mobile ${clip}.mp4`);
    assert.ok(existsSync(`apps/mobile/assets/mascots/video/${clip}-poster.jpg`), `mobile ${clip} poster`);
  }
  const web = readFileSync("src/components/brand/MascotVideo.tsx", "utf8");
  assert.match(web, /maskImage/, "web: the grey studio background fades into the page");
  assert.match(web, /radial-gradient/);
  for (const attr of [/\bmuted\b/, /\bloop\b/, /\bplaysInline\b/, /poster=\{poster\}/]) assert.match(web, attr);
  assert.match(web, /usePrefersReducedMotion\(\)/, "web: reduced motion shows the poster");
  assert.match(web, /IntersectionObserver/, "web: lazy, and pauses offscreen");
  assert.match(web, /visibilitychange/, "web: pauses in a hidden tab");
  const native = readFileSync("apps/mobile/src/components/MascotVideo.tsx", "utf8");
  assert.match(native, /from "expo-video"/);
  assert.match(native, /\.loop = true/);
  assert.match(native, /\.muted = true/);
  assert.match(native, /useReduceMotion\(\)/, "phone: Reduce Motion shows the poster");
  assert.match(native, /useFocusEffect/, "phone: pauses when the screen loses focus");
  assert.match(native, /AppState/, "phone: pauses in the background");
  assert.match(native, /RadialGradient/, "phone: the spotlight rim");
  assert.match(native, /surfaceType="textureView"/, "Android: the round clip only works on a texture view");

  // Where the clips play on the phone (Prototype 10).
  assert.match(readFileSync("apps/mobile/src/components/AuthForm.tsx", "utf8"), /mode === "login" && <MascotVideo clip="peggy-hello"/, "Welcome back: Peggy");
  assert.match(readFileSync("apps/mobile/src/components/OnboardingWelcome.tsx", "utf8"), /<MascotVideo clip="rex-hello"/, "onboarding welcome: Rex");
  assert.match(readFileSync("apps/mobile/src/app/onboarding/index.tsx", "utf8"), /<OnboardingWelcome /);
  assert.match(readFileSync("apps/mobile/src/app/onboarding/live.tsx", "utf8"), /<MascotVideo clip="rex-thumbs"/, "shop ready: Rex thumbs up");
});
