// Section rhythm in the 2026 (boutique) themes: a contained section that pads only its top must not run into a
// following section that paints its own background (e.g. Gbedu's category tiles straight into the split story band).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every boutique section sits in a .bq-sec wrapper, live and in the builder", () => {
  const boutique = read("src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(boutique, /return <div key=\{section\.id\} className="bq-sec" data-spacing=\{spacing\}>\{node\}<\/div>;/);
  assert.match(boutique, /key=\{section\.id\}\n\s+className="bq-sec"\n\s+data-spacing=\{spacing\}\n\s+data-section-id=\{section\.id\}/);
});

test("an open-ended section gets a gap before a section with its own background, and the last one closes", () => {
  const css = read("src/components/storefront/boutique/look.ts");
  const open = 'section.bq-wrap:not([class*="py-"]):not([class*="pb-"])';
  const gap = `.bq-sec:has(> ${open}) + .bq-sec > :first-child:is(:not(.bq-wrap),[style*="background"]){margin-top:`;
  assert.ok(css.includes(`${gap}40px}`), "phones");
  assert.ok(css.includes(`${gap}56px}`), "wider");
  assert.ok(css.includes(`.bq-sec:last-child > ${open}{padding-bottom:40px}`));
  assert.ok(css.includes(`.bq-sec:last-child > ${open}{padding-bottom:56px}`));
});
