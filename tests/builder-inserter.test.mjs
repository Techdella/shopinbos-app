// The builder's canvas "+" inserter, insert thumbnails and the rows / columns / grid section (layout-row).
// Pure logic only (Node strips the types); the React parts are checked through their source where it matters.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const logic = await import("../src/components/builder/editor/editor-logic.ts");
const schema = await import("../src/components/builder/editor/section-schema.ts");
const layout = await import("../src/components/storefront/boutique/blocks/layout-logic.ts");
const catalog = await import("../src/components/storefront/boutique/blocks/block-catalog.ts");
const chrome = await import("../src/lib/store-templates/chrome.ts");
const en = (await import("../shared/i18n/messages/builder/en.ts")).default;

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const node = (id, kind, extra = {}) => ({ id, kind, name: id, visible: true, blocks: [], ...extra });
const ids = (list) => list.map((section) => section.id);

test("canvas + spots sit between the sections shoppers see, never above the header or below the footer", () => {
  const page = [
    node("bar", "announcement-bar"),
    node("head", "header"),
    node("hero", "hero-split"),
    node("faq", "faq", { visible: false }),
    node("story", "story-split"),
    node("foot", "footer"),
  ];
  const slots = logic.insertSlots(page);
  assert.deepEqual(slots.map((slot) => [slot.afterId, slot.beforeId, slot.index]), [
    ["head", "hero", 2],
    ["hero", "story", 4],
    ["story", "foot", 5],
  ], "one spot above each visible body section and one before the footer; hidden sections get none");
  assert.equal(new Set(slots.map((slot) => slot.key)).size, slots.length, "spot keys are unique");

  // Placing at a spot puts the section exactly there.
  const added = node("new", "testimonials");
  assert.deepEqual(ids(logic.insertSectionAt(page, added, slots[0].index)), ["bar", "head", "new", "hero", "faq", "story", "foot"]);
  assert.deepEqual(ids(logic.insertSectionAt(page, added, slots[1].index)), ["bar", "head", "hero", "faq", "new", "story", "foot"]);
  assert.deepEqual(ids(logic.insertSectionAt(page, added, slots[2].index)), ["bar", "head", "hero", "faq", "story", "new", "foot"]);
  // Out-of-range or stale positions are clamped between the header and the footer.
  assert.deepEqual(ids(logic.insertSectionAt(page, added, 0)), ["bar", "head", "new", "hero", "faq", "story", "foot"], "never above the header");
  assert.deepEqual(ids(logic.insertSectionAt(page, added, 99)), ["bar", "head", "hero", "faq", "story", "new", "foot"], "never below the footer");
  assert.equal(logic.clampInsertIndex(page, Number.NaN), 5);
  assert.deepEqual(logic.insertBounds(page), { min: 2, max: 5 });

  // "Add below" from the floating toolbar.
  assert.equal(logic.slotBelow(page, "hero").beforeId, "story");
  assert.equal(logic.slotBelow(page, "story").beforeId, "foot");
  assert.equal(logic.slotBelow(page, "bar").afterId, "head", "the header's Add below goes under the whole header");
  assert.equal(logic.slotBelow(page, "foot"), null, "nothing goes below the footer");

  // Empty page: one spot between the header and footer.
  const empty = [node("head", "header"), node("foot", "footer")];
  assert.deepEqual(logic.insertSlots(empty).map((slot) => [slot.afterId, slot.beforeId, slot.index]), [["head", "foot", 1]]);
  // No chrome at all.
  assert.deepEqual(logic.insertSlots([node("a", "faq")]).map((slot) => [slot.afterId, slot.beforeId, slot.index]), [[null, "a", 0], ["a", null, 1]]);
  assert.deepEqual(logic.insertSlots([]).map((slot) => slot.index), [0]);
});

test("placing a section at a spot keeps the shared header and footer the same on every page", () => {
  const head = node("head", "header", { blocks: [{ id: "head-copy", type: "copy", content: { logoText: "Ada" } }] });
  const foot = node("foot", "footer");
  const snapshot = {
    templateId: "noir",
    pages: [
      { id: "home", pageType: "home", title: "Home", slug: "", sections: [head, node("hero", "hero-split"), foot] },
      { id: "about", pageType: "about", title: "About", slug: "about", sections: [head, node("story", "story-split"), foot] },
    ],
  };
  const slot = logic.insertSlots(snapshot.pages[1].sections).at(-1);
  const next = logic.updatePageSections(snapshot, "about", (list) => logic.insertSectionAt(list, layout.newLayoutRowSection("row1", "3"), slot.index));
  const merged = chrome.propagateChrome(snapshot, next);
  assert.deepEqual(ids(merged.pages[1].sections), ["head", "story", "row1", "foot"]);
  assert.deepEqual(ids(merged.pages[0].sections), ["head", "hero", "foot"], "other pages keep their body");
  assert.equal(chrome.normalizeChrome(merged), merged, "chrome is still consistent");
});

