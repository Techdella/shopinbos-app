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

test("layout rows: drag and drop moves elements within and between columns", () => {
  const cols = (section) => layout.normaliseLayoutRow(section).cells.map((cell) => cell.elements.map((element) => element.id));
  const build = (columns) => {
    let row = layout.newLayoutRowSection("dnd", columns.length === 3 ? "3" : "50-50");
    columns.forEach((list, column) => list.forEach((id) => { row = layout.addLayoutElement(row, column, layout.newLayoutElement("text", id)); }));
    return row;
  };
  const row = build([["a", "b", "c", "d"], ["x"], []]);

  // Same column: toIndex is the gap as drawn, so moving down skips the element's own spot.
  assert.deepEqual(cols(layout.moveLayoutElement(row, "a", 0, 2))[0], ["b", "a", "c", "d"], "drop between b and c");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "a", 0, 4))[0], ["b", "c", "d", "a"], "drop at the end");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "d", 0, 0))[0], ["d", "a", "b", "c"], "drop at the top");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "c", 0, 1))[0], ["a", "c", "b", "d"], "moving up needs no adjustment");
  assert.equal(layout.moveLayoutElement(row, "b", 0, 1), row, "dropping just above itself changes nothing");
  assert.equal(layout.moveLayoutElement(row, "b", 0, 2), row, "dropping just below itself changes nothing");

  // Across columns, including an empty one.
  assert.deepEqual(cols(layout.moveLayoutElement(row, "b", 1, 0)), [["a", "c", "d"], ["b", "x"], []]);
  assert.deepEqual(cols(layout.moveLayoutElement(row, "b", 1, 1)), [["a", "c", "d"], ["x", "b"], []]);
  assert.deepEqual(cols(layout.moveLayoutElement(row, "x", 2, 0)), [["a", "b", "c", "d"], [], ["x"]], "an empty column takes a drop");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "x", 0, 2)), [["a", "b", "x", "c", "d"], [], []]);

  // Clamping and bad input.
  assert.deepEqual(cols(layout.moveLayoutElement(row, "a", 1, 99))[1], ["x", "a"], "an index past the end goes last");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "x", 0, -5))[0], ["x", "a", "b", "c", "d"], "a negative index goes first");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "a", 9, 0))[2], ["a"], "a column past the last is the last");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "x", -1, 1))[0], ["a", "x", "b", "c", "d"], "a negative column is the first");
  assert.deepEqual(cols(layout.moveLayoutElement(row, "x", 0.9, 1.7))[0], ["a", "x", "b", "c", "d"], "fractions are truncated");
  assert.equal(layout.moveLayoutElement(row, "nope", 1, 0), row, "an unknown id is a no-op");
  assert.equal(layout.moveLayoutElement(row, "a", Number.NaN, 0), row);
  assert.equal(layout.moveLayoutElement(row, "a", 1, Number.POSITIVE_INFINITY), row);

  // Nothing is lost, copied or renamed; the original isn't touched.
  const moved = layout.moveLayoutElement(row, "c", 2, 0);
  const all = cols(moved).flat();
  assert.deepEqual([...all].sort(), ["a", "b", "c", "d", "x"]);
  assert.equal(new Set(all).size, all.length, "ids stay unique");
  assert.deepEqual(layout.findLayoutElement(moved, "c").element, layout.findLayoutElement(row, "c").element, "the element keeps its content");
  assert.deepEqual(cols(row), [["a", "b", "c", "d"], ["x"], []], "the input section is unchanged");
  assert.deepEqual(moved.items.map((cell) => cell.id), row.items.map((cell) => cell.id), "columns keep their ids");

  // A full column refuses elements from elsewhere but still reorders its own.
  const full = build([Array.from({ length: layout.MAX_ELEMENTS_PER_COLUMN }, (_, i) => `f${i}`), ["y"]]);
  assert.equal(layout.moveLayoutElement(full, "y", 0, 0), full);
  assert.equal(layout.canMoveLayoutElementTo(full, "y", 0), false);
  assert.equal(layout.canMoveLayoutElementTo(full, "f1", 0), true);
  assert.equal(layout.canMoveLayoutElementTo(full, "f1", 1), true);
  assert.equal(layout.canMoveLayoutElementTo(full, "nope", 1), false);
  assert.deepEqual(cols(layout.moveLayoutElement(full, "f0", 0, 3))[0].slice(0, 3), ["f1", "f2", "f0"]);

  // The up / down buttons are the same move, one step at a time.
  assert.deepEqual(cols(layout.moveLayoutElement(row, "b", "down"))[0], ["a", "c", "b", "d"]);
  assert.deepEqual(cols(layout.moveLayoutElement(row, "b", "up"))[0], ["b", "a", "c", "d"]);
  assert.equal(layout.moveLayoutElement(row, "d", "down"), row);
});

