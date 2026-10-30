// Colour sets from the seller's logo and photos (shared/colour-sets.ts; onboarding D2b, the server in
// src/lib/onboarding/colour-sets.server.ts and GET /api/mobile/onboarding/colours): WCAG contrast maths, k-means
// dominant colours, the accent (greys, whites and blacks ignored), and three labelled, accessible sets.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cs = await import("../shared/colour-sets.ts");
const flow = await import("../shared/seller-onboarding.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const near = (actual, expected, delta = 0.01) => assert.ok(Math.abs(actual - expected) <= delta, `${actual} ≈ ${expected}`);

test("WCAG contrast: the known values", () => {
  near(cs.contrastRatio("#000000", "#FFFFFF"), 21);
  near(cs.contrastRatio("#FFFFFF", "#FFFFFF"), 1);
  near(cs.contrastRatio("#777777", "#FFFFFF"), 4.48);
  near(cs.contrastRatio("#767676", "#FFFFFF"), 4.54);
  // Order doesn't matter; 3-digit hex works.
  near(cs.contrastRatio("#FFF", "#0E2A38"), cs.contrastRatio("#0E2A38", "#FFFFFF"));
  near(cs.luminance("#FFFFFF"), 1);
  near(cs.luminance("#000000"), 0);
  assert.equal(cs.hexToRgb("nope"), null);
  assert.equal(cs.rgbToHex([300, -4, 15.6]), "#FF0010");
});

test("neutrals are whites, near-blacks and greys; colours are not", () => {
  for (const grey of [[250, 250, 250], [12, 12, 14], [128, 128, 130], [60, 58, 62], [200, 196, 190]]) assert.ok(cs.isNeutral(grey), String(grey));
  for (const colour of [[200, 30, 90], [14, 42, 56], [115, 216, 200], [242, 169, 59]]) assert.ok(!cs.isNeutral(colour), String(colour));
});

test("dominant colours: biggest first, deterministic, and the accent skips the white background", () => {
  const pixels = [];
  for (let i = 0; i < 600; i += 1) pixels.push([251, 250, 248]);
  for (let i = 0; i < 250; i += 1) pixels.push([200, 30, 90]);
  for (let i = 0; i < 150; i += 1) pixels.push([18, 18, 20]);
  const first = cs.dominantColours(pixels, 5);
  assert.deepEqual(first, cs.dominantColours(pixels, 5), "same pixels, same answer");
  assert.equal(first[0].hex, "#FBFAF8");
  near(first[0].share, 0.6);
  assert.equal(cs.accentFrom(first), "#C81E5A", "the pink mark, not the white or the black");
  // All greys: no accent (the presets are used instead).
  assert.equal(cs.accentFrom(cs.dominantColours([[250, 250, 250], [20, 20, 20], [128, 128, 128]], 3)), null);
  assert.deepEqual(cs.dominantColours([]), []);
  // A tiny speck of colour (under 3%) isn't the brand colour.
  const speck = [...Array.from({ length: 990 }, () => [240, 240, 240]), ...Array.from({ length: 10 }, () => [0, 200, 0])];
  assert.equal(cs.accentFrom(cs.dominantColours(speck, 4)), null);
});

test("every set made from any accent passes WCAG: 4.5:1 for words, 3:1 for buttons, light and dark", () => {
  const failures = [];
  for (let hue = 0; hue < 360; hue += 15) {
    for (const saturation of [0.3, 0.6, 1]) {
      for (const lightness of [0.2, 0.45, 0.6, 0.8]) {
        const accent = cs.rgbToHex(cs.hslToRgb(hue, saturation, lightness));
        for (const dark of [false, true]) {
          const set = cs.colourSet(accent, { dark });
          const problems = cs.setProblems(set);
          if (problems.length) failures.push(`${accent}${dark ? " dark" : ""}: ${problems.join(", ")}`);
          if (cs.contrastRatio(set.accentInk, set.accent) < cs.TEXT_CONTRAST) failures.push(`${accent}: button words`);
          if (cs.contrastRatio(set.accent, set.bg) < cs.CONTROL_CONTRAST) failures.push(`${accent}: button on page`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
  // Light styles get a light page, luxury a dark one.
  assert.ok(cs.luminance(cs.colourSet("#C81E5A").bg) > 0.8);
  assert.ok(cs.luminance(cs.colourSet("#C81E5A", { dark: true }).bg) < 0.05);
  // The hue is kept: a pink logo gives a pink button.
  const [hue] = cs.rgbToHsl(cs.hexToRgb(cs.colourSet("#C81E5A").accent));
  assert.ok(hue > 320 || hue < 10, `pink stays pink (${hue})`);
});

test("three labelled sets: from the logo, from the photos, Rex's pick; presets fill the gaps", () => {
  const presets = flow.palettesFor("warm");
  const all = cs.colourSetsFor({ logoAccent: "#1F4FD8", photoAccent: "#2E7E78", presets });
  assert.deepEqual(all.map((set) => set.source), ["logo", "photos", "rex"]);
  assert.deepEqual(all.map((set) => set.id), ["logo", "photos", presets[0].id]);
  // Photos the same colour as the logo: not offered twice.
  assert.deepEqual(cs.colourSetsFor({ logoAccent: "#1F4FD8", photoAccent: "#2050DA", presets }).map((set) => set.id), ["logo", ...presets.slice(0, 2).map((p) => p.id)]);
  // No pictures: the style's presets (Rex's pick first).
  assert.deepEqual(cs.colourSetsFor({ presets }).map((set) => set.id), presets.map((p) => p.id));
  for (const set of [...all, ...cs.colourSetsFor({ presets: flow.palettesFor("luxury"), dark: true })]) {
    assert.deepEqual(cs.setProblems(set.set), [], `${set.id} passes`);
    assert.ok(cs.cleanSetTokens(set.tokens), `${set.id}: the server accepts its tokens back`);
    assert.equal(set.swatch.length, 4);
  }
  // Every preset, brought up to WCAG for Rex's pick.
  for (const palette of flow.PALETTES) assert.deepEqual(cs.setProblems(cs.accessibleSet(cs.setFromTokens(palette.tokens))), [], palette.id);
});

test("saved tokens are checked: only #RRGGBB, every key, and the contrast must pass", () => {
  const good = cs.setTokens(cs.colourSet("#2E7E78"));
  assert.deepEqual(cs.cleanSetTokens(good), good);
  assert.equal(cs.cleanSetTokens({ ...good, ink: "red" }), null);
  assert.equal(cs.cleanSetTokens({ ...good, ctaText: good.ctaBg }), null, "button words the same colour as the button");
  const { muted: _muted, ...missing } = good;
  assert.equal(cs.cleanSetTokens(missing), null);
  assert.equal(cs.cleanSetTokens("x"), null);
});

test("the picked set's own tokens build the shop (styleTokens, flowPalette), presets still work", () => {
  const set = cs.colourSetsFor({ logoAccent: "#C81E5A", presets: flow.palettesFor("soft") })[0];
  const tokens = flow.styleTokens("soft", "logo", set.tokens);
  assert.equal(tokens.ctaBg, set.tokens.ctaBg);
  assert.equal(tokens.paperBg, set.tokens.paperBg);
  assert.ok(tokens.headingFont || tokens.bodyFont || Object.keys(tokens).length > Object.keys(set.tokens).length, "fonts and buttons from the style come too");
  assert.equal(flow.styleTokens("soft", "teal").ctaBg, flow.paletteDef("teal").tokens.ctaBg);
  assert.equal(flow.flowPalette({ style: "soft", palette: "logo", paletteTokens: set.tokens }).tokens.ctaBg, set.tokens.ctaBg);
  assert.equal(flow.flowPalette({ style: "soft", palette: "sage" }).id, "sage");
  assert.equal(flow.flowPalette({ style: "soft" }).id, flow.palettesFor("soft")[0].id);
});

test("the server reads only our own pictures, and the route, schema and phone are wired", () => {
  const server = read("src/lib/onboarding/colour-sets.server.ts");
  assert.match(server, /if \(!isOwnImageUrl\(url\)\) return \[\]/, "no fetching arbitrary URLs");
  assert.match(server, /resize\(\{ width: SIDE, height: SIDE, fit: "inside" \}\)/);
  assert.match(read("src/app/api/mobile/onboarding/colours/route.ts"), /colourSetsForSeller\(user\.id/);
  const route = read("src/app/api/mobile/onboarding/route.ts");
  assert.match(route, /paletteTokens: z\.record/);
  assert.match(route, /cleanSetTokens\(patch\.paletteTokens\)/);
  const design = read("apps/mobile/src/components/rex-build/design.tsx");
  assert.match(design, /fetchColourSets\(ctx\.flow\.style\)/);
  assert.match(design, /colours\.fromLogo/);
  assert.match(design, /colours\.fromPhotos/);
  assert.match(read("shared/seller-onboarding.ts"), /styleTokens\(flow\.style, flow\.palette, flow\.paletteTokens\)/);
});
