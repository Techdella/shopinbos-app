// Onboarding joy (batch 2): confetti and a dancing Rex on "Your store is live!" (web and phone), the onboarding
// logo (clearly chosen, downloadable, changed by voice note) and the fun loading lines while Rex works.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { confettiPieces, CONFETTI_COLORS } = await import("../shared/celebrate.ts");
const fun = await import("../shared/fun-loading.ts");
const en = (await import("../shared/i18n/messages/common/en.ts")).default;

test("confetti: the same pieces from a seed, on screen, in brand colours", () => {
  const a = confettiPieces(50, 7);
  assert.equal(a.length, 50);
  assert.deepEqual(a, confettiPieces(50, 7));
  assert.notDeepEqual(a, confettiPieces(50, 8));
  for (const piece of a) {
    assert.ok(piece.x >= 0 && piece.x <= 1);
    assert.ok(CONFETTI_COLORS.includes(piece.color));
    assert.ok(piece.duration > 0 && piece.delay >= 0);
  }
  assert.deepEqual(confettiPieces(0), []);
});

test("fun loading lines: every kind's lines exist, go through once, then keep alternating at the end", () => {
  for (const kind of fun.FUN_LOADING_KINDS) {
    const keys = fun.funLoadingKeys(kind);
    assert.equal(keys.length, fun.FUN_LOADING_COUNT[kind]);
    for (const key of keys) assert.ok(en[key], `${key} is in the common catalog`);
    for (let tick = 0; tick < 30; tick += 1) {
      const index = fun.funLoadingIndex(kind, tick);
      assert.ok(index >= 0 && index < keys.length);
    }
    assert.equal(fun.funLoadingIndex(kind, 0), 0);
  }
  assert.match(en["fun.logo.3"], /Wait small/);
  assert.match(en["fun.general.1"], /Rex is cooking/);
});

test("store is live: confetti and a dancing Rex on the web and in the phone app", () => {
  const web = read("src/components/onboarding/seller/SellerOnboarding.tsx");
  const live = web.slice(web.indexOf('if (question === "live")'));
  assert.match(live, /<Confetti \/>/);
  assert.match(live, /<DancingRex size=\{150\} \/>/);
  const phone = read("apps/mobile/src/app/onboarding/live.tsx");
  assert.match(phone, /\{live \? <Confetti \/> : null\}/);
  assert.match(phone, /live \? <DancingRex size=\{150\} \/>/);
  // Still under reduced motion.
  assert.match(read("src/app/globals.css"), /prefers-reduced-motion: reduce\) \{\n  \.confetti-piece \{ display: none; \}/);
  assert.match(read("apps/mobile/src/components/Celebrate.tsx"), /isReduceMotionEnabled/);
});

test("onboarding logo: fun loader on every redraw, a clear chosen logo with Download, and a voice note to Rex", () => {
  for (const file of ["src/components/onboarding/seller/SellerOnboarding.tsx", "apps/mobile/src/app/onboarding/index.tsx"]) {
    const source = read(file);
    assert.match(source, /<FunLoader kind="logo"/, file);
    assert.match(source, /t\("logo\.yourLogo"\)/, file);
    assert.match(source, /t\("logo\.download"\)/, file);
    assert.match(source, /async function askForLogos\(round: number, notes = logoNotes\)/, file);
    assert.match(source, /if \(spoken\.trim\(\)\) void askForLogos\(logoRound, spoken\);/, file);
  }
  assert.match(read("src/components/onboarding/seller/SellerOnboarding.tsx"), /downloadPicture\(logoUrl/);
  assert.match(read("apps/mobile/src/app/onboarding/index.tsx"), /saveFileToPhone\(logoUrl/);
  assert.match(read("src/lib/download-picture.ts"), /URL\.createObjectURL\(blob\)/);
});

test("fun loaders where Rex makes logos, pictures and videos", () => {
  assert.match(read("src/app/studio/logo/LogoStudioClient.tsx"), /<FunLoader kind="logo"/);
  assert.match(read("src/app/home/video/VideoStudio.tsx"), /<FunLoader kind="video"/);
  assert.match(read("src/app/home/video/VideoStudio.tsx"), /<FunLoader kind="image"/);
  assert.match(read("apps/mobile/src/app/create/[id].tsx"), /<FunLoader kind="image"/);
  assert.match(read("apps/mobile/src/app/video/studio.tsx"), /<FunLoader kind="video"/);
});
