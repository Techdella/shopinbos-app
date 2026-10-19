// Seller-facing builder guidance never reaches shoppers (shared/placeholder-copy.ts), and store renames carry the
// new name into page text (shared/store-rename.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const p = await import("../shared/placeholder-copy.ts");
const r = await import("../shared/store-rename.ts");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("placeholder copy: builder guidance is recognised, real shopper copy is not", () => {
  for (const text of [
    "Joanna's Store is getting ready. Add your logo, products, contact details, and policies before publishing.",
    "Ada Fabrics is getting ready. Add your logo, products, contact details, and policies before publishing.",
    "Add your shipping or payment message here.",
    "  add your shipping   or payment message here. ",
    "Add your phone, email, address, and response details here.",
    "Add your returns message here",
    "Write your delivery promise here.",
    "Add content here. Share your values, sourcing, process, or customer promise.",
    "Click to replace image",
    "Tell shoppers something useful here.",
    "Edit this theme copy to match your brand.",
  ]) assert.equal(p.isPlaceholderCopy(text), true, text);
  assert.equal(p.isPlaceholderCopy("Rexi is getting ready. Add your logo, products, contact details, and policies before publishing.", "Rexi"), true);
  for (const text of [
    "",
    "   ",
    null,
    42,
    "Handmade leather bags from Lagos, delivered nationwide.",
    "Free delivery in Lagos on orders over ₦30,000",
    "Add your name at checkout and we'll engrave it for free.",
    "Here for every season.",
    "Joanna's Store",
  ]) assert.equal(p.isPlaceholderCopy(text), false, String(text));

  assert.equal(p.shopperCopy("  Free delivery this week  "), "Free delivery this week");
  assert.equal(p.shopperCopy("Add your shipping or payment message here."), "");
  assert.equal(p.shopperCopy(undefined), "");
});

test("placeholder copy: the live footer falls back to the store description, then the tagline, else nothing", () => {
  const legacy = "Ada is getting ready. Add your logo, products, contact details, and policies before publishing.";
  assert.equal(p.footerSummaryForShoppers("Leather goods, made in Lagos.", { name: "Ada", description: "Desc" }), "Leather goods, made in Lagos.", "the seller's own line wins");
  assert.equal(p.footerSummaryForShoppers(legacy, { name: "Ada", description: "Bags and belts.", tagline: "Carry well" }), "Bags and belts.");
  assert.equal(p.footerSummaryForShoppers("", { name: "Ada", description: "  ", tagline: "Carry well" }), "Carry well");
  assert.equal(p.footerSummaryForShoppers(legacy, { name: "Ada" }), "", "nothing rather than guidance");
  assert.equal(p.brandTagline({ tagline: " Carry well " }), "Carry well");
  assert.equal(p.brandTagline(null), "");
  assert.equal(p.brandTagline([]), "");
});

test("placeholder copy: saved snapshots are blanked in place, keys and real copy untouched, idempotent", () => {
  const snapshot = {
    templateId: "blank",
    pages: [{ pageType: "home", seo: { metaTitle: "Ada" }, sections: [
      { kind: "announcement-bar", blocks: [{ type: "copy", content: { text: "Add your shipping or payment message here." } }] },
      { kind: "hero-split", blocks: [{ type: "copy", content: { title: "Welcome", body: "Add content here." } }], items: [{ title: "Click to replace image", color: "#16302B" }] },
      { kind: "footer", blocks: [{ type: "copy", content: { summary: "Ada is getting ready. Add your logo, products, contact details, and policies before publishing.", columns: ["Browse"] } }] },
    ] }],
  };
  const cleaned = p.blankPlaceholderCopy(snapshot, "Ada");
  const home = cleaned.pages[0];
  assert.equal(home.sections[0].blocks[0].content.text, "");
  assert.equal(home.sections[1].blocks[0].content.title, "Welcome");
  assert.equal(home.sections[1].blocks[0].content.body, "");
  assert.equal(home.sections[1].items[0].title, "");
  assert.equal(home.sections[1].items[0].color, "#16302B");
  assert.equal(home.sections[2].blocks[0].content.summary, "");
  assert.deepEqual(home.sections[2].blocks[0].content.columns, ["Browse"]);
  assert.equal(home.seo.metaTitle, "Ada");
  assert.equal(snapshot.pages[0].sections[0].blocks[0].content.text, "Add your shipping or payment message here.", "the input isn't mutated");
  assert.equal(p.blankPlaceholderCopy(cleaned, "Ada"), null, "a second run changes nothing");
  assert.equal(p.blankPlaceholderCopy({ a: "Real copy" }), null);
});

