// Rex in the chat can design the menus (edit_menu), build custom rows and columns (layout-row sections in its
// store plan), and start a whole-store build (start_store_build opens the build setup with the seller's brief).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plan = await import("../src/lib/ai/rex/studio-plan.ts");
const layout = await import("../src/components/storefront/boutique/blocks/layout-logic.ts");

const draft = () => ({
  templateId: "gbedu", templateName: "Gbedu", layoutFamily: "x", themeTokens: {}, updatedAt: "",
  pages: [{ id: "p", pageType: "home", title: "Home", slug: "home", sections: [
    { id: "header", kind: "header", visible: true, blocks: [] },
    { id: "products", kind: "featured-products", visible: true, blocks: [] },
    { id: "footer", kind: "footer", visible: true, blocks: [] },
  ] }],
});
const context = {
  storeName: "Shop", themeSnapshot: () => null, themeName: () => null,
  createSection: (kind) => (kind === layout.LAYOUT_ROW_KIND ? layout.newLayoutRowSection("row1") : { id: `${kind}-x`, kind, visible: true, blocks: [] }),
  allowedKinds: () => [layout.LAYOUT_ROW_KIND], reviewItems: [], isBoutique: () => true,
};

test("Rex builds a three-column row of elements after the products, cleaned like any saved row", () => {
  const result = plan.applyRexStudioPlan(draft(), plan.parseRexStudioPlan({ ops: [{
    action: "add", page: "home", kind: "layout-row", after: "products", preset: "3",
    columns: [
      [{ type: "icon-list", lines: "Fast delivery\nPay on delivery", icon: "truck" }],
      [{ type: "heading", text: "Why shop with us", level: "h3" }, { type: "image", imageUrl: "http://insecure.example/x.png" }],
      [{ type: "button", label: "Shop now", link: { type: "page", value: "products" } }, { type: "rocket" }],
      [{ type: "text", text: "a fourth column joins the last" }],
    ],
  }] }), context);
  const row = result.snapshot.pages[0].sections[2];
  assert.equal(row.kind, "layout-row");
  assert.equal(row.settings.preset, "3");
  const view = layout.normaliseLayoutRow(row);
  assert.equal(view.cells.length, 3);
  assert.equal(view.cells[0].elements[0].icon, "truck");
  assert.equal(view.cells[1].elements[1].imageUrl, "", "pictures must be https");
  assert.deepEqual(view.cells[2].elements.map((element) => element.type), ["button", "text"], "unknown element dropped; extra column folds into the last");
  assert.equal(new Set(view.cells.flatMap((cell) => cell.elements.map((element) => element.id))).size, 5, "unique element ids");
});

test("changing a row's preset keeps its elements", () => {
  const first = plan.applyRexStudioPlan(draft(), plan.parseRexStudioPlan({ ops: [{ action: "add", page: "home", kind: "layout-row", preset: "50-50", columns: [[{ type: "heading", text: "A" }], [{ type: "text", text: "B" }]] }] }), context);
  const id = first.snapshot.pages[0].sections.find((section) => section.kind === "layout-row").id;
  const second = plan.applyRexStudioPlan(first.snapshot, plan.parseRexStudioPlan({ ops: [{ action: "update", page: "home", kind: "layout-row", sectionId: id, preset: "1" }] }), context);
  const view = layout.normaliseLayoutRow(second.snapshot.pages[0].sections.find((section) => section.id === id));
  assert.deepEqual(view.cells[0].elements.map((element) => element.text), ["A", "B"]);
});

test("wiring: edit_menu and start_store_build tools, the build card and the Studio", () => {
  const tools = read("src/lib/ai/rex/tools.ts");
  assert.match(tools, /edit_menu: editMenu/);
  assert.match(tools, /start_store_build: startStoreBuild/);
  assert.match(tools, /withMenuDesign\(draft, designed\.design, navigationOf\(draft\)\)/);
  assert.match(tools, /saveRexChange\(store, draft, next, changes/, "menus are a draft version with undo");
  assert.match(read("src/app/api/ai/store-editor/menu/route.ts"), /designStoreMenu\(store, parsed\.data\)/, "the builder's menu Rex uses the same designer");
  assert.match(read("src/lib/ai/rex/cards.ts"), /type: "build"; brief: string; links: string\[\]; themeId: string \| null/);
  const studio = read("src/components/builder/rex/RexStudio.tsx");
  assert.match(studio, /card\.type === "build"/);
  assert.match(studio, /initialThemeId=\{setup\.themeId \?\? null\}/);
  assert.match(read("src/lib/ai/rex/studio.server.ts"), /\.\.\.STORE_BLOCK_KINDS, LAYOUT_ROW_KIND\]/);
  assert.match(read("src/lib/ai/rex/prompts.ts"), /Rows and columns \(2026 themes, kind "layout-row"\)/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(read(`shared/i18n/messages/builder/${lang}.ts`).includes('"rex.cd.openBuild":'), lang);
});
