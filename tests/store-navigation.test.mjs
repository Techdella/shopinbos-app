// Home > Navigation and the builder share one source of truth: the menus in the builder snapshot's header and
// footer (src/lib/storefront/store-navigation.ts). Reading, writing, cleaning and the phone/footer fallbacks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nav = await import("../src/lib/storefront/store-navigation.ts");
const { pageChrome } = await import("../src/lib/store-templates/chrome.ts");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const header = (copy = {}, settings = {}) => ({ id: "header", kind: "header", name: "Header", visible: true, blocks: [{ id: "header-copy", type: "copy", content: { logoText: "Ada", cartLabel: "Bag", ...copy } }], settings: { layout: "split", ...settings } });
const footer = (copy = {}) => ({ id: "footer", kind: "footer", name: "Footer", visible: true, blocks: [{ id: "footer-copy", type: "copy", content: { summary: "Hand-made in Lagos", ...copy } }], settings: { showLogo: true } });
const hero = { id: "hero", kind: "hero-split", name: "Hero", visible: true, blocks: [{ id: "hero-copy", type: "copy", content: { title: "Hello" } }], settings: {} };

function snapshot({ headerCopy, headerSettings, footerCopy, templateId = "breeze" } = {}) {
  return {
    templateId,
    templateName: "Breeze",
    layoutFamily: "boutique",
    themeTokens: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { id: "home", pageType: "home", title: "Home", slug: "home", sections: [header(headerCopy, headerSettings), hero, footer(footerCopy)] },
      { id: "about", pageType: "about", title: "About", slug: "about", sections: [header(headerCopy, headerSettings), { ...hero, id: "story" }, footer(footerCopy)] },
    ],
  };
}

const page = (ref, label = "") => ({ id: `p-${ref}`, kind: "page", ref, label });

test("reads the header menu, phone menu and footer links from the builder's chrome", () => {
  const snap = snapshot({
    headerCopy: { menu: [page("home"), { ...page("products", "Shop all"), children: [{ id: "c1", kind: "category", ref: "bags", label: "" }] }], mobileMenuItems: [page("products")] },
    headerSettings: { mobileMenu: "sheet", mobileMenuSource: "custom" },
    footerCopy: { menu: [page("faq"), { id: "ig", kind: "link", url: "instagram.com/ada", label: "Instagram" }] },
  });
  const read = nav.readNavigation(snap, { boutique: true });
  assert.deepEqual(read.main.map((item) => item.ref), ["home", "products"]);
  assert.equal(read.main[1].children[0].ref, "bags", "dropdowns come through");
  assert.equal(read.mobileSource, "custom");
  assert.deepEqual(read.mobile.map((item) => item.ref), ["products"]);
  assert.equal(read.mobileStyle, "sheet");
  assert.deepEqual(read.footer.map((item) => item.kind), ["page", "link"]);
  assert.equal(read.footer[1].url, "https://instagram.com/ada", "links are cleaned (scheme added)");
  assert.ok(read.hasHeader && read.hasFooter);
});

test("older stores: navLinks become the menu, the phone uses the main menu, the footer shows the theme's usual links", () => {
  const boutique = nav.readNavigation(snapshot({ headerCopy: { navLinks: ["home", "products", "about"] } }), { boutique: true });
  assert.deepEqual(boutique.main.map((item) => item.ref), ["home", "products", "about"]);
  assert.equal(boutique.mobileSource, "main");
  assert.equal(boutique.mobileStyle, "drawer");
  assert.deepEqual(boutique.footer.map((item) => item.ref), ["products", "faq", "about", "contact"]);
  assert.equal(boutique.footer[1].label, "Delivery and FAQ", "same words the boutique footer shows");

  const classic = nav.readNavigation(snapshot({ headerCopy: { navLinks: ["home", "products", "faq"] }, templateId: "velour" }));
  assert.deepEqual(classic.footer.map((item) => item.ref), ["home", "products", "faq"], "classic footers list the main menu's pages");

  const empty = nav.readNavigation(null);
  assert.equal(empty.hasHeader, false);
  assert.equal(empty.hasFooter, false);
});

