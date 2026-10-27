// Phone round 2, tips and Peggy (owner's Android test of version 10):
// 1. the tips' music and narration stop when the intro closes, the app goes to the background or a Peggy call starts
//    (one audio guard, apps/mobile/src/lib/intro-audio*.ts), and players are paused and released, never just removed;
// 2. tips and the first-run Home tour wait until setup is done and never show during a Peggy call; no intro opens by
//    itself, a small Tips button opens the screen's tip instead;
// 3. Peggy's screens are unambiguous (store design → Shop looks, Rex → /rex, a social post → /create, the posts
//    calendar → /posts) and she says the name of the screen she actually opens;
// 4. the minimized call bar sits in its own strip, so it never covers the screen she opened.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const guardLib = await import("../apps/mobile/src/lib/intro-audio-pure.ts");
const gate = await import("../apps/mobile/src/lib/setup-gate-pure.ts");
const screens = await import("../shared/peggy-screens.ts");
const pure = await import("../apps/mobile/src/lib/peggy-call-pure.ts");
const prompt = await import("../src/lib/ai/peggy-voice-prompt.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

function filesUnder(dir) {
  const root = new URL(`../${dir}/`, import.meta.url).pathname;
  const out = [];
  const walk = (folder) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

// ─── 1. The audio guard ──────────────────────────────────────────────────────

test("audio guard: background, inactive and a Peggy call stop every registered player", () => {
  const guard = guardLib.createAudioGuard();
  const calls = [];
  const off = guard.register((reason) => calls.push(["intro", reason]));
  guard.register((reason) => calls.push(["video", reason]));
  guard.register(() => {
    throw new Error("already released");
  });
  assert.equal(guard.size(), 3);
  assert.equal(guard.allowed(), true);

  guard.appStateChanged("background");
  assert.deepEqual(calls, [["intro", "background"], ["video", "background"]], "a throwing player doesn't stop the rest");
  assert.equal(guard.allowed(), false, "no sound in the background");
  guard.appStateChanged("active");
  assert.equal(guard.allowed(), true);
  calls.length = 0;
  guard.appStateChanged("inactive");
  assert.equal(calls.length, 2, "inactive (app switcher, a phone call) stops it too");
  guard.appStateChanged("active");

  calls.length = 0;
  guard.callPhaseChanged("connecting");
  assert.deepEqual(calls, [["intro", "call"], ["video", "call"]]);
  assert.equal(guard.allowed(), false, "silent for the whole call");
  guard.callPhaseChanged("live");
  assert.equal(calls.length, 2, "only once per call");
  guard.callPhaseChanged("summary");
  assert.equal(guard.allowed(), true);
  guard.callPhaseChanged("idle");

  calls.length = 0;
  guard.stopAll("close");
  assert.deepEqual(calls, [["intro", "close"], ["video", "close"]]);
  off();
  assert.equal(guard.size(), 2, "unregistered on unmount");
});

test("audio guard: wired to AppState and the call store, mounted once at the root", () => {
  const wiring = read("apps/mobile/src/lib/intro-audio.ts");
  assert.match(wiring, /AppState\.addEventListener\("change", \(state\) => introAudio\.appStateChanged\(state\)\)/);
  assert.match(wiring, /subscribeCall\(\(\) => introAudio\.callPhaseChanged\(callState\(\)\.phase\)\)/);
  assert.match(read("apps/mobile/src/lib/peggy-call.ts"), /export function subscribeCall/);
  const layout = read("apps/mobile/src/app/_layout.tsx");
  assert.match(layout, /useIntroAudioGuard\(\)/);
  assert.match(layout, /<IntroAudioGuard \/>/);
});

test("intro sound: closing stops and releases both players; pause pauses; the guard and the call silence it", () => {
  const hook = read("apps/mobile/src/components/learn/useIntroSound.ts");
  // remove() on Android only drops the player from expo-audio's list (it kept playing, even in the background).
  assert.doesNotMatch(hook, /(voice|music)\.current\?\.remove\(\)/);
  assert.match(hook, /player\.pause\(\);[\s\S]*?\.release\?\.\(\)/, "pause, then release");
  assert.match(hook, /releasePlayer\(voice\.current\);\s*releasePlayer\(music\.current\);/);
  assert.match(hook, /useIntroAudioStop\(\(\) => \{\s*pausedRef\.current = true;\s*stopAll\(\);/);
  assert.match(hook, /off\.current = true;\s*stopAll\(\);/, "unmount stops everything");
  assert.match(hook, /shouldPlayInBackground: false/);
  assert.match(hook, /!introAudio\.allowed\(\)/, "nothing starts in the background or during a call");
  assert.match(hook, /const pause = useCallback\(\(\) => \{\s*pausedRef\.current = true;/);
  const sheet = read("apps/mobile/src/components/learn/FeatureIntroSheet.tsx");
  assert.match(sheet, /const close = \(reason: "done" \| "skip" \| "close"\) => \{\s*stopSound\(\);\s*onClose\(reason\);/);
  assert.doesNotMatch(sheet, /=> onClose\(/, "every way out goes through close()");
  assert.match(sheet, /onInterrupt: \(\) => setPaused\(true\)/);
});

test("tip videos: paused by the guard; never set to play in the background anywhere in the app", () => {
  for (const file of ["apps/mobile/src/components/HelpVideoPlayer.tsx", "apps/mobile/src/components/familiar/StoryViewer.tsx"]) {
    const source = read(file);
    assert.match(source, /useIntroAudioStop\(/, file);
    assert.match(source, /staysActiveInBackground = false/, file);
  }
  // A Peggy call closes the Status viewer (the getting-started tips).
  assert.match(read("apps/mobile/src/components/familiar/StoryViewer.tsx"), /if \(visible && calling\) closeRef\.current\(\)/);
  for (const file of filesUnder("apps/mobile/src")) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /shouldPlayInBackground: true|staysActiveInBackground = true|showNowPlayingNotification = true/, file);
  }
  const app = JSON.parse(read("apps/mobile/app.json")).expo;
  const plugin = (name) => app.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)?.[1];
  assert.equal(plugin("expo-audio").enableBackgroundPlayback, false);
  assert.equal(plugin("expo-video").supportsBackgroundPlayback, false);
});

// ─── 2. Tips wait for setup ──────────────────────────────────────────────────

test("setup status: a seller's Start checklist; a supplier's or partner's steps (the team's review doesn't count)", () => {
  assert.equal(gate.sellerSetupDone({ checklist: { complete: true } }), true);
  assert.equal(gate.sellerSetupDone({ checklist: { complete: false } }), false);
  assert.equal(gate.sellerSetupDone(null), null);
  assert.equal(gate.sellerSetupDone({}), null);
  const steps = (done) => ({ steps: [{ id: "profile", done: true }, { id: "bank", done }, { id: "verified", done: false }] });
  assert.equal(gate.roleSetupDone(steps(true)), true, "waiting on verification only");
  assert.equal(gate.roleSetupDone(steps(false)), false);
  assert.equal(gate.roleSetupDone({ steps: [] }), null);
  assert.equal(gate.roleSetupDone(null), null);
});

test("tips gate: setup done, tips on, no Peggy call, not just after she opened a screen", () => {
  const base = { setupDone: true, tipsOn: true, callPhase: "idle", peggyOpenedAt: null, now: 1_000_000 };
  assert.equal(gate.tipsMayShow(base), true);
  assert.equal(gate.tipsMayShow({ ...base, setupDone: false }), false, "setup still going");
  assert.equal(gate.tipsMayShow({ ...base, setupDone: null }), false, "unknown (offline, 404) counts as not done");
  assert.equal(gate.tipsMayShow({ ...base, tipsOn: false }), false);
  for (const phase of ["connecting", "live", "summary"]) assert.equal(gate.tipsMayShow({ ...base, callPhase: phase }), false, phase);
  assert.equal(gate.tipsMayShow({ ...base, peggyOpenedAt: base.now - 5_000 }), false, "right after Peggy opened a screen");
  assert.equal(gate.tipsMayShow({ ...base, peggyOpenedAt: base.now + 5 }), false, "a clock older than her opening");
  assert.equal(gate.tipsMayShow({ ...base, peggyOpenedAt: base.now - gate.AFTER_PEGGY_OPENED_MS - 1 }), true);
  // The tour: the same rules without the tips switch.
  assert.equal(gate.tourMayShow({ setupDone: true, callPhase: "idle", peggyOpenedAt: null, now: 0 }), true);
  assert.equal(gate.tourMayShow({ setupDone: false, callPhase: "idle", peggyOpenedAt: null, now: 0 }), false);
  assert.equal(gate.tourMayShow({ setupDone: true, callPhase: "live", peggyOpenedAt: null, now: 0 }), false);
  assert.deepEqual(gate.withHidden(["a", "b"], "a"), ["b", "a"]);
});

test("tips: no intro opens by itself; a Tips button on screens with a tip, after setup, hidden per screen", () => {
  const host = read("apps/mobile/src/components/learn/LearnHost.tsx");
  assert.doesNotMatch(host, /AUTO_DELAY|setTimeout/, "nothing pops up by itself");
  assert.match(host, /const allowed = useTipsAllowed\(tipsOn\);/);
  assert.match(host, /const showButton = Boolean\(key && uid && allowed && !open && !hidden\.keys\.includes\(key\)\)/);
  assert.match(host, /testID="tips-button"/);
  assert.match(host, /onLongPress=\{hideHere\}/);
  assert.match(host, /testID="tips-button-hide"/);
  assert.match(host, /left: 16, bottom/, "bottom-left, clear of the + (bottom-right on Android, mid-bar on iPhone)");
  assert.match(host, /if \(open && \(calling \|\| open\.path !== path\)\) setOpen\(null\);/, "a call or a new screen closes the intro");
  const gateHook = read("apps/mobile/src/lib/setup-gate.ts");
  assert.match(gateHook, /role === "seller" \? sellerSetupDone\(await fetchSetup\(\)\) : roleSetupDone\(await fetchSetupView\(\)\)/);
  assert.match(gateHook, /usePeggySaved\(/);
  // The Help getting-started videos stay.
  assert.match(read("apps/mobile/src/app/help/index.tsx"), /<GettingStartedVideos \/>/);
  for (const lang of LANGS) {
    const learn = read(`shared/i18n/messages/learn/${lang}.ts`);
    for (const key of ["tipsButton", "tipsOpen", "tipsHide", "tipsHideHint"]) assert.match(learn, new RegExp(`"${key}": "`), `${lang} ${key}`);
  }
});

test("first-run Home tour: waits for setup, Home in front, and no Peggy call", () => {
  const home = read("apps/mobile/src/app/(tabs)/home.tsx");
  assert.match(home, /const tourAllowed = useTourAllowed\(sellerSetupDone\(setup\)\);/);
  assert.match(home, /const tourShowing = touring && tourAllowed && focused;/);
  assert.match(home, /visible=\{tourShowing\}/);
  assert.doesNotMatch(home, /visible=\{touring\}/);
  assert.match(read("apps/mobile/src/lib/setup-gate.ts"), /tourMayShow\(\{ setupDone, callPhase: call\.phase/);
});

// ─── 3. Peggy's screens ──────────────────────────────────────────────────────

test("Peggy's screens: every id, name and word belongs to one screen per role", () => {
  const key = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    const owner = new Map();
    for (const screen of screens.PEGGY_SCREENS[role]) {
      for (const word of new Set([screen.id, screen.name, ...(screen.also ?? [])].map(key))) {
        assert.ok(!owner.has(word) || owner.get(word) === screen.id, `${role}: "${word}" is both ${owner.get(word)} and ${screen.id}`);
        owner.set(word, screen.id);
      }
      assert.equal(screens.findScreen(role, screen.id)?.id, screen.id, `${role} ${screen.id}`);
      assert.equal(screens.findScreen(role, screen.name)?.id, screen.id, `${role} ${screen.name}`);
    }
  }
});

test("Peggy's screens: store design opens Shop looks, Rex opens /rex, a social post /create, the calendar /posts", () => {
  const seller = (asked) => screens.findScreen("seller", asked)?.app ?? null;
  for (const asked of ["store design", "my store design", "shop look", "Shop looks", "templates", "theme", "design", "look"]) assert.equal(seller(asked), "/templates", asked);
  for (const asked of ["Edit my shop with Rex", "Rex store builder", "rex", "store builder"]) assert.equal(seller(asked), "/rex", asked);
  for (const asked of ["edit my shop", "Edit my shop", "change my shop"]) assert.equal(seller(asked), "/shop-edit", asked);
  for (const asked of ["make a social post", "Make a post", "social post", "Create with Rex posts", "flyer", "create"]) assert.equal(seller(asked), "/create", asked);
  for (const asked of ["posts calendar", "Posts calendar", "posts", "calendar"]) assert.equal(seller(asked), "/posts", asked);
  assert.equal(seller("Create with Rex"), null, "the old, ambiguous name opens nothing");
  assert.equal(seller("social"), null);
  // The phone opens the route of the screen she named, and her reply names that same screen.
  const opened = pure.openScreenOnPhone("seller", { screen: "store design" });
  assert.equal(opened.route, "/templates");
  assert.match(opened.reply, /^Opened Shop looks\./);
  assert.equal(pure.openScreenOnPhone("seller", { screen: "rex" }).route, "/rex");
  assert.equal(screens.openScreenOnWeb("seller", { screen: "store design" }).path, "/studio");
  // Suppliers and delivery partners have no shop design or Rex screens: never someone else's screen. They do have
  // the shared posts screens (Make a post, Posts calendar), which open the same app routes.
  for (const role of ["supplier", "logistics_partner"]) {
    for (const asked of ["store design", "templates", "rex"]) {
      assert.equal(screens.findScreen(role, asked), null, `${role} ${asked}`);
    }
    assert.equal(screens.findScreen(role, "make a social post")?.app, "/create");
    assert.equal(screens.findScreen(role, "posts calendar")?.app, "/posts");
    assert.equal(pure.openScreenOnPhone(role, { screen: "home" }).route, role === "supplier" ? "/supplier/home" : "/logistics/home");
  }
  assert.equal(screens.findScreen("supplier", "pickup").app, "/supplier/setup?edit=pickup");
  assert.equal(screens.findScreen("logistics_partner", "pickup points").app, "/logistics/points");
});

test("Peggy sees what each screen is for and is told to name the screen she opens", () => {
  const list = screens.screenList("seller");
  assert.match(list, /look \(Shop looks: the store design/);
  assert.match(list, /rex \(Edit my shop with Rex: chat with Rex/);
  assert.match(list, /create \(Make a post: Rex designs a social media post/);
  assert.match(list, /posts \(Posts calendar: /);
  assert.doesNotMatch(list, /Create with Rex/);
  assert.match(screens.screenList("supplier"), /^home \(Home\), setup \(Set-up\)/);
  const text = prompt.peggyVoicePrompt({ facts: "F", cities: "C" });
  assert.match(text, /call it by the name in brackets: the name of the screen you actually open/);
  assert.match(text, /their store design, how the shop looks, a template or theme: look \(Shop looks\)/);
  assert.match(text, /changing or building the shop by chatting with Rex: rex \(Edit my shop with Rex\)/);
  assert.match(text, /making a social media post, flyer, status or reel: create \(Make a post\)/);
  assert.match(text, /posts already made or planned, the posts calendar: posts \(Posts calendar\)/);
  assert.match(read("shared/peggy-screens.ts"), /app: "\/shop-edit"/);
  for (const lang of LANGS) {
    const help = read(`shared/i18n/messages/m_help/${lang}.ts`);
    assert.match(help, /"call\.screen\.rex": "/, lang);
    assert.doesNotMatch(help, /"call\.screen\.create": "Create with Rex"/, lang);
  }
});

// ─── 4. The call bar leaves the screen clear ─────────────────────────────────

test("call: a screen Peggy opens shows clearly; the minimized bar has its own strip under the tab bar", () => {
  const engine = read("apps/mobile/src/components/peggy/PeggyCallEngine.tsx");
  assert.match(engine, /router\.push\(route as never\);\s*\/\/[^\n]*\n\s*notePeggyOpened\(\);/);
  assert.doesNotMatch(engine, /SavedToast/, "no toast over the opened screen's header");
  assert.match(engine, /<CallBar call=\{call\} note=\{toast\?\.text \?\? null\}/);
  const views = read("apps/mobile/src/components/peggy/PeggyCallViews.tsx");
  assert.match(views, /export const CALL_BAR_HEIGHT = 56;/);
  assert.match(views, /bottom: 0, height: CALL_BAR_HEIGHT \+ insets\.bottom, paddingBottom: insets\.bottom/);
  assert.doesNotMatch(views, /insets\.bottom \+ 78/);
  const host = read("apps/mobile/src/components/peggy/PeggyCallHost.tsx");
  assert.match(host, /paddingBottom: shown \? CALL_BAR_HEIGHT : 0/);
  assert.match(read("apps/mobile/src/lib/peggy-call.ts"), /export const callBarShown = \(current: CallState\) => current\.engine && current\.minimized && \(current\.phase === "connecting" \|\| current\.phase === "live"\)/);
  assert.match(read("apps/mobile/src/app/_layout.tsx"), /<CallSpace>\s*<Stack /);
});

test("tips music: each intro plays the next Afrobeats track, starting at the first", () => {
  const { nextTrack, TIPS_TRACK_COUNT } = guardLib;
  assert.equal(TIPS_TRACK_COUNT, 5);
  assert.deepEqual(nextTrack(null), { index: 0, store: "0" });
  assert.deepEqual(nextTrack("0"), { index: 1, store: "1" });
  assert.deepEqual(nextTrack("4"), { index: 0, store: "0" });
  assert.deepEqual(nextTrack("junk"), { index: 0, store: "0" });
  assert.deepEqual(nextTrack("-3"), { index: 0, store: "0" });
  const hook = read("apps/mobile/src/components/learn/useIntroSound.ts");
  const tracks = [...hook.matchAll(/assets\/sounds\/(tips-[a-z-]+\.m4a)/g)].map((m) => m[1]);
  assert.equal(tracks.length, TIPS_TRACK_COUNT);
  for (const file of tracks) assert.ok(statSync(new URL(`../apps/mobile/assets/sounds/${file}`, import.meta.url)).size > 100_000, file);
});
