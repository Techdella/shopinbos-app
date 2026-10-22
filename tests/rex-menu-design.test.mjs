// Rex designing menus in the builder (src/lib/storefront/menu-design.ts): only what the store has, only its own
// pictures, the preview written into every header, and the saved change. Plus: previews are free, applying costs
// credits, and the builder opens on the menus from Home › Menus.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const d = await import("../src/lib/storefront/menu-design.ts");
const nav = await import("../src/lib/storefront/store-navigation.ts");

const catalog = {
  pages: ["home", "products", "about", "contact"],
  categories: [{ slug: "lamps", name: "Lamps", image: "https://cdn.example.com/lamp.jpg" }, { slug: "audio", name: "Audio", image: null }],
  products: [{ id: "p1", name: "Smart Lamp", image: "https://cdn.example.com/p1.jpg" }],
  content: [{ ref: "blog", name: "Blog" }, { ref: "blog/lamp-guide", name: "Lamp guide" }],
};

test("Rex's menu keeps only real pages, categories, products and content, and the store's own pictures", () => {
  const design = d.cleanMenuDesign({
    menuStyle: "mega",
    mobileStyle: "sheet",
    main: [
      { label: "Home", kind: "page", ref: "home" },
      { label: "Shop", kind: "page", ref: "products", children: [
        { label: "Lamps", kind: "category", ref: "lamps", image: "c:lamps" },
        { label: "Smart Lamp", kind: "product", ref: "p1", image: "https://evil.example.com/x.jpg" },
        { label: "Ghost", kind: "category", ref: "nope" },
      ] },
      { label: "Blog", kind: "content", ref: "blog" },
      { label: "Careers", kind: "page", ref: "careers" },
      { label: "Bad", kind: "link", url: "javascript:alert(1)" },
    ],
    footer: [{ label: "Lamp guide", kind: "content", ref: "blog/lamp-guide" }],
  }, catalog, { menuStyle: "classic", mobileStyle: "drawer" });
  assert.equal(design.menuStyle, "mega");
  assert.equal(design.mobileStyle, "sheet");
  assert.deepEqual(design.main.map((item) => item.label), ["Home", "Shop", "Blog"]);
  const shop = design.main[1];
  assert.deepEqual(shop.children.map((child) => [child.label, child.image ?? null]), [["Lamps", "https://cdn.example.com/lamp.jpg"], ["Smart Lamp", null]]);
  assert.ok(design.main.every((item) => item.id));
  assert.deepEqual(design.footer.map((item) => item.ref), ["blog/lamp-guide"]);
});

test("an unusable answer gives no design, and unknown styles keep the current ones", () => {
  assert.equal(d.cleanMenuDesign({ main: [{ label: "X", kind: "page", ref: "nowhere" }] }, catalog, { menuStyle: "pills", mobileStyle: "drawer" }), null);
  const design = d.cleanMenuDesign({ menuStyle: "neon", main: [{ label: "Home", kind: "page", ref: "home" }] }, catalog, { menuStyle: "pills", mobileStyle: "fullscreen" });
  assert.equal(design.menuStyle, "pills");
  assert.equal(design.mobileStyle, "fullscreen");
  assert.equal(design.footer, null);
});

test("the preview writes the menu and style into every header, and only changed sections are saved", () => {
  const header = (id) => ({ id, kind: "header", name: "Header", visible: true, settings: { menuStyle: "classic" }, blocks: [{ id: `${id}-copy`, type: "copy", content: { menu: [] } }] });
  const snapshot = {
    templateId: "x", templateName: "X", themeTokens: {}, updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { pageType: "home", title: "Home", sections: [header("h1"), { id: "hero", kind: "hero-split", name: "Hero", visible: true, blocks: [] }] },
      { pageType: "about", title: "About", sections: [header("h2")] },
    ],
  };
  const design = d.cleanMenuDesign({ menuStyle: "mega", main: [{ label: "Shop", kind: "page", ref: "products" }] }, catalog, { menuStyle: "classic", mobileStyle: "drawer" });
  const current = nav.readNavigation(snapshot);
  const preview = d.withMenuDesign(snapshot, design, current);
  for (const page of preview.pages) {
    const h = page.sections.find((section) => section.kind === "header");
    assert.equal(h.settings.menuStyle, "mega");
    assert.equal(h.blocks[0].content.menu[0].ref, "products");
  }
  assert.equal(d.headerMenuStyle(preview), "mega");
  const ops = d.changedSectionOps(snapshot, preview);
  assert.deepEqual(ops.map((op) => `${op.pageType}:${op.sectionId}`), ["home:h1", "about:h2"]);
  assert.ok(ops.every((op) => op.op === "update-section"));
});

test("menu items can carry their own picture (https only)", async () => {
  const menu = await import("../src/lib/storefront/menu.ts");
  const items = menu.readMenu({ menu: [{ id: "a", kind: "page", ref: "home", label: "", image: "https://cdn.example.com/a.jpg" }, { id: "b", kind: "page", ref: "about", label: "", image: "http://x/y.jpg" }] });
  assert.equal(items[0].image, "https://cdn.example.com/a.jpg");
  assert.equal(items[1].image, undefined);
  assert.match(read("src/components/storefront/StoreMenu.tsx"), /shown && item\.image \? \{ \.\.\.shown, image: item\.image \}/);
});

