// Portal QA fixes: pure helpers behind flows found broken while walking the app.
import test from "node:test";
import assert from "node:assert/strict";

const { fillMissingPageSeo } = await import("../src/lib/store-templates/seo-defaults.ts");
const boutique = await import("../src/lib/store-templates/boutique-themes.ts");

test("a freshly picked theme gets search titles and descriptions so Publish isn't blocked", () => {
  const manifest = boutique.BOUTIQUE_TEMPLATE_MANIFESTS.find((entry) => entry.id === "breeze");
  assert.ok(manifest.seedPages.some((page) => !page.seo?.metaDescription), "themes ship blank descriptions");
  const filled = fillMissingPageSeo({ pages: manifest.seedPages }, "Chioma's Collections");
  for (const page of filled.pages) {
    assert.ok(page.seo.metaTitle.trim().length > 0 && page.seo.metaTitle.length <= 70, `${page.pageType} title`);
    assert.ok(page.seo.metaDescription.trim().length > 0 && page.seo.metaDescription.length <= 180, `${page.pageType} description`);
  }
  const home = filled.pages.find((page) => page.pageType === "home");
  assert.match(home.seo.metaDescription, /Chioma's Collections/);
});

test("SEO the seller wrote is kept exactly, including extra fields", () => {
  const page = { id: "p", pageType: "about", title: "About", slug: "about", sections: [], seo: { metaTitle: "Our story ", metaDescription: "Made in Lagos", focusKeyword: "adire" } };
  const [out] = fillMissingPageSeo({ pages: [page] }, "Ada").pages;
  assert.deepEqual(out.seo, { metaTitle: "Our story ", metaDescription: "Made in Lagos", focusKeyword: "adire" });
});

test("pages with no SEO at all get defaults from the page title and store name", () => {
  const [out] = fillMissingPageSeo({ pages: [{ id: "x", pageType: "contact", title: "Contact", slug: "contact", sections: [] }] }, "  ").pages;
  assert.equal(out.seo.metaTitle, "Contact | our store");
  assert.equal(out.seo.metaDescription, "Get in touch with our store.");
  const [long] = fillMissingPageSeo({ pages: [{ id: "y", pageType: "home", title: "Home", slug: "", sections: [], seo: { metaTitle: "", metaDescription: "" } }] }, "A".repeat(90)).pages;
  assert.ok(long.seo.metaTitle.length <= 70 && long.seo.metaDescription.length <= 180);
});