test("layout rows: drop geometry picks the column and the gap under the pointer", () => {
  const side = [{ left: 0, top: 0, right: 100, bottom: 300 }, { left: 120, top: 0, right: 220, bottom: 80 }];
  assert.equal(layout.nearestDropColumn(side, 50, 10), 0);
  assert.equal(layout.nearestDropColumn(side, 150, 200), 1, "below a short column still targets it");
  assert.equal(layout.nearestDropColumn(side, 112, 10), 1, "in the gap: the nearer column");
  assert.equal(layout.nearestDropColumn([], 0, 0), -1);
  // Phones stack the columns, so the pointer's height decides.
  const stacked = [{ left: 0, top: 0, right: 390, bottom: 200 }, { left: 0, top: 214, right: 390, bottom: 260 }, { left: 0, top: 274, right: 390, bottom: 370 }];
  assert.equal(layout.nearestDropColumn(stacked, 100, 100), 0);
  assert.equal(layout.nearestDropColumn(stacked, 100, 240), 1);
  assert.equal(layout.nearestDropColumn(stacked, 100, 500), 2);
  // A 2 × 2 grid: the box in the pointer's column, on the nearer row.
  const grid = [{ left: 0, top: 0, right: 100, bottom: 100 }, { left: 120, top: 0, right: 220, bottom: 100 }, { left: 0, top: 120, right: 100, bottom: 220 }, { left: 120, top: 120, right: 220, bottom: 220 }];
  assert.equal(layout.nearestDropColumn(grid, 150, 50), 1);
  assert.equal(layout.nearestDropColumn(grid, 50, 200), 2);
  assert.equal(layout.nearestDropColumn(grid, 150, 112), 3, "between rows: the nearer box");
  assert.equal(layout.dropIndexAt([], 10), 0, "an empty column: the only gap");
  assert.equal(layout.dropIndexAt([50, 150, 250], 10), 0);
  assert.equal(layout.dropIndexAt([50, 150, 250], 160), 2);
  assert.equal(layout.dropIndexAt([50, 150, 250], 999), 3);
});