test("Rex's builder changes are free previews; applying one takes credits", () => {
  assert.match(read("src/app/api/ai/store-editor/route.ts"), /meterAiPreview\(user\.id, "text"\)/);
  assert.doesNotMatch(read("src/app/api/ai/store-editor/route.ts"), /meterAi\(user\.id/);
  assert.match(read("src/app/api/ai/store-editor/menu/route.ts"), /meterAiPreview\(user\.id, "text"\)/);
  assert.match(read("src/app/api/ai/store-editor/apply/route.ts"), /meterAiCharged\(user\.id, "text", 1, "store_design"\)/);
  assert.match(read("shared/ai-credits.ts"), /store_design: 3/);
  const panel = read("src/components/builder/editor/RexPanel.tsx");
  assert.match(panel, /\/api\/ai\/store-editor\/apply/);
  assert.doesNotMatch(panel.slice(0, panel.indexOf("async function apply")), /props\.applyOps\(/, "nothing is saved before the seller applies");
});

test("Home › Menus opens the store builder (not the set-up wizard), on the header or with Rex on the menus", () => {
  const page = read("src/app/home/navigation/page.tsx");
  assert.match(page, /href="\/seller\/store\/builder\?focus=header"/);
  assert.match(page, /href="\/seller\/store\/builder\?rex=menu"/);
  assert.doesNotMatch(page, /href="\/builder"/);
  assert.match(read("src/app/seller/store/builder/page.tsx"), /initialRexTopic=\{rexTopic\} initialFocus=\{focus\}/);
});

test("the seller's photo shows on their messages to Rex", () => {
  assert.match(read("src/components/builder/ChipBuilder.tsx"), /userAvatarUrl \? \(/);
  assert.match(read("src/components/builder/rex/RexChat.tsx"), /<SellerAvatar \{\.\.\.you\} \/>/);
  assert.match(read("src/components/builder/editor/RexPanel.tsx"), /props\.you\?\.avatarUrl/);
});

test("the menu can have its own colours over the theme's, set by the seller or by Rex", async () => {
  const menu = await import("../src/lib/storefront/menu.ts");
  const colors = menu.readMenuColors({ menuTextColor: "#FFFFFF", menuBarColor: "#0e2a38", menuAccentColor: "red", menuPanelColor: "#111111" });
  assert.deepEqual(colors, { text: "#ffffff", bar: "#0e2a38", panel: "#111111" });
  assert.equal(menu.readMenuColors({ menuStyle: "mega" }), null);
  const base = { ink: "#222222", muted: "#777777", accent: "#ff6600", accentText: "#ffffff", panel: "#ffffff", panelInk: "#222222", border: "#eeeeee" };
  const merged = menu.withMenuColors(base, colors);
  assert.equal(merged.ink, "#ffffff");
  assert.equal(merged.bar, "#0e2a38");
  assert.equal(merged.ownText, true);
  assert.equal(merged.accent, "#ff6600", "colours it doesn't set stay the theme's");
  assert.equal(menu.withMenuColors(base, null), base);
  assert.equal(menu.readableOn("#ffffff"), "#111111");
  assert.equal(menu.readableOn("#0e2a38"), "#ffffff");

  const snapshot = { templateId: "x", templateName: "X", themeTokens: {}, updatedAt: "", pages: [{ pageType: "home", title: "Home", sections: [{ id: "h", kind: "header", name: "Header", visible: true, settings: { menuStyle: "classic", menuBarColor: "#000000" }, blocks: [] }] }] };
  const themed = d.cleanMenuDesign({ main: [{ label: "Home", kind: "page", ref: "home" }], colors: { text: "#FAF7F1", panel: "#0E2A38", accent: "nope" } }, catalog, { menuStyle: "classic", mobileStyle: "drawer" });
  assert.deepEqual(themed.colors, { text: "#faf7f1", panel: "#0e2a38" });
  const settings = d.withMenuDesign(snapshot, themed, nav.readNavigation(snapshot)).pages[0].sections[0].settings;
  assert.equal(settings.menuTextColor, "#faf7f1");
  assert.equal(settings.menuPanelColor, "#0e2a38");
  assert.equal(settings.menuBarColor, undefined, "Rex's colours replace the set");
  const back = d.cleanMenuDesign({ main: [{ label: "Home", kind: "page", ref: "home" }], colors: "theme" }, catalog, { menuStyle: "classic", mobileStyle: "drawer" });
  assert.equal(d.withMenuDesign(snapshot, back, nav.readNavigation(snapshot)).pages[0].sections[0].settings.menuBarColor, undefined);
  const keep = d.cleanMenuDesign({ main: [{ label: "Home", kind: "page", ref: "home" }] }, catalog, { menuStyle: "classic", mobileStyle: "drawer" });
  assert.equal(d.withMenuDesign(snapshot, keep, nav.readNavigation(snapshot)).pages[0].sections[0].settings.menuBarColor, "#000000");

  for (const path of ["src/components/storefront/TemplateStorefrontSurface.tsx", "src/components/storefront/boutique/BoutiqueStorefront.tsx", "src/components/storefront/boutique/BoutiquePageFrame.tsx", "src/components/storefront/boutique/BoutiqueProductPage.tsx"]) {
    assert.match(read(path), /readMenuColors\(/, path);
  }
  assert.match(read("src/components/builder/editor/section-schema.ts"), /title: "Menu colours"/);
});
