// Theme settings for the 2026 (boutique) themes: font pairing, button shape, page width and product photo shape
// (src/components/storefront/boutique/look.ts applyLookChoices), and the store-wide Layout view in the builder.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const look = await import("../src/components/storefront/boutique/look.ts");
const fonts = await import("../src/components/storefront/boutique/fonts.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const tokens = {
  heroBg: "#111111", heroText: "#FFFFFF", accent: "#C9A24A", ctaBg: "#111111", ctaText: "#FFFFFF", paperBg: "#FFFFFF",
  cardBg: "#F5F5F5", ink: "#111111", muted: "#666666", border: "#E5E5E5", headingStyle: "serif", radius: "rounded",
};

test("nothing picked: every theme looks exactly as before", () => {
  for (const id of ["noir", "breeze", "plain"]) {
    const before = look.boutiqueLook(id, tokens);
    const same = look.boutiqueLook(id, { ...tokens, fontPair: "theme", buttonShape: "theme", productRatio: "theme", pageWidth: "standard" });
    assert.equal(same.headingFont, before.headingFont, id);
    assert.equal(same.bodyFont, before.bodyFont, id);
    assert.equal(same.buttonRadius, before.buttonRadius, id);
    assert.equal(same.tileRatio, before.tileRatio, id);
    assert.equal(look.lookVars(before)["--bq-wrap"], "1320px");
  }
});

test("font pairing, button shape and photo shape replace the theme's own", () => {
  const picked = look.boutiqueLook("noir", { ...tokens, fontPair: "bold", buttonShape: "pill", productRatio: "square" });
  assert.equal(picked.headingFont, fonts.BQ_GROTESK);
  assert.equal(picked.bodyFont, fonts.BQ_GROTESK);
  assert.equal(picked.buttonRadius, 999);
  assert.equal(picked.tileRatio, "1 / 1");
  assert.equal(look.lookVars(picked)["--bq-button-radius"], "999px");

  const classic = look.boutiqueLook("breeze", { ...tokens, fontPair: "classic", buttonShape: "square", productRatio: "landscape" });
  assert.deepEqual([classic.headingFont, classic.bodyFont], [fonts.BQ_SERIF, fonts.BQ_SANS]);
  assert.equal(classic.buttonRadius, 0);
  assert.equal(classic.tileRatio, "4 / 3");
  // Unknown values (an older or hand-edited snapshot) keep the theme's own.
  const odd = look.boutiqueLook("breeze", { ...tokens, fontPair: "comic", buttonShape: "blob", productRatio: "tall" });
  const base = look.boutiqueLook("breeze", tokens);
  assert.deepEqual([odd.headingFont, odd.buttonRadius, odd.tileRatio], [base.headingFont, base.buttonRadius, base.tileRatio]);
});

test("page width runs through a CSS variable on every boutique page", () => {
  assert.equal(look.lookVars(look.boutiqueLook("breeze", { ...tokens, pageWidth: "wide" }))["--bq-wrap"], "1560px");
  assert.equal(look.lookVars(look.boutiqueLook("breeze", { ...tokens, pageWidth: "narrow" }))["--bq-wrap"], "1120px");
  assert.match(look.BOUTIQUE_CSS, /\.bq-wrap\{width:100%;max-width:var\(--bq-wrap,1320px\)/);
});

test("the builder offers the choices instead of 'part of the theme' notes, plus a store-wide Layout view", () => {
  const panel = read("src/components/builder/editor/ThemeSettingsPanel.tsx");
  assert.doesNotMatch(panel, /edk\.typePairing"|edk\.buttonShape/);
  assert.match(panel, /props\.onTheme\("fontPair", value\)/);
  assert.match(panel, /props\.onTheme\("buttonShape", value\)/);
  assert.match(panel, /props\.onTheme\("pageWidth", value\)/);
  assert.match(panel, /props\.onTheme\("productRatio", value\)/);
  assert.match(panel, /props\.onLayoutFamily\(/);
  assert.match(panel, /\{ id: "layout", label: "Layout" \}/);
  assert.match(read("src/components/builder/editor/Builder.tsx"), /onLayoutFamily=\{setLayoutFamily\}/);
});

test("new builder words exist in every language", async () => {
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const messages = (await import(`../shared/i18n/messages/builder/${lang}.ts`)).default;
    for (const key of ["edk.typePairingPick", "ed.Font pairing", "ed.Button shape", "ed.Page width", "ed.Product photos", "ed.Store layout", "ed.Marketplace grid"]) {
      assert.ok(messages[key], `${lang} ${key}`);
    }
  }
});
