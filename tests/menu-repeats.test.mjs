// Menus never repeat an item: the builder's pickers show what's already in the menu (and Select all skips it),
// addMenuItems skips repeats, and menus saved with repeats (e.g. MAXIIFY: the starter's Home…Cart added again with
// Select all, and Audio added twice) read without them (src/lib/storefront/menu.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = await import("../src/lib/storefront/menu.ts");

const page = (id, ref, label = "") => ({ id, kind: "page", ref, label });

test("a menu saved with repeats reads without them, keeping the first of each", () => {
  const saved = [
    page("page-home", "home"), page("page-products", "products"), page("page-new-in", "new-in"), page("page-about", "about"), page("page-contact", "contact"),
    { id: "a1", kind: "category", ref: "audio", label: "" }, { id: "a2", kind: "category", ref: "audio", label: "" },
    page("x1", "home"), page("x2", "products"), page("x3", "about"), page("x4", "contact"), page("x5", "cart"),
  ];
  const read = menu.readMenu({ menu: saved });
  assert.deepEqual(read.map((item) => `${item.kind}:${item.ref}`), ["page:home", "page:products", "page:new-in", "page:about", "page:contact", "category:audio", "page:cart"]);
  assert.equal(read[0].id, "page-home", "the first one stays");
});

test("deliberate repeats stay: a different name, or a repeat with its own dropdown", () => {
  const read = menu.readMenu({ menu: [
    page("a", "products"),
    page("b", "products", "Shop the sale"),
    { ...page("c", "products"), children: [{ id: "d", kind: "category", ref: "audio", label: "" }] },
  ] });
  assert.equal(read.length, 3);
});

test("adding skips what's already in the menu (sub-items too) and repeats within the batch", () => {
  const current = [page("h", "home"), { ...page("p", "products"), children: [{ id: "c", kind: "category", ref: "audio", label: "" }] }];
  const next = menu.addMenuItems(current, [
    { kind: "page", ref: "home", label: "" },
    { kind: "page", ref: "about", label: "" },
    { kind: "page", ref: "about", label: "" },
    { kind: "category", ref: "audio", label: "" },
    { kind: "link", url: "https://instagram.com/maxiify", label: "Instagram" },
  ]);
  assert.deepEqual(next.slice(2).map(menu.menuTarget), ["page:about", "link:https://instagram.com/maxiify"]);
  // Navigation's "Add item" placeholder may repeat on purpose.
  assert.equal(menu.addMenuItems(current, [{ kind: "page", ref: "home", label: "" }], { allowRepeats: true }).length, 3);
});

test("the builder's pickers mark items already in the menu and Select all skips them", () => {
  const field = read("src/components/builder/editor/MenuField.tsx");
  assert.match(field, /const inMenu = useMemo\(\(\) => menuTargets\(value\), \[value\]\);/);
  assert.match(field, /disabled=\{added\(option\.key\)\}/);
  assert.match(field, /addable\.map\(\(option\) => option\.key\)/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(read(`shared/i18n/messages/builder/${lang}.ts`).includes('"ed.In menu":'), lang);
});
