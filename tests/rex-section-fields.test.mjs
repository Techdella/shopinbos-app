// Rex can change whatever the builder's inspector shows for a section, checked against the same schema
// (src/lib/ai/rex/section-fields.ts), and can reorder, duplicate and place sections (src/lib/ai/rex/studio-plan.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const fields = await import("../src/lib/ai/rex/section-fields.ts");
const plan = await import("../src/lib/ai/rex/studio-plan.ts");

const hero = () => ({ id: "hero", kind: "hero-split", visible: true, settings: { layout: "gbedu-impact" }, blocks: [{ id: "hero-copy", type: "copy", content: { title: "Old" } }] });

test("the description lists the fields the panel shows now, with their choices and current values", () => {
  const described = fields.describeRexFields(hero(), "boutique", "gbedu");
  assert.match(described.layout, /gbedu-impact\|.*\(now "gbedu-impact"\)/);
  assert.equal(described.spacing, "compact|normal|roomy");
  assert.equal(described.title, "text");
  assert.ok(!Object.keys(described).some((id) => id.startsWith("media-asoebi")), "other layouts' picture slots stay out");
  // Header, footer and bar have no spacing.
  assert.ok(!("spacing" in fields.describeRexFields({ id: "f", kind: "footer", blocks: [] }, "boutique", "gbedu")));
});

test("changes are checked against the schema: bad values and unknown fields are dropped", () => {
  const section = hero();
  const changed = fields.applyRexFieldChanges(section, {
    layout: "full-bleed-nope",
    spacing: "roomy",
    title: "Turn it up",
    stockImage: "true",
    media: ["http://not-https.example/a.png", "https://cdn.example/a.png"],
    madeUp: "x",
  }, "boutique", "gbedu");
  assert.deepEqual(changed.sort(), ["media", "spacing", "stockImage", "title"]);
  assert.equal(section.settings.layout, "gbedu-impact", "an option not in the list is ignored");
  assert.equal(section.settings.spacing, "roomy");
  assert.equal(section.settings.stockImage, true);
  assert.equal(section.blocks[0].content.title, "Turn it up");
  assert.deepEqual(section.items, [{ imageUrl: "https://cdn.example/a.png" }]);
});

test("ready-made blocks: repeater items are cleaned field by field and capped", () => {
  const section = { id: "t", kind: "trust-badges", visible: true, blocks: [{ id: "c", type: "copy", content: {} }] };
  const badges = Array.from({ length: 9 }, (_, index) => ({ icon: index === 0 ? "rocket" : "truck", title: `Badge ${index}`, text: "Fast", extra: "x" }));
  assert.deepEqual(fields.applyRexFieldChanges(section, { badges, style: "cards" }, "boutique", "gbedu").sort(), ["badges", "style"]);
  assert.equal(section.items.length, 6);
  assert.deepEqual(section.items[0], { title: "Badge 0", text: "Fast" }, "an unknown icon is dropped, unknown keys too");
  assert.equal(section.items[1].icon, "truck");
});

const draft = () => ({
  templateId: "gbedu",
  templateName: "Gbedu",
  layoutFamily: "x",
  themeTokens: {},
  updatedAt: "",
  pages: [{ id: "p", pageType: "home", title: "Home", slug: "home", sections: [
    { id: "header", kind: "header", visible: true, blocks: [] },
    hero(),
    { id: "products", kind: "featured-products", visible: true, blocks: [{ id: "pc", type: "copy", content: { title: "Hot" } }] },
    { id: "story", kind: "story-split", visible: true, blocks: [{ id: "sc", type: "copy", content: { title: "Why us" } }] },
    { id: "footer", kind: "footer", visible: true, blocks: [] },
  ] }],
});
const context = {
  storeName: "Shop",
  themeSnapshot: () => null,
  themeName: () => null,
  createSection: (kind) => ({ id: `${kind}-new`, kind, visible: true, blocks: [{ id: `${kind}-new-copy`, type: "copy", content: {} }] }),
  allowedKinds: () => ["story-split", "trust-badges"],
  reviewItems: [],
  isBoutique: () => true,
  applyFields: (section, changes, themeId) => fields.applyRexFieldChanges(section, changes, "boutique", themeId),
};
const ids = (snapshot) => snapshot.pages[0].sections.map((section) => section.id);

test("move, duplicate and place: sections go exactly where Rex says, never above the header or below the footer", () => {
  const moved = plan.applyRexStudioPlan(draft(), plan.parseRexStudioPlan({ ops: [{ action: "move", page: "home", kind: "story-split", sectionId: "story", after: "hero" }] }), context);
  assert.deepEqual(ids(moved.snapshot), ["header", "hero", "story", "products", "footer"]);
  const dup = plan.applyRexStudioPlan(draft(), plan.parseRexStudioPlan({ ops: [{ action: "duplicate", page: "home", kind: "story-split", sectionId: "story" }] }), context);
  assert.equal(dup.snapshot.pages[0].sections[4].kind, "story-split");
  assert.notEqual(dup.snapshot.pages[0].sections[4].id, "story");
  assert.equal(ids(dup.snapshot).at(-1), "footer");
  const locked = plan.applyRexStudioPlan(draft(), plan.parseRexStudioPlan({ ops: [{ action: "move", page: "home", kind: "header", sectionId: "header", after: "products" }] }), context);
  assert.equal(locked.changes.length, 0, "the header stays put");
});

test("add a ready-made block after a section and set it up in one step; update fields on an existing section", () => {
  const result = plan.applyRexStudioPlan(draft(), plan.parseRexStudioPlan({ ops: [
    { action: "add", page: "home", kind: "trust-badges", after: "products", fields: { style: "dark", spacing: "compact" } },
    { action: "update", page: "home", kind: "hero-split", sectionId: "hero", fields: { spacing: "roomy" } },
  ] }), context);
  const sections = result.snapshot.pages[0].sections;
  assert.equal(sections[3].kind, "trust-badges");
  assert.deepEqual(sections[3].settings, { style: "dark", spacing: "compact" });
  assert.equal(sections[1].settings.spacing, "roomy");
  assert.equal(result.changes.length, 2);
});

test("wiring: Rex's context, prompt and the 2026 renderer all use it", () => {
  const studio = read("src/lib/ai/rex/studio.server.ts");
  assert.match(studio, /applyFields: \(section, fields, themeId\) => applyRexFieldChanges\(/);
  assert.match(studio, /\[\.\.\.BOUTIQUE_SECTION_KINDS, \.\.\.STORE_BLOCK_KINDS, LAYOUT_ROW_KIND\]/);
  assert.match(read("src/lib/ai/rex/studio-edit.server.ts"), /describeSectionFields\(section, draft\.templateId\)/);
  const prompt = read("src/lib/ai/rex/prompts.ts");
  assert.match(prompt, /"move"\|"duplicate"/);
  assert.match(prompt, /"spacing": "compact"\|"normal"\|"roomy"/);
  assert.match(read("src/components/storefront/boutique/BoutiqueStorefront.tsx"), /className="bq-sec" data-spacing=\{spacing\}/);
  assert.match(read("src/components/storefront/boutique/look.ts"), /\.bq-sec\[data-spacing="roomy"\]\{padding-top:32px;padding-bottom:32px\}/);
});