test("placeholder copy: templates no longer seed seller guidance into shopper-facing text", () => {
  const literals = (path) => [...read(path).matchAll(/"((?:[^"\\\n]|\\.)*)"|`([^`$\n]*)`/g)].map((m) => m[1] ?? m[2]);
  for (const path of [
    "../src/lib/store-templates/editor.ts",
    "../src/lib/store-templates/http.ts",
    "../src/lib/store-templates/html-converter.ts",
    "../src/lib/store-templates/boutique-themes.ts",
    "../src/lib/store-templates/catalog.ts",
    "../src/lib/store-templates/themes/seed-resolver.ts",
    "../src/components/storefront/boutique/blocks/layout-logic.ts",
  ]) {
    const seeded = literals(path).filter((text) => p.isPlaceholderCopy(text));
    assert.deepEqual(seeded, [], `${path} seeds ${seeded.join(" | ")}`);
  }
  const editor = read("../src/lib/store-templates/editor.ts");
  assert.doesNotMatch(editor, /is getting ready/, "the blank footer summary starts empty");
  assert.match(editor, /block\("blank-announcement-copy", "copy", \{ text: "" \}\)/, "the blank announcement starts empty");
});

test("placeholder copy: live renderers hide guidance; the builder shows it as an input hint", () => {
  const chrome = read("../src/components/storefront/boutique/BoutiqueChrome.tsx");
  assert.match(chrome, /const text = shopperCopy\(raw\);/, "the boutique announcement bar never shows guidance");
  assert.match(chrome, /footerSummaryForShoppers\(summary, \{ name: store\.name, description: store\.description, tagline: brandTagline\(store\.brandSettings\) \}\)/);
  const boutique = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(boutique, /shopperCopy\(copyOf\(announcementSection\)\.text, store\.name\) \|\| shopper\.announcement/);
  assert.match(boutique, /legalLinks=\{policyLinks\} editor=\{!live && !props\.demo\}/, "the builder footer gets the edit-me hint");
  for (const path of ["../src/components/storefront/boutique/BoutiquePageFrame.tsx", "../src/components/storefront/boutique/BoutiqueProductPage.tsx"]) {
    assert.match(read(path), /shopperCopy\(copyOf\(announcementSection\)\.text, store\.name\) \|\| shopper\.announcement/, path);
  }
  assert.match(read("../src/components/storefront/boutique/blocks/LayoutRow.tsx"), /if \(!editor && isPlaceholderCopy\(words\)\) return null;/);
  const classic = read("../src/components/storefront/TemplateStorefrontSurface.tsx");
  assert.match(classic, /isPlaceholderCopy\(writtenAnnouncement, store\.name\)/);
  assert.match(classic, /mode === "live"\n\s+\? footerSummaryForShoppers\(/);
  assert.match(classic, /\[data-surface-mode="live"\] \.tsf-editor-only\{display:none\}/, "image placeholder labels are builder-only");
  assert.match(classic, /const text = !isEditor && guidance \? "" : raw;/);

  const schema = read("../src/components/builder/editor/section-schema.ts");
  assert.match(schema, /area\("summary", "Footer summary", \{ placeholder: FOOTER_SUMMARY_PLACEHOLDER/);
  assert.match(schema, /area\("summary", "About text", \{ placeholder: FOOTER_SUMMARY_PLACEHOLDER/);
  const en = read("../shared/i18n/messages/builder/en.ts");
  for (const key of ["e.g. Handmade leather bags from Lagos, delivered nationwide.", "e.g. Free delivery in Lagos on orders over ₦30,000", "Leave empty to show your store description."]) {
    assert.ok(en.includes(`"ed.${key}": "${key}"`), key);
  }
  const script = read("../scripts/clean-placeholder-copy.mjs");
  assert.match(script, /blankPlaceholderCopy/, "the clean-up script uses the same list");
  assert.match(script, /--dry-run/);
});

test("store rename: renameInContent replaces the old name as a whole phrase in text values only", () => {
  const content = {
    id: "Rexi-hero",
    templateId: "Rexi",
    slug: "rexi",
    seo: { metaTitle: "Rexi", metaDescription: "Shop Rexi online. Rexi's best bags." },
    sections: [
      { kind: "hero-split", blocks: [{ id: "b1", type: "copy", content: { eyebrow: "Rexi", title: "Welcome to Rexi!", body: "Rexington is a town. rexi is lowercase. Rexis plural. Rexi-made goods.", primaryCta: "Shop now" } }] },
      { kind: "footer", blocks: [{ type: "copy", content: { summary: "Rexi: leather from Lagos." } }], items: [{ imageUrl: "https://cdn/Rexi.png", href: "/Rexi", label: "About Rexi" }] },
      { kind: "image", settings: { images: ["Rexi"], backgroundColor: "Rexi" } },
    ],
    Rexi: "Rexi",
  };
  const out = r.renameInContent(content, "Rexi", "Bola Bags");
  assert.equal(out.id, "Rexi-hero", "ids untouched");
  assert.equal(out.templateId, "Rexi");
  assert.equal(out.slug, "rexi");
  assert.equal(out.seo.metaTitle, "Bola Bags");
  assert.equal(out.seo.metaDescription, "Shop Bola Bags online. Bola Bags's best bags.");
  const hero = out.sections[0].blocks[0].content;
  assert.equal(hero.eyebrow, "Bola Bags");
  assert.equal(hero.title, "Welcome to Bola Bags!");
  assert.equal(hero.body, "Rexington is a town. rexi is lowercase. Rexis plural. Bola Bags-made goods.", "word boundaries and case respected");
  assert.equal(out.sections[1].blocks[0].content.summary, "Bola Bags: leather from Lagos.");
  assert.equal(out.sections[1].items[0].imageUrl, "https://cdn/Rexi.png", "URLs untouched");
  assert.equal(out.sections[1].items[0].href, "/Rexi", "links untouched");
  assert.equal(out.sections[1].items[0].label, "About Bola Bags");
  assert.deepEqual(out.sections[2].settings.images, ["Rexi"], "image lists untouched");
  assert.equal(out.sections[2].settings.backgroundColor, "Rexi");
  assert.ok("Rexi" in out, "keys are never renamed");
  assert.equal(out.Rexi, "Bola Bags");
  assert.equal(content.seo.metaTitle, "Rexi", "the input isn't mutated");
  assert.equal(r.renameInContent(out, "Rexi", "Bola Bags"), null, "nothing left to change");
});

test("store rename: possessive defaults, short and common names, literal text, no-ops", () => {
  const content = { seo: { metaTitle: "Ada's Store", metaDescription: "Shop Ada’s Store online." }, footer: "Ada's Storefront" };
  const out = r.renameInContent(content, "Ada's Store", "Ada Leather");
  assert.equal(out.seo.metaTitle, "Ada Leather");
  assert.equal(out.seo.metaDescription, "Shop Ada Leather online.", "a curly apostrophe matches the default name");
  assert.equal(out.footer, "Ada's Storefront", "whole phrase only");

  assert.equal(r.renameInContent({ t: "Go to the Store" }, "Store", "Bola"), null, "common words are left alone");
  assert.equal(r.renameInContent({ t: "My Shop rocks" }, "My Shop", "Bola"), null);
  assert.equal(r.renameInContent({ t: "AB and more" }, "AB", "Bola"), null, "names under 3 characters are left alone");
  assert.equal(r.renameInContent({ t: "Rexi" }, "Rexi", "Rexi"), null, "same name");
  assert.equal(r.renameInContent({ t: "Rexi" }, "Rexi", "  "), null, "no new name");
  assert.equal(r.renameInContent({ t: "Rexi" }, "  ", "Bola"), null);
  assert.equal(r.renameInContent({ t: "Rexi" }, "Rexi", "$& $1").t, "$& $1", "replacement text is literal");
  assert.equal(r.renameInContent({ t: "Shop A.B. Co. now" }, "A.B. Co.", "Bola").t, "Shop Bola now", "regex characters in names are literal");
  assert.equal(r.renameInContent({ t: "AxB Co" }, "A.B Co", "Bola"), null);
  assert.equal(r.renameInText("https://rexi.store/Rexi", "Rexi", "Bola"), "https://rexi.store/Rexi");
  assert.equal(r.canRenameInText("Kemi"), true);
  assert.equal(r.canRenameInText("Boutique"), false);
});

test("store rename: settings, API and brand kit renames carry the new name into editor snapshots and StorePage rows", () => {
  const server = read("../src/lib/store-address.server.ts");
  assert.match(server, /export function clearStaleShopNames\(brandSettings: unknown, oldName: string, newName = ""\)/);
  assert.match(server, /const cleared = clearStaleLogoText\(content, oldName\);\n\s+const renamed = newName\.trim\(\) \? renameInContent\(cleared \?\? content, oldName, newName\) : null;/, "header shop names still clear first");
  assert.match(server, /renameInText\(page\.title, oldName, newName\)/, "page titles follow too");
  for (const path of ["../src/lib/seller-settings.server.ts", "../src/app/actions/workspace.ts"]) {
    const source = read(path);
    assert.match(source, /clearStaleShopNames\(store\.brandSettings, store\.name, name\)/, path);
    assert.match(source, /clearStaleShopNamesInStorePages\(store\.id, store\.name, name\)/, path);
  }
  const route = read("../src/app/api/app/store/route.ts");
  assert.match(route, /clearStaleShopNames\(updateData\.brandSettings \?\? store\.brandSettings, store\.name, String\(updateData\.name\)\)/);
  assert.match(route, /clearStaleShopNamesInStorePages\(store\.id, store\.name, String\(updateData\.name\)\)/);
});
