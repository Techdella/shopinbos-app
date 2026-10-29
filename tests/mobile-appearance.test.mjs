// The phone app's Settings > Appearance (Light / Dark / Auto): the pure choice and storage helpers
// (apps/mobile/src/lib/appearance-pure.ts), the live palette swap, the dark palette's contrast (WCAG AA) and the
// wiring that keeps the switch at the source (theme.ts) instead of in every screen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pure = await import("../apps/mobile/src/lib/appearance-pure.ts");
const { colors, darkColors } = await import("../shared/tokens.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the saved choice: Auto unless Light or Dark was picked", () => {
  assert.equal(pure.parseAppearance(null), "auto");
  assert.equal(pure.parseAppearance(undefined), "auto");
  assert.equal(pure.parseAppearance("dark"), "dark");
  assert.equal(pure.parseAppearance("light"), "light");
  assert.equal(pure.parseAppearance("auto"), "auto");
  assert.equal(pure.parseAppearance("DARK"), "auto");
  assert.equal(pure.parseAppearance("system"), "auto");
  assert.deepEqual([...pure.APPEARANCE_PREFS], ["auto", "light", "dark"]);
  assert.equal(pure.APPEARANCE_KEY, "shopinbos.appearance");
});

test("only Light or Dark is kept on the phone; Auto clears it", () => {
  assert.equal(pure.storedAppearance("auto"), null);
  assert.equal(pure.storedAppearance("dark"), "dark");
  assert.equal(pure.storedAppearance("light"), "light");
  for (const pref of pure.APPEARANCE_PREFS) assert.equal(pure.parseAppearance(pure.storedAppearance(pref)), pref, `${pref} round-trips`);
});

test("Auto follows the phone; Light and Dark ignore it", () => {
  assert.equal(pure.resolveScheme("auto", "dark"), "dark");
  assert.equal(pure.resolveScheme("auto", "light"), "light");
  assert.equal(pure.resolveScheme("auto", null), "light", "a phone that doesn't say is light");
  assert.equal(pure.resolveScheme("auto", "unspecified"), "light");
  assert.equal(pure.resolveScheme("light", "dark"), "light");
  assert.equal(pure.resolveScheme("dark", "light"), "dark");
  assert.equal(pure.resolveScheme("dark", null), "dark");
});

test("the palette swaps in place on the one live object", () => {
  const live = { ...colors };
  const same = live;
  assert.equal(pure.applyPalette(live, darkColors), true);
  assert.equal(same.canvas, darkColors.canvas);
  assert.equal(live.ink, darkColors.ink);
  assert.equal(pure.applyPalette(live, darkColors), false, "nothing changes the second time");
  pure.applyPalette(live, colors);
  assert.deepEqual(live, { ...colors });
});

test("themed tables are built again after a scheme change, and read like plain objects and arrays", () => {
  let version = 0;
  const palette = { ...colors };
  const themed = pure.createThemed(() => version);
  let builds = 0;
  const TONE = themed(() => { builds += 1; return { ok: { bg: palette.successTint, fg: palette.success }, gray: { bg: palette.grayTint, fg: palette.ink } }; });
  const MARKS = themed(() => [{ bg: palette.mintTint }, { bg: palette.peach }]);
  assert.equal(TONE.ok.fg, colors.success);
  assert.deepEqual(Object.keys(TONE), ["ok", "gray"]);
  assert.equal("gray" in TONE, true);
  assert.equal(builds, 1);
  pure.applyPalette(palette, darkColors);
  assert.equal(TONE.ok.fg, colors.success, "the same scheme version keeps the built table");
  version += 1;
  assert.equal(TONE.ok.fg, darkColors.success);
  assert.equal(TONE.gray.fg, darkColors.ink);
  assert.equal(builds, 2);
  assert.deepEqual({ ...TONE }.ok, { bg: darkColors.successTint, fg: darkColors.success });
  assert.equal(Array.isArray(MARKS), true);
  assert.equal(MARKS.length, 2);
  assert.equal(MARKS[7 % MARKS.length].bg, darkColors.peach);
  assert.deepEqual(MARKS.map((mark) => mark.bg), [darkColors.mintTint, darkColors.peach]);
  assert.deepEqual([...MARKS].length, 2);
});

test("the dark palette has every key of the light one", () => {
  assert.deepEqual(Object.keys(darkColors).sort(), Object.keys(colors).sort());
});

test("light mode is unchanged: the new fill tokens equal the colours they replace", () => {
  assert.equal(colors.inkFill, colors.ink);
  assert.equal(colors.forestFill, colors.forest);
  assert.equal(colors.successFill, colors.success);
  assert.equal(colors.dangerFill, colors.danger);
  assert.equal(colors.onAccent, colors.ink);
});