test("writing puts the menus into every page's header and footer and leaves everything else alone", () => {
  const before = snapshot({ headerCopy: { navLinks: ["home"] } });
  const menus = {
    main: [page("home"), page("about", "Our story")],
    mobileSource: "custom",
    mobile: [page("about")],
    mobileStyle: "fullscreen",
    footer: [{ ...page("contact"), children: [page("faq")] }],
  };
  const after = nav.writeNavigation(before, menus, new Date("2026-02-02T00:00:00.000Z"));
  assert.equal(after.updatedAt, "2026-02-02T00:00:00.000Z");
  for (const entry of after.pages) {
    const [top, bottom] = pageChrome(entry);
    const copy = top.blocks[0].content;
    assert.deepEqual(copy.menu, menus.main);
    assert.deepEqual(copy.navLinks, ["home", "about"], "navLinks kept in step for older readers (checkout header)");
    assert.deepEqual(copy.mobileMenuItems, menus.mobile);
    assert.equal(copy.logoText, "Ada", "other header copy is kept");
    assert.equal(top.settings.layout, "split", "other header settings are kept");
    assert.equal(top.settings.mobileMenu, "fullscreen");
    assert.equal(top.settings.mobileMenuSource, "custom");
    assert.deepEqual(bottom.blocks[0].content.menu.map((item) => item.ref), ["contact", "faq"], "footer is flat: sub-items move up");
    assert.equal(bottom.blocks[0].content.summary, "Hand-made in Lagos");
  }
  assert.deepEqual(after.pages[0].sections[1], before.pages[0].sections[1], "body sections untouched");
  assert.deepEqual(before.pages[0].sections[0].blocks[0].content, { logoText: "Ada", cartLabel: "Bag", navLinks: ["home"] }, "the input is not mutated");

  // Round trip: what was written reads back the same.
  const back = nav.readNavigation(after, { boutique: true });
  assert.equal(nav.navigationFingerprint(back), nav.navigationFingerprint({ ...menus, footer: nav.flattenMenu(menus.footer) }));
});

test("a header without a copy block gets one; sections lists without chrome come back unchanged", () => {
  const bare = { id: "h", kind: "header", name: "Header", visible: true, blocks: [], settings: {} };
  const [written] = nav.writeNavigationToSections([bare], { main: [page("home")], mobileSource: "main", mobile: [], mobileStyle: "drawer", footer: [] });
  assert.equal(written.blocks[0].type, "copy");
  assert.deepEqual(written.blocks[0].content.navLinks, ["home"]);
  const body = [hero];
  assert.equal(nav.writeNavigationToSections(body, { main: [], mobileSource: "main", mobile: [], mobileStyle: "drawer", footer: [] }), body);
});

test("the form's JSON is cleaned: unsafe links dropped, unknown values reset, footer flat", () => {
  assert.equal(nav.parseNavigationInput(null), null);
  assert.equal(nav.parseNavigationInput([1]), null);
  const parsed = nav.parseNavigationInput({
    main: [page("home"), { id: "x", kind: "link", url: "javascript:alert(1)", label: "Bad" }, { id: "y", kind: "nope" }],
    mobileSource: "weird",
    mobile: "not a list",
    mobileStyle: "spin",
    footer: [{ ...page("about"), children: [page("faq")] }],
  });
  assert.deepEqual(parsed.main.map((item) => item.id), ["p-home"]);
  assert.equal(parsed.mobileSource, "main");
  assert.deepEqual(parsed.mobile, []);
  assert.equal(parsed.mobileStyle, "drawer");
  assert.deepEqual(parsed.footer.map((item) => item.ref), ["about", "faq"]);
});

test("phone and footer readers: null means 'use the usual menu'", () => {
  assert.equal(nav.readMobileMenu({ mobileMenuItems: [page("home")] }, { mobileMenuSource: "main" }), null);
  assert.equal(nav.readMobileMenu({ mobileMenuItems: [page("home")] }, {}), null);
  assert.deepEqual(nav.readMobileMenu({ mobileMenuItems: [page("home")] }, { mobileMenuSource: "custom" }).map((item) => item.ref), ["home"]);
  assert.deepEqual(nav.readMobileMenu({}, { mobileMenuSource: "custom" }), [], "custom with nothing picked: an empty phone menu");
  assert.equal(nav.readFooterMenu({ summary: "x" }), null);
  assert.deepEqual(nav.readFooterMenu({ menu: [] }), [], "an emptied footer stays empty");
  assert.deepEqual(nav.menuLabels([page("home"), page("about", "Our story"), page("gone")], (item) => (item.ref === "home" ? "Home" : "")), ["Home", "Our story"]);
});

test("the storefront renderers, builder and Navigation page all read the same data", () => {
  for (const file of ["../src/components/storefront/boutique/BoutiqueStorefront.tsx", "../src/components/storefront/boutique/BoutiquePageFrame.tsx", "../src/components/storefront/boutique/BoutiqueProductPage.tsx", "../src/components/storefront/TemplateStorefrontSurface.tsx"]) {
    const src = read(file);
    assert.match(src, /readMobileMenu\(/, `${file} honours the phone menu`);
    assert.match(src, /readFooterMenu\(/, `${file} honours the footer links`);
  }
  assert.match(read("../src/components/storefront/StoreMenu.tsx"), /<StoreBrandMark[^>]*background=\{colors\.panel\}/, "the phone menu shows the logo for its own background");
  assert.match(read("../src/app/actions/workspace.ts"), /saveStoreNavigation\(/);
  assert.doesNotMatch(read("../src/app/home/navigation/page.tsx"), /split\(","\)/, "no more comma lists");
  const schema = read("../src/components/builder/editor/section-schema.ts");
  assert.match(schema, /mobileMenuSource/);
  assert.match(schema, /FOOTER_LINKS\(/);
});