test("column presets: widths, grid tracks and the phone layout", () => {
  assert.deepEqual(layout.COLUMN_PRESETS.map((preset) => preset.id), ["1", "50-50", "33-66", "66-33", "3", "4", "grid-2x2", "grid-3x2"]);
  assert.deepEqual(layout.columnWidths("1"), [100]);
  assert.deepEqual(layout.columnWidths("50-50"), [50, 50]);
  assert.deepEqual(layout.columnWidths("33-66"), [33.33, 66.67]);
  assert.deepEqual(layout.columnWidths("66-33"), [66.67, 33.33]);
  assert.deepEqual(layout.columnWidths("3"), [33.33, 33.33, 33.33]);
  assert.deepEqual(layout.columnWidths("4"), [25, 25, 25, 25]);
  assert.deepEqual(layout.columnWidths("grid-2x2"), [50, 50, 50, 50]);
  assert.deepEqual(layout.columnWidths("grid-3x2"), [33.33, 33.33, 33.33, 33.33, 33.33, 33.33]);
  assert.deepEqual(layout.columnWidths("bogus"), [50, 50], "unknown presets fall back to two columns");
  assert.equal(layout.columnTemplate("33-66"), "minmax(0,1fr) minmax(0,2fr)");
  for (const preset of layout.COLUMN_PRESETS) {
    assert.equal(preset.cells % preset.tracks.length, 0, `${preset.id}: cells fill whole rows`);
    assert.ok(en[`ed.${preset.label}`] && en[`ed.${preset.hint}`], `${preset.id}: translatable`);
  }
  assert.equal(layout.mobileColumns({ preset: layout.columnPreset("4"), stackOnMobile: true }), 1);
  assert.equal(layout.mobileColumns({ preset: layout.columnPreset("4"), stackOnMobile: false }), 2);
  assert.equal(layout.mobileColumns({ preset: layout.columnPreset("1"), stackOnMobile: false }), 1);
});

test("layout rows: whatever is saved reads as clean columns, so bad data never breaks the live store", () => {
  const fresh = layout.normaliseLayoutRow({});
  assert.equal(fresh.preset.id, "50-50");
  assert.deepEqual([fresh.gap, fresh.align, fresh.stackOnMobile, fresh.background, fresh.padding], ["medium", "top", true, "none", "medium"]);
  assert.deepEqual(fresh.cells.map((cell) => cell.elements.length), [0, 0]);

  const messy = layout.normaliseLayoutRow({
    settings: { preset: "3", gap: "huge", align: 4, stackOnMobile: "no", background: "<script>", padding: null },
    items: [
      { id: "a", elements: [{ id: "h", type: "heading", text: "Hi", level: "h9", align: "middle" }, { type: "marquee", text: "x" }, null, "text", { id: "h", type: "text", text: 42 }] },
      "junk",
      { id: "a", elements: "nope" },
      { id: "d", elements: [{ id: "s", type: "spacer", size: 9999 }, { id: "b", type: "button", label: "Go", link: { type: "url", value: "javascript:alert(1)" } }] },
    ],
  });
  assert.deepEqual([messy.gap, messy.align, messy.stackOnMobile, messy.background, messy.padding], ["medium", "top", true, "none", "medium"], "unknown settings fall back");
  assert.equal(messy.cells.length, 3, "always the preset's column count");
  assert.deepEqual(messy.cells[0].elements.map((element) => element.type), ["heading", "text"], "unknown types and non-objects are dropped");
  assert.equal(messy.cells[0].elements[0].level, "h2");
  assert.equal(messy.cells[0].elements[0].align, "left");
  assert.equal(messy.cells[0].elements[1].text, "42");
  const allIds = messy.cells.flatMap((cell) => [cell.id, ...cell.elements.map((element) => element.id)]);
  assert.equal(new Set(allIds).size, allIds.length, "column and element ids are unique");
  assert.deepEqual(messy.cells[2].elements.map((element) => element.type), ["spacer", "button"], "a fourth column folds into the last one");
  assert.equal(messy.cells[2].elements[0].size, 160, "spacer height is clamped");
  assert.equal(layout.safeHref(messy.cells[2].elements[1].link.value), "", "only http(s) links open");
  assert.equal(layout.safeHref("https://example.com/a"), "https://example.com/a");

  const crowded = layout.normaliseLayoutCells([{ elements: Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, type: "text", text: "x" })) }], 1);
  assert.equal(crowded[0].elements.length, layout.MAX_ELEMENTS_PER_COLUMN);
  assert.doesNotThrow(() => layout.normaliseLayoutRow({ settings: null, items: { 0: "x" } }));
  assert.deepEqual(layout.iconListLines({ lines: " Fast \n\n Easy " }), ["Fast", "Easy"]);
});