test("layout rows: drag and drop is wired into the canvas and the panel, never the live store", () => {
  const row = read("../src/components/storefront/boutique/blocks/LayoutRow.tsx");
  assert.match(row, /useColumnDrag\(/, "the canvas uses the shared drag hook");
  assert.match(row, /const canDrag = Boolean\(canEdit && editing\?\.onMoveElement\)/, "drag handles only while editing");
  assert.match(row, /data-drop-column=/);
  const hook = read("../src/components/storefront/boutique/blocks/useColumnDrag.ts");
  assert.match(hook, /event\.key === "Escape"/, "Escape cancels a drag");
  assert.match(hook, /pointercancel/, "touch cancels are handled");
  assert.match(hook, /nearestDropColumn\(/);
  assert.match(hook, /dropIndexAt\(/);
  const field = read("../src/components/builder/editor/LayoutColumnsField.tsx");
  assert.match(field, /useColumnDrag\(/, "the panel's lists share it");
  assert.match(field, /aria-label=\{t\("edk.moveToColumn"/, "keyboard users get a Move to column control");
  const builder = read("../src/components/builder/editor/Builder.tsx");
  assert.match(builder, /onMoveElement=\{editing \?/, "no dragging in theme previews or the store preview");
  assert.match(builder, /aria-live="polite"/, "moves are announced");
  const storefront = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(storefront, /const editing = live \|\| props\.demo \? undefined :/);
  for (const key of ["edk.movedTo", "edk.columnFull", "edk.moveToColumn", "ed.Move to", "ed.Drag to move"]) assert.ok(en[key], `${key} has English words`);
});

test("layout rows: elements move between rows / columns sections of a page in one change", () => {
  const cols = (section) => layout.normaliseLayoutRow(section).cells.map((cell) => cell.elements.map((element) => element.id));
  const build = (id, columns) => {
    let row = layout.newLayoutRowSection(id, columns.length === 3 ? "3" : columns.length === 1 ? "1" : "50-50");
    columns.forEach((list, column) => list.forEach((elementId) => { row = layout.addLayoutElement(row, column, layout.newLayoutElement("text", elementId)); }));
    return row;
  };
  const page = [node("hero", "hero-split"), build("r1", [["a", "b"], ["c"]]), node("story", "story-split"), build("r2", [["x"], []])];
  const snapshot = JSON.stringify(page);
  const byId = (list, id) => list.find((section) => section.id === id);

  // Into another row: removed from the first, inserted at the gap in the second, in one new page.
  let move = layout.moveElementAcrossRows(page, "r1", "b", "r2", 0, 0);
  assert.notEqual(move.sections, page);
  assert.equal(move.reason, undefined);
  assert.deepEqual([move.elementId, move.column, move.index], ["b", 0, 0]);
  assert.deepEqual(cols(byId(move.sections, "r1")), [["a"], ["c"]]);
  assert.deepEqual(cols(byId(move.sections, "r2")), [["b", "x"], []]);
  assert.equal(move.sections[0], page[0], "other sections are the same objects");
  assert.equal(move.sections[2], page[2]);
  assert.deepEqual(layout.findLayoutElement(byId(move.sections, "r2"), "b").element, layout.findLayoutElement(page[1], "b").element, "content comes along");
  assert.equal(JSON.stringify(page), snapshot, "the input page is untouched (undo keeps the old one)");

  move = layout.moveElementAcrossRows(page, "r1", "a", "r2", 1, 5);
  assert.deepEqual(cols(byId(move.sections, "r2")), [["x"], ["a"]], "an empty column takes it; indexes clamp");
  move = layout.moveElementAcrossRows(page, "r2", "x", "r1", 9, 1);
  assert.deepEqual([move.column, move.index], [1, 1], "a column past the last is the last");
  assert.deepEqual(cols(byId(move.sections, "r1")), [["a", "b"], ["c", "x"]]);
  assert.deepEqual(cols(byId(move.sections, "r2")), [[], []]);

  // The same section: moveLayoutElement's rules.
  move = layout.moveElementAcrossRows(page, "r1", "a", "r1", 1, 0);
  assert.deepEqual(cols(byId(move.sections, "r1")), [["b"], ["a", "c"]]);
  assert.deepEqual(cols(byId(move.sections, "r1")), cols(layout.moveLayoutElement(page[1], "a", 1, 0)));
  assert.equal(move.sections[3], page[3]);
  move = layout.moveElementAcrossRows(page, "r1", "a", "r1", 0, 1);
  assert.equal(move.sections, page, "dropping next to itself changes nothing");
  assert.equal(move.reason, "unchanged");

  // No-ops: the same array back, with a reason.
  for (const [args, why] of [
    [["nope", "a", "r2", 0, 0], "unknown source row"],
    [["r1", "a", "nope", 0, 0], "unknown target row"],
    [["r1", "a", "story", 0, 0], "not a rows / columns section"],
    [["r1", "zzz", "r2", 0, 0], "unknown element"],
    [["r1", "x", "r2", 0, 0], "the element is in another row"],
    [["r1", "a", "r2", Number.NaN, 0], "bad column"],
    [["r1", "a", "r2", 0, Number.POSITIVE_INFINITY], "bad index"],
  ]) {
    const result = layout.moveElementAcrossRows(page, ...args);
    assert.equal(result.sections, page, why);
    assert.equal(result.reason, "unknown", why);
    assert.equal(result.elementId, null, why);
  }

  // A full target column refuses, with nothing removed from the source.
  const fullRow = build("full", [Array.from({ length: layout.MAX_ELEMENTS_PER_COLUMN }, (_, i) => `f${i}`), []]);
  const withFull = [page[1], fullRow];
  move = layout.moveElementAcrossRows(withFull, "r1", "a", "full", 0, 0);
  assert.equal(move.sections, withFull);
  assert.equal(move.reason, "full");
  assert.equal(layout.canMoveElementAcrossRows(withFull, "r1", "a", "full", 0), false);
  assert.equal(layout.canMoveElementAcrossRows(withFull, "r1", "a", "full", 1), true);
  assert.equal(layout.canMoveElementAcrossRows(withFull, "r1", "nope", "full", 1), false);
  assert.equal(layout.canMoveElementAcrossRows(withFull, "r1", "a", "r1", 1), true);
  assert.deepEqual(cols(byId(layout.moveElementAcrossRows(withFull, "r1", "a", "full", 1, 0).sections, "full"))[1], ["a"]);
  assert.equal(layout.moveElementAcrossRows([fullRow], "full", "f0", "full", 0, 5).sections.length, 1, "a full column still reorders its own");

  // Ids stay unique on the page: a taken id gets -2, -3…, and the result says which.
  const clash = [build("p", [["dup"], []]), build("q", [["dup", "dup-2"]]), build("s", [["dup-3"]])];
  move = layout.moveElementAcrossRows(clash, "p", "dup", "q", 0, 2);
  assert.equal(move.elementId, "dup-4");
  assert.deepEqual(cols(byId(move.sections, "q")), [["dup", "dup-2", "dup-4"]]);
  assert.deepEqual(cols(byId(move.sections, "p")), [[], []]);
  const all = move.sections.flatMap((section) => cols(section).flat());
  assert.equal(new Set(all).size, all.length);
  assert.equal(layout.findLayoutElement(byId(move.sections, "q"), move.elementId).index, 2, "the returned id finds the element");
  // A column id of the target row counts as taken too.
  const cellClash = [build("p", [["q-col-1"]]), build("q", [[], []])];
  assert.equal(layout.moveElementAcrossRows(cellClash, "p", "q-col-1", "q", 1, 0).elementId, "q-col-1-2");
  // An id unique on the page is kept.
  assert.equal(layout.moveElementAcrossRows(clash, "s", "dup-3", "p", 1, 0).elementId, "dup-3");
});

test("layout rows: drag geometry across rows and the floating preview's position", () => {
  const rows = [{ left: 0, top: 0, right: 400, bottom: 200 }, { left: 0, top: 500, right: 400, bottom: 700 }, { left: 0, top: 710, right: 400, bottom: 900 }];
  assert.equal(layout.pickDropRow(rows, 100, 100, 0), 0);
  assert.equal(layout.pickDropRow(rows, 100, 600, 0), 1, "over another row: that row");
  assert.equal(layout.pickDropRow(rows, 100, 215, 1), 0, "just outside a row's edge still counts");
  assert.equal(layout.pickDropRow(rows, 100, 350, 2), 2, "over another kind of section: the own row");
  assert.equal(layout.pickDropRow(rows, 100, 705, 2), 2, "between touching rows: a tie keeps the own row");
  assert.equal(layout.pickDropRow(rows, 100, 702, 2), 1, "else the nearer row");
  assert.equal(layout.pickDropRow(rows, 900, 100, 1), 1, "far to the side: the own row");
  assert.equal(layout.pickDropRow([], 0, 0, 0), -1);
  assert.equal(layout.pickDropRow(rows, 100, 350, -1), 0, "an unknown own row falls back to the first");

  const size = { width: 200, height: 50 };
  const viewport = { width: 1000, height: 800 };
  assert.deepEqual(layout.dragPreviewPosition(100, 100, size, viewport), { left: 118, top: 118 }, "below and right of the pointer");
  assert.deepEqual(layout.dragPreviewPosition(900, 100, size, viewport), { left: 682, top: 118 }, "flips left at the right edge");
  assert.deepEqual(layout.dragPreviewPosition(100, 780, size, viewport), { left: 118, top: 712 }, "flips up at the bottom");
  assert.deepEqual(layout.dragPreviewPosition(5, 5, { width: 300, height: 300 }, { width: 200, height: 200 }), { left: 4, top: 4 }, "never off screen");
  assert.deepEqual(layout.dragPreviewPosition(100, 100, size, viewport, 0), { left: 100, top: 100 });
});

test("layout rows: cross-row drops and the drag preview are wired, builder only", () => {
  const row = read("../src/components/storefront/boutique/blocks/LayoutRow.tsx");
  assert.match(row, /acrossRows: true/, "canvas rows take drops from each other");
  assert.match(row, /data-drop-row=\{canDrag \? section\.id : undefined\}/, "only while editing");
  assert.match(row, /usePageColumnDrag\(\)/);
  assert.match(row, /<DragGhost /);
  const hook = read("../src/components/storefront/boutique/blocks/useColumnDrag.ts");
  assert.match(hook, /pickDropRow\(/);
  assert.match(hook, /dragPreviewPosition\(/);
  assert.match(hook, /requestAnimationFrame\(onFrame\)/, "the preview moves once per frame");
  assert.match(hook, /prefers-reduced-motion: reduce/);
  const ghost = read("../src/components/storefront/boutique/blocks/DragGhost.tsx");
  assert.match(ghost, /createPortal\(/, "in a portal, outside the scaled canvas frame");
  assert.match(ghost, /pointerEvents: "none"/);
  assert.match(ghost, /maxWidth: 240/);
  assert.match(ghost, /prefers-reduced-motion:no-preference/);
  assert.match(read("../src/components/builder/editor/Canvas.tsx"), /data-drop-scope=""/);
  const field = read("../src/components/builder/editor/LayoutColumnsField.tsx");
  assert.match(field, /<DragGhost /);
  assert.match(field, /edk\.rowNamed/, "Move to lists the other rows");
  assert.match(read("../src/components/builder/editor/Inspector.tsx"), /pageSections=\{props\.page\?\.sections\}/);
  const builder = read("../src/components/builder/editor/Builder.tsx");
  assert.match(builder, /moveElementAcrossRows\(/);
  assert.match(builder, /edk\.movedToRow/, "cross-row moves are announced");
  for (const key of ["edk.rowN", "edk.rowNamed", "edk.rowColumn", "edk.movedToRow", "ed.This row"]) assert.ok(en[key], `${key} has English words`);
});

test("layout rows: a refused move says why, so the builder never announces a move that didn't happen", () => {
  const build = (id, columns, extra = {}) => {
    let row = layout.newLayoutRowSection(id, columns.length === 1 ? "1" : "50-50");
    columns.forEach((list, column) => list.forEach((elementId) => { row = layout.addLayoutElement(row, column, layout.newLayoutElement("text", elementId)); }));
    return { ...row, ...extra };
  };
  const full = Array.from({ length: layout.MAX_ELEMENTS_PER_COLUMN }, (_, i) => `f${i}`);
  const page = [build("r1", [["a", "b"], []]), build("r2", [full, []])];
  const outcome = (...args) => layout.rowMoveOutcome(layout.moveElementAcrossRows(page, ...args));
  assert.equal(outcome("r1", "a", "r2", 1, 0), "moved");
  assert.equal(outcome("r1", "a", "r1", 1, 0), "moved", "within a row too");
  assert.equal(outcome("r1", "a", "r2", 0, 0), "full", "the target column filled up");
  assert.equal(outcome("r1", "a", "gone", 0, 0), "row-gone", "the target row was removed (an undo in between)");
  assert.equal(outcome("gone", "a", "r2", 1, 0), "row-gone", "the source row was removed");
  assert.equal(outcome("r1", "zzz", "r2", 1, 0), "element-gone", "the element was removed or moved meanwhile");
  assert.equal(outcome("r1", "a", "r1", 0, 1), "unchanged", "dropped where it was");
  assert.equal(outcome("r1", "a", "r2", Number.NaN, 0), "unchanged", "a bad column changes nothing");
  assert.equal(layout.moveElementAcrossRows(page, "r1", "zzz", "r2", 1, 0).missing, "element");
  assert.equal(layout.moveElementAcrossRows(page, "r1", "a", "gone", 1, 0).missing, "row");
  assert.equal(layout.moveElementAcrossRows(page, "r1", "a", "r2", 1, 0).missing, undefined);

  const builder = read("../src/components/builder/editor/Builder.tsx");
  assert.match(builder, /rowMoveOutcome\(result\)/, "moveElement checks the outcome before announcing");
  assert.match(builder, /options\?: \{ select\?: boolean; toSectionId\?: string \}\): boolean =>/, "moveElement says whether it moved");
  assert.match(builder, /edk\.rowGone/);
  assert.match(builder, /edk\.elementGone/);
  assert.match(builder, /edk\.movedToHiddenRow/, "a move into a hidden row says the row is hidden");
  assert.match(builder, /sectionsRef\.current/, "the move is checked against the page as it is when the drop lands");
  for (const key of ["edk.rowGone", "edk.elementGone", "edk.notMoved", "edk.movedToHiddenRow", "edk.hiddenRow", "ed.Other rows"]) assert.ok(en[key], `${key} has English words`);
});

test("layout rows: other rows as drop targets in the panel, hidden rows as drop strips on the canvas", () => {
  const build = (id, columns, extra = {}) => {
    let row = layout.newLayoutRowSection(id, columns.length === 1 ? "1" : columns.length === 4 ? "grid-2x2" : "50-50");
    columns.forEach((list, column) => list.forEach((elementId) => { row = layout.addLayoutElement(row, column, layout.newLayoutElement("text", elementId)); }));
    return { ...row, ...extra };
  };
  const full = Array.from({ length: layout.MAX_ELEMENTS_PER_COLUMN }, (_, i) => `f${i}`);
  const page = [
    node("hero", "hero-split"),
    build("r1", [["a"], []], { name: "Intro" }),
    build("r2", [full, ["x"]], { name: "" }),
    node("story", "story-split", { visible: false }),
    build("r3", [[], [], [], []], { name: "Secret", visible: false }),
  ];
  const targets = layout.otherRowDropTargets(page, "r1");
  assert.deepEqual(targets.map((row) => [row.id, row.n, row.name, row.hidden, row.presetId]), [
    ["r2", 2, "Columns", false, "50-50"],
    ["r3", 3, "Secret", true, "grid-2x2"],
  ], "numbered among all rows from the top, the dragged one's own row left out, hidden ones marked");
  assert.deepEqual(targets[0].columns, [{ index: 0, count: layout.MAX_ELEMENTS_PER_COLUMN, full: true }, { index: 1, count: 1, full: false }]);
  assert.equal(targets[1].columns.length, 4);
  assert.deepEqual(layout.otherRowDropTargets(page, "r3").map((row) => row.n), [1, 2]);
  assert.deepEqual(layout.otherRowDropTargets(null, "r1"), []);

  assert.equal(layout.isHiddenLayoutRow(page[4]), true);
  assert.equal(layout.isHiddenLayoutRow(page[3]), false, "only rows / columns sections");
  assert.equal(layout.isHiddenLayoutRow(page[1]), false);
  assert.deepEqual(ids(layout.drawnSections(page)), ["hero", "r1", "r2"], "the live store draws visible sections only");
  assert.deepEqual(ids(layout.drawnSections(page, true)), ["hero", "r1", "r2", "r3"], "the builder keeps hidden rows in their place");

  // Moving into a hidden row keeps it hidden.
  const moved = layout.moveElementAcrossRows(page, "r1", "a", "r3", 2, layout.MAX_ELEMENTS_PER_COLUMN);
  assert.equal(moved.sections.find((section) => section.id === "r3").visible, false);
  assert.deepEqual(layout.findLayoutElement(moved.sections.find((section) => section.id === "r3"), "a").cellIndex, 2);

  const storefront = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(storefront, /const hiddenRowDrops = !live && !props\.demo && Boolean\(props\.onMoveElement\);/, "never on the live store or previews");
  assert.match(storefront, /drawnSections\(page\?\.sections \?\? \[\], hiddenRowDrops\)/);
  assert.match(storefront, /<HiddenLayoutRowDrop /);
  const row = read("../src/components/storefront/boutique/blocks/LayoutRow.tsx");
  assert.match(row, /export function HiddenLayoutRowDrop/);
  assert.match(row, /if \(!drag\?\.moved\) return null;/, "invisible outside a drag");
  assert.match(row, /Hidden row: \{name\} — drop here/);
  assert.match(row, /data-drop-append=""/);
  const hook = read("../src/components/storefront/boutique/blocks/useColumnDrag.ts");
  assert.match(hook, /hasAttribute\("data-drop-append"\)/, "compact targets take drops at their end");
  assert.match(hook, /if \(sharePageRef\.current\) publishPageDrag\(next\)/, "a panel drag doesn't reach the canvas");
  const field = read("../src/components/builder/editor/LayoutColumnsField.tsx");
  assert.match(field, /otherRowDropTargets\(/);
  assert.match(field, /sharePage: false/);
  assert.match(field, /data-drop-scope=""/, "the panel's rows are their own drop scope");
  assert.match(field, /aria-label=\{tx\("Other rows"\)\}/);
  assert.match(field, /toSectionId: row \}/, "a drop on another row is the cross-row move");
  assert.match(field, /edk\.hiddenRow/, "Move to marks hidden rows");
  assert.match(field, /<DragGhost /);
});

test("layout rows: the inspector panel never scrolls sideways", () => {
  const field = read("../src/components/builder/editor/LayoutColumnsField.tsx");
  assert.doesNotMatch(field, /(^|\s|")-m[xlr]?-\d/, "no negative margins");
  assert.match(field, /className="mt-3 grid min-w-0 grid-cols-1 gap-3"/, "the column list is one shrinkable track, so a long product name can't widen it");
  assert.match(field, /grid min-w-0 grid-cols-4 gap-1\.5/, "preset tiles: four shrinkable tiles a row");
  assert.match(field, /<span className="min-w-0 truncate">\{name\}<\/span>/, "element names truncate");
  const inspector = read("../src/components/builder/editor/Inspector.tsx");
  assert.match(inspector, /overflow-y-auto overflow-x-hidden px-4 pb-4 pt-2/, "the panel body clips sideways overflow");
  assert.doesNotMatch(inspector, /scrollIntoView\(\{ block: "center"/, "focusing a field scrolls the panel up or down only");
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