test("dark mode text meets WCAG AA (4.5:1) on the canvas, cards and its tints; white on every fill", () => {
  const d = darkColors;
  const AA = 4.5;
  for (const text of ["ink", "inkSoft", "accentInk", "success", "forest", "danger", "warnInk", "grayInk", "blueInk"]) {
    for (const bg of ["canvas", "surface"]) {
      const ratio = pure.contrast(d[text], d[bg]);
      assert.ok(ratio >= AA, `${text} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
  const pairs = [["accentInk", "peach"], ["success", "successTint"], ["forest", "mintTint"], ["danger", "dangerTint"], ["warnInk", "warnTint"], ["grayInk", "grayTint"], ["blueInk", "blueTint"], ["ink", "grayTint"], ["ink", "lilac"], ["ink", "peach"], ["ink", "mintTint"]];
  for (const [text, bg] of pairs) {
    const ratio = pure.contrast(d[text], d[bg]);
    assert.ok(ratio >= AA, `${text} on ${bg}: ${ratio.toFixed(2)}`);
  }
  for (const fill of ["inkFill", "forestFill", "successFill", "dangerFill"]) {
    const ratio = pure.contrast("#FFFFFF", d[fill]);
    assert.ok(ratio >= AA, `white on ${fill}: ${ratio.toFixed(2)}`);
  }
  assert.ok(pure.contrast(d.onAccent, d.accent) >= AA, "text on the orange buttons");
  // Placeholders and hints: at least 3:1.
  assert.ok(pure.contrast(d.inkFaint, d.surface) >= 3, `inkFaint ${pure.contrast(d.inkFaint, d.surface).toFixed(2)}`);
  // Lines and the off switch stay visible on the cards.
  assert.ok(pure.contrast(d.toggleOff, d.surface) >= 1.5);
  assert.ok(pure.contrast(d.line, d.canvas) >= 1.2);
});

test("the switch happens at the source: one live colors object, the screens keyed on the scheme", () => {
  const theme = read("apps/mobile/src/theme.ts");
  assert.match(theme, /export const colors: Palette = \{ \.\.\.lightColors \}/);
  assert.match(theme, /applyPalette\(colors, next === "dark" \? darkColors : lightColors\)/);
  const layout = read("apps/mobile/src/app/_layout.tsx");
  assert.match(layout, /<AppearanceProvider>/);
  assert.match(layout, /<Stack key=\{scheme\}/);
  assert.match(layout, /<StatusBar style=\{dark \? "light" : "dark"\} \/>/);
  assert.match(layout, /<ThemeProvider value=\{navigationTheme\(dark\)\}>/);
  const appearance = read("apps/mobile/src/lib/appearance.tsx");
  assert.match(appearance, /expo-sqlite\/localStorage\/install/);
  assert.match(appearance, /useColorScheme\(\)/);
  // The phone's own setting reaches the app (iOS ignores dark mode with "light").
  assert.equal(JSON.parse(read("apps/mobile/app.json")).expo.userInterfaceStyle, "automatic");
  // Built-once styles would keep the old scheme.
  assert.doesNotMatch(read("apps/mobile/src/components/ui.tsx"), /StyleSheet\.create\(/);
});

test("Settings is a cog; the sun, moon and half circle are only for Appearance", () => {
  const icons = read("apps/mobile/src/components/icons.tsx");
  const settings = icons.match(/^ {2}settings: .*$/m)[0];
  assert.match(settings, /M12\.22 2h-\.44/, "the cog outline");
  assert.doesNotMatch(settings, /M12 2\.5v3M12 18\.5v3/, "not the old sun rays");
  const picker = read("apps/mobile/src/components/AppearancePicker.tsx");
  assert.match(picker, /auto: "contrast", light: "sun", dark: "moon"/);
  for (const screen of ["apps/mobile/src/app/settings.tsx", "apps/mobile/src/app/(tabs)/shop.tsx", "apps/mobile/src/app/supplier/account.tsx", "apps/mobile/src/app/supplier/(tabs)/money.tsx", "apps/mobile/src/app/logistics/(tabs)/more.tsx", "apps/mobile/src/app/rider/(tabs)/me.tsx"]) {
    assert.match(read(screen), /<AppearanceRow/, `${screen} has the Appearance row`);
  }
});

test("Appearance is in all five languages", () => {
  const keys = ["set.appearance", "set.appearanceChoose", "set.appearanceAuto", "set.appearanceAutoSub", "set.appearanceLight", "set.appearanceLightSub", "set.appearanceDark", "set.appearanceDarkSub", "set.appearanceAutoHint"];
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const catalog = read(`shared/i18n/messages/m_settings/${locale}.ts`);
    for (const key of keys) assert.ok(catalog.includes(`"${key}":`), `${locale} has ${key}`);
  }
});