test("layout rows: add, edit, reorder, copy and remove elements; presets never lose content", () => {
  let row = layout.newLayoutRowSection("row", "3");
  assert.equal(row.kind, "layout-row");
  assert.equal(row.name, "3 columns");
  assert.equal(row.items.length, 3);
  assert.deepEqual(logic.newBoutiqueSection("layout-row", "r2").items.length, 2, "the Insert panel's default is two columns");
  assert.equal(logic.insertLabel("layout-row"), "Columns");

  row = layout.addLayoutElement(row, 1, layout.newLayoutElement("heading", "e1"));
  row = layout.addLayoutElement(row, 1, layout.newLayoutElement("text", "e2"));
  row = layout.addLayoutElement(row, 2, layout.newLayoutElement("image", "e3"));
  row = layout.addLayoutElement(row, 9, layout.newLayoutElement("button", "e4"));
  assert.deepEqual(layout.normaliseLayoutRow(row).cells.map((cell) => cell.elements.map((element) => element.id)), [[], ["e1", "e2"], ["e3", "e4"]]);

  row = layout.moveLayoutElement(row, "e2", "up");
  assert.deepEqual(layout.normaliseLayoutRow(row).cells[1].elements.map((element) => element.id), ["e2", "e1"]);
  assert.equal(layout.moveLayoutElement(row, "e2", "up"), row, "the first element can't go higher");
  assert.equal(layout.moveLayoutElement(row, "e4", "down"), row, "moves stay inside the column");

  row = layout.updateLayoutElement(row, "e1", { text: "Welcome", level: "h3", type: "video" });
  const heading = layout.findLayoutElement(row, "e1").element;
  assert.deepEqual([heading.type, heading.text, heading.level], ["heading", "Welcome", "h3"], "an edit can't change the element's type");

  row = layout.duplicateLayoutElement(row, "e1", "e1b");
  assert.deepEqual(layout.normaliseLayoutRow(row).cells[1].elements.map((element) => element.id), ["e2", "e1", "e1b"]);
  row = layout.removeLayoutElement(row, "e2");
  assert.equal(layout.findLayoutElement(row, "e2"), null);

  const two = layout.setLayoutPreset(row, "50-50");
  assert.equal(two.settings.preset, "50-50");
  assert.deepEqual(layout.normaliseLayoutRow(two).cells.map((cell) => cell.elements.map((element) => element.id)), [[], ["e1", "e1b", "e3", "e4"]], "the third column's elements move into the last column");
  const four = layout.setLayoutPreset(two, "grid-2x2");
  assert.equal(four.items.length, 4);

  // The sections tree lists the elements; picking one focuses it in the panel.
  const rows = logic.sectionBlocks(row);
  assert.deepEqual(rows.map((entry) => entry.field), ["element:e1", "element:e1b", "element:e3", "element:e4"]);
  assert.equal(rows[0].label, "Welcome");
});

