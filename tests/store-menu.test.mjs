import test from "node:test";
import assert from "node:assert/strict";
import { readMenu, menuPageKeys, addMenuItems, indentMenuItem, outdentMenuItem, removeMenuItem, moveMenuItem, placeMenuItem, canIndentMenuItem, safeMenuUrl } from "../src/lib/storefront/menu.ts";

test("older stores: the page list becomes menu items", () => {
  const menu = readMenu({ navLinks: ["Home", "Products", "About", "shop"] });
  assert.deepEqual(menu.map((item) => item.ref), ["home", "products", "about"]);
  assert.deepEqual(menuPageKeys(menu), ["home", "products", "about"]);
});

test("saved menus are cleaned: bad links and unknown kinds dropped, one level of sub-items", () => {
  const menu = readMenu({ menu: [
    { id: "a", kind: "page", ref: "home", label: "" },
    { id: "b", kind: "link", url: "javascript:alert(1)", label: "Bad" },
    { id: "c", kind: "link", url: "instagram.com/rexi", label: "IG", children: [{ id: "d", kind: "page", ref: "about", label: "", children: [{ id: "e", kind: "page", ref: "faq", label: "" }] }] },
    { id: "f", kind: "weird", ref: "x", label: "" },
  ] });
  assert.deepEqual(menu.map((item) => item.id), ["a", "c"]);
  assert.equal(menu[1].url, "https://instagram.com/rexi");
  assert.equal(menu[1].children.length, 1);
  assert.equal(menu[1].children[0].children, undefined);
});

test("safe links", () => {
  assert.equal(safeMenuUrl("/about"), "/about");
  assert.equal(safeMenuUrl("javascript:alert(1)"), null);
  assert.equal(safeMenuUrl("data:text/html,x"), null);
  assert.equal(safeMenuUrl("mailto:hi@shop.ng"), "mailto:hi@shop.ng");
});

test("indent, outdent, move, remove like WordPress menus", () => {
  let menu = addMenuItems([], [{ kind: "page", ref: "home", label: "" }, { kind: "page", ref: "products", label: "" }, { kind: "category", ref: "lamps", label: "" }, { kind: "category", ref: "fans", label: "" }]);
  const [home, shop, lamps, fans] = menu.map((item) => item.id);
  assert.equal(canIndentMenuItem(menu, home), false);
  menu = indentMenuItem(menu, lamps);
  menu = indentMenuItem(menu, fans);
  assert.deepEqual(menu.map((item) => item.id), [home, shop]);
  assert.deepEqual(menu[1].children.map((item) => item.id), [lamps, fans]);
  assert.equal(canIndentMenuItem(menu, shop), false, "an item with sub-items stays top level");
  menu = moveMenuItem(menu, fans, -1);
  assert.deepEqual(menu[1].children.map((item) => item.id), [fans, lamps]);
  menu = outdentMenuItem(menu, fans);
  assert.deepEqual(menu.map((item) => item.id), [home, shop, fans]);
  assert.deepEqual(menu[2].children.map((item) => item.id), [lamps], "sub-items below go with it");
  menu = removeMenuItem(menu, fans);
  assert.deepEqual(menu.map((item) => item.id), [home, shop, lamps], "sub-items move up into its place");
  menu = placeMenuItem(menu, home, { parentId: shop, index: 0 });
  assert.deepEqual(menu.map((item) => item.id), [shop, lamps]);
  assert.deepEqual(menu[0].children.map((item) => item.id), [home]);
});
