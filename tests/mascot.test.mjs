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
  assert.match(web, /shouldAnimate\(source, \{ reducedMotion \}\)/);
  assert.match(readFileSync("src/components/brand/mascot.css", "utf8"), /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  const native = readFileSync(NATIVE_COMPONENT, "utf8");
  assert.match(native, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(native, /reduceMotionChanged/);
  assert.match(native, /isLowEndAndroid\(Platform\.OS, Device\.totalMemory\)/);
  assert.match(native, /shouldAnimate\(source, \{ reducedMotion, lowEndDevice: LOW_END \}\)/);
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
  assert.match(read("src/components/auth/app/AppAuth.tsx"), /<Mascot name="rex" mood="wave"/, "Welcome: Rex waves");
  assert.match(read("apps/mobile/src/app/welcome.tsx"), /<Mascot name="rex" mood="wave"/);
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