test("layout rows: inspector fields, element catalogue and where the row is offered", () => {
  for (const theme of ["breeze", "noir", "plain"]) {
    const full = schema.sectionSchema("layout-row", "boutique", theme);
    const fields = schema.allFields(full);
    assert.ok(fields.some((field) => field.type === "layoutColumns"), "the column editor is in the panel");
    for (const field of fields) {
      assert.ok(en[`ed.${field.label}`], `"${field.label}" has an English builder key`);
      if (field.help) assert.ok(en[`ed.${field.help}`], `help "${field.help}" has a key`);
      if ("options" in field) for (const option of field.options) assert.ok(en[`ed.${option.label}`], `option "${option.label}" has a key`);
    }
    const section = layout.newLayoutRowSection("r", "50-50");
    for (const field of fields.filter((entry) => entry.target?.scope === "settings")) {
      const value = section.settings[field.target.key];
      if (field.type === "select" || field.type === "segmented") assert.ok(field.options.some((option) => option.value === value), `${field.id}: starter "${value}" is an option`);
      if (field.type === "toggle") assert.equal(typeof value, "boolean");
    }
    const visible = schema.visibleFields(section, "boutique", theme);
    assert.equal(new Set(visible.map((field) => field.id)).size, visible.length, "no duplicate fields");
    assert.deepEqual(full.addable.map((entry) => entry.id), layout.LAYOUT_ELEMENT_TYPES.map((type) => `element:${type}`), "the Element tab adds layout elements");
  }
  for (const element of layout.LAYOUT_ELEMENTS) {
    assert.ok(en[`ed.${element.label}`] && en[`ed.${element.description}`], `${element.type}: translatable`);
    const made = layout.newLayoutElement(element.type, "x");
    assert.deepEqual(layout.normaliseLayoutElement(made, "x"), made, `${element.type}: starter content is already clean`);
  }
  // Boutique-only: the classic Insert catalogue never offers it, and the boutique groups are unchanged.
  const all = (renderer) => logic.insertOptions({ renderer, target: "template", existingKinds: [] }).flatMap((group) => group.items.map((item) => item.kind));
  assert.ok(!all("classic").includes("layout-row") && !all("boutique").includes("layout-row"), "rows come from the Layout tab, not the section groups");
  const panel = read("../src/components/builder/editor/InsertPanel.tsx");
  assert.match(panel, /props\.renderer === "boutique" && props\.target === "template"/, "the Layout group shows for 2026 themes only");
  const builder = read("../src/components/builder/editor/Builder.tsx");
  assert.match(builder, /const canvasOverlay = renderer === "boutique" && editing && !phone;/, "the canvas inserter is hidden in previews and older templates");
  assert.match(builder, /slots=\{slots\}/);
  // The storefront draws rows through one hook, after the ready-made blocks.
  const storefront = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(storefront, /if \(section\.kind === LAYOUT_ROW_KIND\) \{/);
  assert.match(storefront, /const editing = live \|\| props\.demo \? undefined :/, "no editing controls on the live store or theme previews");
});

test("thumbnails: every section kind, ready-made block, layout preset and element has its own picture", () => {
  const source = read("../src/components/builder/editor/insert-thumbnails.tsx");
  const keys = new Set([...source.matchAll(/^ {2}"([a-z0-9:-]+)": </gm)].map((match) => match[1]));
  for (const item of logic.INSERT_CATALOG) assert.ok(keys.has(item.kind), `${item.kind} has a thumbnail`);
  for (const block of catalog.STORE_BLOCKS) assert.ok(keys.has(block.kind), `${block.kind} has a thumbnail`);
  for (const type of layout.LAYOUT_ELEMENT_TYPES) assert.ok(keys.has(`element:${type}`), `element ${type} has a thumbnail`);
  assert.match(source, /function LayoutPicture\(\{ presetId \}/, "column layouts are drawn from the presets themselves");
  assert.match(source, /const GENERIC = /, "anything else gets a generic picture");
  for (const key of keys) {
    const known = logic.INSERT_CATALOG.some((item) => item.kind === key) || layout.LAYOUT_ELEMENT_TYPES.some((type) => `element:${type}` === key);
    assert.ok(known, `${key}: no thumbnail for a kind that doesn't exist`);
  }
  // The Insert panel and the canvas inserter both draw thumbnails, not the generic "+" icon.
  const cards = read("../src/components/builder/editor/InsertCards.tsx");
  assert.match(cards, /<InsertThumb kind=\{item\.thumb\}/);
  assert.match(read("../src/components/builder/editor/InsertPanel.tsx"), /InsertCardGrid/);
  assert.match(read("../src/components/builder/editor/CanvasInserter.tsx"), /InsertCardGrid/);
  assert.match(read("../src/components/builder/editor/SectionsPanel.tsx"), /<SectionGlyph section=\{section\} \/>/, "the page layers list shows them too");
});
